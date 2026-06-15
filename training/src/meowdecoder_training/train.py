"""Training entry point: load → augment → train (grouped CV) → calibrate → save.

Run:  python -m meowdecoder_training.train --config config.yaml
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import torch
import yaml
from sklearn.metrics import f1_score
from sklearn.model_selection import StratifiedGroupKFold
from torch import nn
from torch.utils.data import DataLoader, Dataset

from .dataset import Sample, class_weights, discover, load_wav_mono16k
from .features import log_mel
from .model import MeowCNN, CatVocalizationModel


class MelDataset(Dataset):
    def __init__(self, samples: list[Sample], classes: list[str], cfg: dict, augment: bool):
        self.samples = samples
        self.classes = classes
        self.cfg = cfg
        self.augment = augment

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        s = self.samples[idx]
        pcm = load_wav_mono16k(s.path, self.cfg["audio"]["sample_rate"])
        if self.augment:
            pcm = _augment(pcm, self.cfg)
        mel = log_mel(
            pcm,
            sample_rate=self.cfg["audio"]["sample_rate"],
            frame_size=self.cfg["audio"]["frame_size"],
            hop_size=self.cfg["audio"]["hop_size"],
            n_mels=self.cfg["audio"]["n_mels"],
            n_frames=self.cfg["audio"]["n_frames"],
            f_min=self.cfg["audio"]["f_min"],
        )
        x = torch.from_numpy(mel).unsqueeze(0)  # (1, n_mels, n_frames)
        y = self.classes.index(s.label)
        return x, y


def _augment(pcm: np.ndarray, cfg: dict) -> np.ndarray:
    rng = np.random.default_rng()
    # Time shift
    shift = int(rng.integers(-cfg["audio"]["sample_rate"] // 10, cfg["audio"]["sample_rate"] // 10))
    pcm = np.roll(pcm, shift)
    # Additive noise at a random SNR
    lo, hi = cfg["augment"]["noise_snr_db"]
    snr = rng.uniform(lo, hi)
    sig_power = np.mean(pcm**2) + 1e-9
    noise_power = sig_power / (10 ** (snr / 10))
    pcm = pcm + rng.normal(0, np.sqrt(noise_power), size=pcm.shape).astype(np.float32)
    return pcm.astype(np.float32)


def train(config_path: str) -> None:
    cfg = yaml.safe_load(Path(config_path).read_text())
    classes: list[str] = cfg["classes"]
    torch.manual_seed(cfg["train"]["seed"])

    processed = Path("data/processed")
    samples = discover(processed, classes)
    if not samples:
        raise SystemExit(
            "No samples found in data/processed/. Run scripts/prepare_catmeows.py first."
        )

    labels = np.array([classes.index(s.label) for s in samples])
    groups = np.array([s.cat_id for s in samples])
    weights = torch.tensor(class_weights(samples, classes))

    device = "cuda" if torch.cuda.is_available() else "cpu"
    skf = StratifiedGroupKFold(n_splits=cfg["train"]["val_folds"], shuffle=True,
                               random_state=cfg["train"]["seed"])

    fold_f1: list[float] = []
    best_state = None
    best_f1 = -1.0

    for fold, (tr, va) in enumerate(skf.split(samples, labels, groups)):
        train_ds = MelDataset([samples[i] for i in tr], classes, cfg, augment=True)
        val_ds = MelDataset([samples[i] for i in va], classes, cfg, augment=False)
        train_dl = DataLoader(train_ds, batch_size=cfg["train"]["batch_size"], shuffle=True)
        val_dl = DataLoader(val_ds, batch_size=cfg["train"]["batch_size"])

        # Phase 1: Train head (warmup)
        model = CatVocalizationModel(n_classes=len(classes), freeze_base=True).to(device)
        
        # Optimizer with higher LR for head
        opt_warmup = torch.optim.AdamW(model.parameters(), lr=cfg["train"]["lr"],
                                weight_decay=cfg["train"]["weight_decay"])
        loss_fn = nn.CrossEntropyLoss(weight=weights.to(device))

        patience = cfg["train"]["early_stopping_patience"]
        
        print(f"[fold {fold}] Phase 1: Warmup (frozen base)")
        _train_loop(model, train_dl, val_dl, opt_warmup, loss_fn, device, len(classes),
                    epochs=10, patience=patience)
                    
        # Phase 2: Unfreeze and fine-tune all layers with small LR
        print(f"[fold {fold}] Phase 2: Fine-Tuning (unfrozen base)")
        for param in model.parameters():
            param.requires_grad = True
            
        opt_finetune = torch.optim.AdamW(model.parameters(), lr=cfg["train"]["lr"] * 0.1,
                                weight_decay=cfg["train"]["weight_decay"])
                                
        fold_best = _train_loop(model, train_dl, val_dl, opt_finetune, loss_fn, device, len(classes),
                    epochs=cfg["train"]["epochs"] - 10, patience=patience)

        if fold_best > best_f1:
            best_f1 = fold_best
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
        print(f"[fold {fold}] best macro-F1 = {fold_best:.3f}")
        fold_f1.append(fold_best)

    print(f"CV macro-F1: {np.mean(fold_f1):.3f} ± {np.std(fold_f1):.3f}")

    Path("artifacts").mkdir(exist_ok=True)
    torch.save(
        {"state_dict": best_state, "classes": classes, "config": cfg},
        "artifacts/model.pt",
    )
    print(f"Saved best model (macro-F1={best_f1:.3f}) → artifacts/model.pt")


def _train_loop(model: nn.Module, train_dl: DataLoader, val_dl: DataLoader, opt: torch.optim.Optimizer,
                loss_fn: nn.Module, device: str, n_classes: int, epochs: int, patience: int) -> float:
    stall = 0
    best_f1 = -1.0
    for epoch in range(epochs):
        model.train()
        for x, y in train_dl:
            opt.zero_grad()
            loss = loss_fn(model(x.to(device)), y.to(device))
            loss.backward()
            opt.step()

        f1 = _evaluate(model, val_dl, device, n_classes)
        if f1 > best_f1:
            best_f1 = f1
            stall = 0
        else:
            stall += 1
            if stall >= patience:
                break
    return best_f1

def _evaluate(model: nn.Module, dl: DataLoader, device: str, n_classes: int) -> float:
    model.eval()
    preds, gts = [], []
    with torch.no_grad():
        for x, y in dl:
            logits = model(x.to(device))
            preds.extend(logits.argmax(1).cpu().tolist())
            gts.extend(y.tolist())
    return float(f1_score(gts, preds, average="macro", labels=list(range(n_classes)), zero_division=0))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.yaml")
    train(ap.parse_args().config)
