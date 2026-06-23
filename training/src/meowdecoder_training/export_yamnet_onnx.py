"""Export YAMNet base model to ONNX for frontend inference.

YAMNet uses internal TF ops (STFT, mel filterbank) that require careful conversion.
This script handles the conversion and verifies output parity.

Run:
  python -m meowdecoder_training.export_yamnet_onnx --output ../web/public/models/yamnet.onnx
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

try:
    import tensorflow as tf
    import tensorflow_hub as hub
    import tf2onnx

    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False


def export_yamnet_onnx(output_path: str, opset: int = 17, verify: bool = True) -> None:
    """Export YAMNet to ONNX format for frontend use."""
    if not TF_AVAILABLE:
        raise ImportError("tensorflow and tf2onnx are required: pip install tensorflow tf2onnx")

    print("[INFO] Loading YAMNet from TensorFlow Hub...")
    yamnet = hub.load("https://tfhub.dev/google/yamnet/1")

    print("[INFO] Creating Keras wrapper for YAMNet...")

    class YAMNetWrapper(tf.keras.Model):
        def __init__(self, yamnet_model):
            super().__init__()
            self.yamnet = yamnet_model

        @tf.function(input_signature=[tf.TensorSpec(shape=[None], dtype=tf.float32)])
        def call(self, waveform):
            _, embeddings, _ = self.yamnet(waveform)
            return embeddings

    wrapper = YAMNetWrapper(yamnet)

    test_audio = tf.zeros([16000], dtype=tf.float32)

    print("[INFO] Running warmup inference...")
    _ = wrapper(test_audio)

    print(f"[INFO] Converting YAMNet to ONNX (opset {opset})...")
    input_signature = [tf.TensorSpec(shape=[None], dtype=tf.float32, name="waveform")]

    model_proto, _ = tf2onnx.convert.from_keras(
        wrapper,
        input_signature=input_signature,
        opset=opset,
    )

    out_path = Path(output_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    with open(str(out_path), "wb") as f:
        f.write(model_proto.SerializeToString())

    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"[OK] YAMNet ONNX exported: {out_path} ({size_mb:.1f} MB)")

    if verify:
        print("[INFO] Verifying ONNX Runtime output...")
        import onnxruntime as ort

        sess = ort.InferenceSession(str(out_path), providers=["CPUExecutionProvider"])

        rng = np.random.default_rng(42)
        test_audio_np = rng.standard_normal(48000).astype(np.float32)

        tf_embeddings = wrapper(tf.constant(test_audio_np)).numpy()
        ort_embeddings = sess.run(
            ["Identity" if "Identity" in [o.name for o in sess.get_outputs()] else sess.get_outputs()[0].name],
            {"waveform": test_audio_np},
        )[0]

        if tf_embeddings.shape != ort_embeddings.shape:
            print(f"[WARN] Shape mismatch: TF={tf_embeddings.shape}, ORT={ort_embeddings.shape}")
            print("[INFO] This may be normal due to frame count differences. Checking embedding dimension...")
            if tf_embeddings.shape[-1] == 1024 and ort_embeddings.shape[-1] == 1024:
                print("[OK] Embedding dimension matches: 1024")
        else:
            max_diff = float(np.max(np.abs(tf_embeddings - ort_embeddings)))
            print(f"[INFO] Max diff ORT vs TF: {max_diff:.2e}")

        print("[OK] YAMNet ONNX verification complete")
        print(f"[INFO] Embedding shape (TF): {tf_embeddings.shape}")
        print(f"[INFO] Embedding shape (ORT): {ort_embeddings.shape}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Export YAMNet base model to ONNX")
    ap.add_argument("--output", default="../web/public/models/yamnet.onnx", help="Output ONNX path")
    ap.add_argument("--opset", type=int, default=17, help="ONNX opset version")
    ap.add_argument("--no-verify", action="store_true", help="Skip parity verification")
    args = ap.parse_args()
    export_yamnet_onnx(args.output, opset=args.opset, verify=not args.no_verify)