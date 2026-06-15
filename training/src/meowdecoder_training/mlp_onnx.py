"""Mean/std-pooled MLP over log-mel + manual ONNX graph builder.

Why an MLP over pooled features (vs the CNN in model.py): the synthetic
integration model must be tiny, fully reproducible without torch, and easy to
verify numerically across three implementations (NumPy ↔ ONNX Runtime ↔ the TS
test runner). The CNN remains the architecture for the real-data training run;
both export to the SAME manifest contract, so the frontend cannot tell them apart.
"""

from __future__ import annotations

import numpy as np

EPS = 1e-5


def pooled_features(mel: np.ndarray) -> np.ndarray:
    """(64, 96) standardized log-mel → (128,) [per-mel temporal mean ‖ std].

    std uses sqrt(var + EPS) to match the ONNX graph exactly.
    """
    mean = mel.mean(axis=1)
    var = (mel * mel).mean(axis=1) - mean * mean
    std = np.sqrt(np.maximum(var, 0.0) + EPS)
    return np.concatenate([mean, std]).astype(np.float32)


def init_weights(n_in: int, n_hidden: int, n_out: int, seed: int) -> dict[str, np.ndarray]:
    rng = np.random.default_rng(seed)
    return {
        "W1": (rng.standard_normal((n_in, n_hidden)) * np.sqrt(2.0 / n_in)).astype(np.float32),
        "b1": np.zeros(n_hidden, dtype=np.float32),
        "W2": (rng.standard_normal((n_hidden, n_out)) * np.sqrt(2.0 / n_hidden)).astype(
            np.float32
        ),
        "b2": np.zeros(n_out, dtype=np.float32),
    }


def forward(w: dict[str, np.ndarray], X: np.ndarray) -> np.ndarray:
    """Batch forward pass → softmax probabilities. Reference implementation."""
    h = np.maximum(X @ w["W1"] + w["b1"], 0.0)
    logits = h @ w["W2"] + w["b2"]
    logits -= logits.max(axis=1, keepdims=True)
    e = np.exp(logits)
    return e / e.sum(axis=1, keepdims=True)


def train_mlp(
    X: np.ndarray,
    y: np.ndarray,
    n_classes: int,
    *,
    n_hidden: int = 64,
    epochs: int = 400,
    lr: float = 2e-3,
    weight_decay: float = 1e-4,
    seed: int = 42,
) -> dict[str, np.ndarray]:
    """Full-batch Adam on softmax cross-entropy. Deterministic given the seed."""
    w = init_weights(X.shape[1], n_hidden, n_classes, seed)
    m = {k: np.zeros_like(v) for k, v in w.items()}
    v = {k: np.zeros_like(val) for k, val in w.items()}
    b1m, b2m = 0.9, 0.999
    onehot = np.eye(n_classes, dtype=np.float32)[y]

    for t in range(1, epochs + 1):
        h_pre = X @ w["W1"] + w["b1"]
        h = np.maximum(h_pre, 0.0)
        logits = h @ w["W2"] + w["b2"]
        logits -= logits.max(axis=1, keepdims=True)
        e = np.exp(logits)
        probs = e / e.sum(axis=1, keepdims=True)

        n = X.shape[0]
        d_logits = (probs - onehot) / n
        grads = {
            "W2": h.T @ d_logits + weight_decay * w["W2"],
            "b2": d_logits.sum(axis=0),
        }
        d_h = (d_logits @ w["W2"].T) * (h_pre > 0)
        grads["W1"] = X.T @ d_h + weight_decay * w["W1"]
        grads["b1"] = d_h.sum(axis=0)

        for k in w:
            m[k] = b1m * m[k] + (1 - b1m) * grads[k]
            v[k] = b2m * v[k] + (1 - b2m) * grads[k] ** 2
            mh = m[k] / (1 - b1m**t)
            vh = v[k] / (1 - b2m**t)
            w[k] = (w[k] - lr * mh / (np.sqrt(vh) + 1e-8)).astype(np.float32)

    return w


def build_onnx(w: dict[str, np.ndarray], n_mels: int, n_frames: int, path: str) -> None:
    """Builds the inference graph by hand (no torch dependency):

    input(b,1,M,T) → temporal mean/std pooling → concat(b,2M) → MLP → softmax.
    Input/output names ("input"/"probs") are part of the frozen contract.
    """
    from onnx import TensorProto, checker, helper, numpy_helper

    def init(name: str, arr: np.ndarray):
        return numpy_helper.from_array(arr.astype(np.float32), name=name)

    initializers = [
        init("W1", w["W1"]),
        init("b1", w["b1"]),
        init("W2", w["W2"]),
        init("b2", w["b2"]),
        init("eps", np.array([EPS], dtype=np.float32)),
        numpy_helper.from_array(np.array([3], dtype=np.int64), name="time_axis"),
    ]

    nodes = [
        helper.make_node("ReduceMean", ["input", "time_axis"], ["mean"], keepdims=1),
        helper.make_node("Mul", ["input", "input"], ["x2"]),
        helper.make_node("ReduceMean", ["x2", "time_axis"], ["ex2"], keepdims=1),
        helper.make_node("Mul", ["mean", "mean"], ["mu2"]),
        helper.make_node("Sub", ["ex2", "mu2"], ["var"]),
        helper.make_node("Add", ["var", "eps"], ["var_eps"]),
        helper.make_node("Sqrt", ["var_eps"], ["std"]),
        helper.make_node("Concat", ["mean", "std"], ["pooled"], axis=2),
        helper.make_node("Flatten", ["pooled"], ["flat"], axis=1),
        helper.make_node("MatMul", ["flat", "W1"], ["mm1"]),
        helper.make_node("Add", ["mm1", "b1"], ["pre1"]),
        helper.make_node("Relu", ["pre1"], ["h1"]),
        helper.make_node("MatMul", ["h1", "W2"], ["mm2"]),
        helper.make_node("Add", ["mm2", "b2"], ["logits"]),
        helper.make_node("Softmax", ["logits"], ["probs"], axis=1),
    ]

    graph = helper.make_graph(
        nodes,
        "meowdecoder_meanstd_mlp",
        inputs=[
            helper.make_tensor_value_info(
                "input", TensorProto.FLOAT, ["batch", 1, n_mels, n_frames]
            )
        ],
        outputs=[
            helper.make_tensor_value_info("probs", TensorProto.FLOAT, ["batch", w["b2"].shape[0]])
        ],
        initializer=initializers,
    )
    model = helper.make_model(
        graph,
        opset_imports=[helper.make_opsetid("", 18)],
        ir_version=9,
    )
    checker.check_model(model)
    with open(path, "wb") as f:
        f.write(model.SerializeToString())
