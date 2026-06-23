"""YAMNet-based classifier head for MeowDecoder 10-class transfer learning.

Architecture (sizes/dropout come from config.yaml: head_hidden_layers,
head_dropout). Default mirrors config: YAMNet (frozen) -> pooled embedding ->
Dense(384) -> BN -> ReLU -> Dropout(0.4) -> Dense(192) -> BN -> ReLU ->
Dropout(0.3) -> Dense(10) -> Softmax. learning_rate is passed in (config train.lr).
"""

from __future__ import annotations

import tensorflow as tf
from tensorflow.keras import layers, regularizers

NUM_CLASSES = 10
EMBEDDING_DIM = 1024


def build_yamnet_head(
    input_dim: int = EMBEDDING_DIM,
    num_classes: int = NUM_CLASSES,
    hidden_layers: list[int] | None = None,
    dropout_rates: list[float] | None = None,
    l2_reg: float = 1e-4,
    learning_rate: float = 1e-3,
) -> tf.keras.Model:
    """Build the Dense classifier head that sits on top of YAMNet embeddings.

    Parameters
    ----------
    input_dim : int
        Dimensionality of the (pooled) YAMNet embedding. 1024 for mean,
        2048 for mean_std.
    num_classes : int
        Number of output classes (default 11).
    hidden_layers : list[int] | None
        Sizes of hidden Dense layers. Defaults to [512, 256].
    dropout_rates : list[float] | None
        Dropout rates per hidden layer. Defaults to [0.4, 0.3].
    l2_reg : float
        L2 regularization coefficient for Dense kernels.
    learning_rate : float
        Adam learning rate (pass config train.lr).
    """
    if hidden_layers is None:
        hidden_layers = [512, 256]
    if dropout_rates is None:
        dropout_rates = [0.4, 0.3]

    if len(dropout_rates) != len(hidden_layers):
        raise ValueError(
            f"dropout_rates({len(dropout_rates)}) must match hidden_layers({len(hidden_layers)})"
        )

    inp = layers.Input(shape=(input_dim,), name="embedding_input")

    x = inp
    for i, (units, drop) in enumerate(zip(hidden_layers, dropout_rates), start=1):
        x = layers.Dense(
            units,
            kernel_regularizer=regularizers.l2(l2_reg),
            name=f"fc{i}",
        )(x)
        x = layers.BatchNormalization(name=f"bn{i}")(x)
        x = layers.Activation("relu", name=f"relu{i}")(x)
        x = layers.Dropout(drop, name=f"dropout{i}")(x)

    output = layers.Dense(num_classes, activation="softmax", name="softmax_logits")(x)

    model = tf.keras.Model(inputs=inp, outputs=output, name="MeowDecoder_YAMNet_Head")
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=learning_rate),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def build_yamnet_head_with_l2_map(
    input_dim: int = EMBEDDING_DIM,
    num_classes: int = NUM_CLASSES,
    hidden_layers: list[int] | None = None,
    dropout_rates: list[float] | None = None,
    l2_reg: float = 1e-4,
    learning_rate: float = 1e-3,
) -> tuple[tf.keras.Model, list[tf.keras.layers.Dense]]:
    """Build the head and return it along with the Dense layer references for fine-tuning.

    Returns
    -------
    tuple[tf.keras.Model, list[Dense]]
        The compiled model and references to the Dense layers (for gradual unfreezing).
    """
    if hidden_layers is None:
        hidden_layers = [512, 256]
    if dropout_rates is None:
        dropout_rates = [0.4, 0.3]

    inp = layers.Input(shape=(input_dim,), name="embedding_input")

    x = inp
    dense_layers = []
    for i, (units, drop) in enumerate(zip(hidden_layers, dropout_rates), start=1):
        d = layers.Dense(
            units,
            kernel_regularizer=regularizers.l2(l2_reg),
            name=f"fc{i}",
        )
        dense_layers.append(d)
        x = d(x)
        x = layers.BatchNormalization(name=f"bn{i}")(x)
        x = layers.Activation("relu", name=f"relu{i}")(x)
        x = layers.Dropout(drop, name=f"dropout{i}")(x)

    output_dense = layers.Dense(num_classes, activation="softmax", name="softmax_logits")
    dense_layers.append(output_dense)
    output = output_dense(x)

    model = tf.keras.Model(inputs=inp, outputs=output, name="MeowDecoder_YAMNet_Head")
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=learning_rate),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model, dense_layers
