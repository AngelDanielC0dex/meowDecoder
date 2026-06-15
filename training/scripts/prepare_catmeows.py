"""Convert the raw CatMeows dataset into the processed layout the loader expects.

CatMeows (Ntalampiras et al., Zenodo 4008297) encodes context in the filename:
  <CONTEXT>_<CATID>_<...>.wav  where CONTEXT ∈ {B: brushing, F: food, I: isolation}

All CatMeows samples are meows; context is NOT our vocalization class. For the
classifier we therefore map every CatMeows clip to `meow` and rely on other
sources (curated AudioSet clips) for hiss/growl/yowl/purr/trill. The cat id is
preserved as a filename prefix so splits never leak a cat across train/val.

Usage:
  python scripts/prepare_catmeows.py --raw data/raw/catmeows --out data/processed
"""

from __future__ import annotations

import argparse
import re
import uuid
from pathlib import Path

import soundfile as sf

from meowdecoder_training.dataset import load_wav_mono16k

CATMEOWS_RE = re.compile(r"^[BFI]_(?P<cat>[A-Z0-9]+)_", re.IGNORECASE)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True, type=Path)
    ap.add_argument("--out", default=Path("data/processed"), type=Path)
    ap.add_argument("--label", default="meow")
    args = ap.parse_args()

    dst = args.out / args.label
    dst.mkdir(parents=True, exist_ok=True)

    count = 0
    for wav in sorted(args.raw.glob("*.wav")):
        m = CATMEOWS_RE.match(wav.name)
        cat = m.group("cat") if m else "unk"
        pcm = load_wav_mono16k(wav)
        out_name = f"{cat}__{uuid.uuid4().hex[:8]}.wav"
        sf.write(dst / out_name, pcm, 16000)
        count += 1

    print(f"Wrote {count} files → {dst}")


if __name__ == "__main__":
    main()
