"""Export YAMNet classifier head to ONNX with INT8 quantization.

Produces:
  - meow_decoder_head.onnx         (FP32)
  - meow_decoder_head_int8.onnx    (INT8 quantized, ~4x smaller)
  - manifest.json                  (model contract for frontend)

Run:
  python -m meowdecoder_training.export_yamnet_head --config config.yaml
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import yaml

try:
    import tensorflow as tf
    import tf2onnx
    from onnxruntime.quantization import QuantType, quantize_dynamic

    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False

import onnxruntime as ort


def _check_tf():
    if not TF_AVAILABLE:
        raise ImportError(
            "TensorFlow and tf2onnx are required. "
            "Install with: pip install tensorflow tf2onnx"
        )


def export_head(config_path: str, output_dir: str = "../web/public/models") -> None:
    _check_tf()
    cfg = yaml.safe_load(Path(config_path).read_text())
    classes: list[str] = cfg["classes"]
    aggregation = cfg["yamnet"].get("aggregation", "mean")
    embedding_dim = cfg["yamnet"]["embedding_dim"]
    input_dim = embedding_dim * 2 if aggregation == "mean_std" else embedding_dim
    opset = cfg["export"]["opset"]
    model_version = cfg["export"]["model_version"]

    model = tf.keras.models.load_model("artifacts/best_head_model.keras")
    print(f"[INFO] Loaded model: {model.name}")
    print(f"[INFO]   Input shape: {model.input_shape}")
    print(f"[INFO]   Output shape: {model.output_shape}")

    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    fp32_path = out_dir / "meow_decoder_head.onnx"

    input_signature = [tf.TensorSpec(shape=(None, input_dim), dtype=tf.float32, name="embedding_input")]

    print(f"[INFO] Exporting to ONNX (opset {opset})...")
    model_proto, _ = tf2onnx.convert.from_keras(
        model,
        input_signature=input_signature,
        opset=opset,
    )
    with open(str(fp32_path), "wb") as f:
        f.write(model_proto.SerializeToString())
    print(f"[OK] FP32 ONNX exported: {fp32_path} ({fp32_path.stat().st_size / 1024:.1f} KB)")

    print("[INFO] Verifying ONNX Runtime parity vs Keras...")
    sess = ort.InferenceSession(str(fp32_path), providers=["CPUExecutionProvider"])
    rng = np.random.default_rng(42)
    test_input = rng.standard_normal((10, input_dim)).astype(np.float32)

    keras_out = model.predict(test_input, verbose=0)
    ort_out = sess.run(["softmax_logits"], {"embedding_input": test_input})[0]

    max_diff = float(np.max(np.abs(keras_out - ort_out)))
    tol = cfg["export"]["parity_tolerance"]
    print(f"[INFO] Max diff ORT vs Keras: {max_diff:.2e} (tolerance: {tol})")
    assert max_diff < tol, f"ONNX parity failed: {max_diff} > {tol}"
    print("[OK] ONNX parity verified")

    int8_path = out_dir / "meow_decoder_head_int8.onnx"
    if cfg["export"]["quantize_int8"]:
        print("[INFO] Applying INT8 dynamic quantization...")
        quantize_dynamic(
            str(fp32_path),
            str(int8_path),
            weight_type=QuantType.QInt8,
        )
        print(f"[OK] INT8 ONNX exported: {int8_path} ({int8_path.stat().st_size / 1024:.1f} KB)")

        size_orig = fp32_path.stat().st_size / 1024
        size_quant = int8_path.stat().st_size / 1024
        print(f"[INFO] Size FP32: {size_orig:.1f} KB | Size INT8: {size_quant:.1f} KB")
        print(f"[INFO] Reduction: {((1 - size_quant / size_orig) * 100):.1f}%")

        print("[INFO] Verifying INT8 vs FP32...")
        q_sess = ort.InferenceSession(str(int8_path), providers=["CPUExecutionProvider"])
        q_out = q_sess.run(["softmax_logits"], {"embedding_input": test_input})[0]
        q_diff = float(np.max(np.abs(keras_out - q_out)))
        print(f"[INFO] Max diff INT8 vs Keras: {q_diff:.2e}")
        assert q_diff < tol * 10, f"INT8 parity failed: {q_diff} > {tol * 10}"
        print("[OK] INT8 parity verified")

    smoothing = cfg.get("temporal_smoothing", {})

    manifest = {
        "schemaVersion": 2,
        "modelVersion": model_version,
        "architecture": "yamnet-transfer-learning",
        "headModel": "meow_decoder_head_int8.onnx" if cfg["export"]["quantize_int8"] else "meow_decoder_head.onnx",
        "yamnetModel": "yamnet.onnx",
        "classes": classes,
        "input": {
            "kind": "waveform",
            "sampleRate": cfg["audio"]["sample_rate"],
            "channels": 1,
            "embeddingDim": embedding_dim,
            "aggregation": aggregation,
            "yamnetFrameS": 0.96,
            "yamnetHopS": 0.48,
        },
        "output": {
            "kind": "softmax",
            "numClasses": len(classes),
            "tensorOutputName": "softmax_logits",
        },
        "smoothing": {
            "windowS": smoothing.get("window_s", 3.0),
            "emaAlpha": smoothing.get("ema_alpha", 0.3),
            "minConfidence": smoothing.get("min_confidence", 0.45),
        },
    }
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"[OK] Manifest written: {manifest_path}")

    print(f"\n[DONE] Export complete. Files in {out_dir}:")
    for f in sorted(out_dir.iterdir()):
        if f.is_file():
            print(f"  {f.name} ({f.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.yaml")
    ap.add_argument(
        "--output-dir",
        default="../web/public/models",
        help="Directory where the ONNX head, INT8 quantized head, and manifest are written. "
        "Defaults to web/public/models. Use a local path to avoid publishing drafts.",
    )
    args = ap.parse_args()
    export_head(args.config, output_dir=args.output_dir)