"""Compact CNN for log-mel vocalization classification (~300k params).

Decision (vs transfer learning from YAMNet/PANNs): with a small curated dataset
a tight CNN trains fast, exports to a 1–3 MB ONNX, and runs in-browser in a few
ms. If macro-F1 plateaus below target we escalate to a pretrained audio
backbone — but we start with the simplest model that can work.
"""

from __future__ import annotations

import torch
from torch import nn
from torchvision.models import mobilenet_v2, MobileNet_V2_Weights


class MeowCNN(nn.Module):
    def __init__(self, n_classes: int, n_mels: int = 64) -> None:
        super().__init__()

        def block(cin: int, cout: int) -> nn.Sequential:
            return nn.Sequential(
                nn.Conv2d(cin, cout, kernel_size=3, padding=1),
                nn.BatchNorm2d(cout),
                nn.ReLU(inplace=True),
                nn.MaxPool2d(2),
            )

        self.features = nn.Sequential(
            block(1, 16),
            block(16, 32),
            block(32, 64),
            nn.Dropout(0.25),
        )
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.head = nn.Sequential(
            nn.Linear(64, 64),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(64, n_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, 1, n_mels, n_frames)
        x = self.features(x)
        x = self.pool(x).flatten(1)
        return self.head(x)  # raw logits; softmax applied at export/eval time


class CatVocalizationModel(nn.Module):
    def __init__(self, n_classes: int, freeze_base: bool = True) -> None:
        super().__init__()
        
        # Load pre-trained MobileNetV2
        weights = MobileNet_V2_Weights.DEFAULT
        self.base_model = mobilenet_v2(weights=weights)
        
        # Adapt input to 1 channel instead of 3
        original_first_layer = self.base_model.features[0][0]
        self.base_model.features[0][0] = nn.Conv2d(
            1,
            original_first_layer.out_channels,
            kernel_size=original_first_layer.kernel_size,
            stride=original_first_layer.stride,
            padding=original_first_layer.padding,
            bias=False
        )
        
        # Freeze the base features if requested
        if freeze_base:
            for param in self.base_model.features.parameters():
                param.requires_grad = False
                
            # Keep the newly adapted first layer trainable
            for param in self.base_model.features[0][0].parameters():
                param.requires_grad = True

        # Replace classification head
        num_features = self.base_model.classifier[1].in_features
        self.base_model.classifier = nn.Sequential(
            nn.Dropout(p=0.2),
            nn.Linear(num_features, n_classes)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, 1, n_mels, n_frames)
        return self.base_model(x)
