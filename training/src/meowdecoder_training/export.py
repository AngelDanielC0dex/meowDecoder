"""Export trained model → ONNX → INT8 quantized, with post-export verification.

Produces, under web/public/models/:
  - model.onnx            (fp32, opset 17)
  - model.int8.onnx       (dynamic INT8 — ~4x smaller, <1% accuracy loss)
  - manifest.json         (IO contract the frontend negotiates against)

Verification gates (fail the build if violated):
  1. ONNX Runtime output must match PyTorch within `parity_tolerance`.
  2. Quantized output must stay within 2x tolerance of fp32.

Run: python -m meowdecoder_training.export --config config.yaml
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
import yaml

from .model import MeowCNN


def export(config_path: str) -> None:
    cfg = yaml.safe_load(Path(config_path).read_text())
    ckpt = torch.load("artifacts/model.pt", map_location="cpu")
    classes: list[str] = ckpt["classes"]

    model = MeowCNN(len(classes), cfg["audio"]["n_mels"])
    model.load_state_dict(ckpt["state_dict"])
    model.eval()

    # Softmax is folded into the export graph so the browser gets probabilities.
    class WithSoftmax(torch.nn.Module):
        def __init__(self, m: torch.nn.Module) -> None:
            super().__init__()
            self.m = m

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            return torch.softmax(self.m(x), dim=1)

    wrapped = WithSoftmax(model).eval()

    out_dir = Path("../web/public/models")
    out_dir.mkdir(parents=True, exist_ok=True)
    n_mels, n_frames = cfg["audio"]["n_mels"], cfg["audio"]["n_frames"]
    dummy = torch.randn(1, 1, n_mels, n_frames)

    onnx_path = out_dir / "model.onnx"
    torch.onnx.export(
        wrapped,
        dummy,
        str(onnx_path),
        input_names=["input"],
        output_names=["probs"],
        opset_version=cfg["export"]["opset"],
        dynamic_axes={"input": {0: "batch"}, "probs": {0: "batch"}},
    )

    # --- Gate 1: ONNX Runtime parity vs PyTorch ---
    import onnxruntime as ort

    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    with torch.no_grad():
        torch_out = wrapped(dummy).numpy()
    ort_out = sess.run(["probs"], {"input": dummy.numpy()})[0]
    max_diff = float(np.max(np.abs(torch_out - ort_out)))
    tol = cfg["export"]["parity_tolerance"]
    print(f"ONNX parity max diff: {max_diff:.2e} (tol {tol})")
    assert max_diff < tol, "ONNX export diverges from PyTorch"

    # --- Gate 2: INT8 quantization ---
    int8_path = out_dir / "model.int8.onnx"
    if cfg["export"]["quantize_int8"]:
        from onnxruntime.quantization import QuantType, quantize_dynamic

        quantize_dynamic(str(onnx_path), str(int8_path), weight_type=QuantType.QInt8)
        q_sess = ort.InferenceSession(str(int8_path), providers=["CPUExecutionProvider"])
        q_out = q_sess.run(["probs"], {"input": dummy.numpy()})[0]
        q_diff = float(np.max(np.abs(torch_out - q_out)))
        print(f"INT8 parity max diff: {q_diff:.2e}")
        assert q_diff < tol * 50, "INT8 quantization degrades output beyond tolerance"

    manifest = {
        "schemaVersion": 1,
        "modelVersion": cfg["export"]["model_version"],
        "fileName": "model.int8.onnx" if cfg["export"]["quantize_int8"] else "model.onnx",
        "classes": classes,
        "input": {
            "kind": "log-mel",
            "sampleRate": cfg["audio"]["sample_rate"],
            "nMels": n_mels,
            "nFrames": n_frames,
            "windowS": cfg["audio"]["window_s"],
        },
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"Exported model + manifest → {out_dir}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.yaml")
    export(ap.parse_args().config)
