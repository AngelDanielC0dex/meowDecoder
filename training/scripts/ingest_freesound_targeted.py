"""Targeted Freesound downloader for the weak MeowDecoder classes.

The existing scripts/ingest_freesound.py pulls a generic top-N per class.
This script instead drives Freesound's search per class with multiple
acoustic queries, so the language of the search matches the acoustic
event we want to capture (a "cat hiss" is not the same as a "cat meow",
and Freesound's metadata is messy enough that one query per class is
not enough).

Identity (cat_id) handling
--------------------------
The bug we already fixed with Freesound was grouping many clips under
one generic "freesound" cat. Here, `cat_id = fs_<uploader_id>`. Each
uploader is treated as one independent source. If a uploader has uploaded
two different cat sounds, they share a cat_id, which is the *correct*
behaviour for LOCO (one YouTube-style source = one "cat" group).

Setup
-----
  1. Apply for a Freesound API key at https://freesound.org/apiv2/apply/
  2. Set the env var (DO NOT hardcode it):

         setx FREESOUND_API_KEY "<your_key>"

     On PowerShell, use $env:FREESOUND_API_KEY = "..." for the current
     session, or [System.Environment]::SetEnvironmentVariable for
     persistence.

  3. Run:

         .venv\\Scripts\\python.exe scripts\\ingest_freesound_targeted.py ^
             --out data\\raw\\freesound --max-per-query 25

Output
------
  data/raw/freesound/<class>/<uploader>__<sound_id>.mp3

The companion script scripts/prepare_freesound.py (already in the repo)
converts these MP3 previews into the data/processed/<class>/<cat_id>__<uuid>.wav
layout the rest of the pipeline expects.

Rate limiting
-------------
Freesound allows 60 requests/minute for token auth. We respect that with
a single global lock and a sleep when we get close to the limit.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import Iterable

try:
    import requests
except ImportError as e:  # pragma: no cover
    raise SystemExit(
        "requests is required. Install with: pip install requests"
    ) from e

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

FREESOUND_API = "https://freesound.org/apiv2"
# Licenses are returned as URLs by the Freesound API, e.g.:
#   https://creativecommons.org/licenses/by/4.0/
#   http://creativecommons.org/publicdomain/zero/1.0/
#   https://creativecommons.org/licenses/by-nc/4.0/
# We match on the path component so we are robust to http/https and version
# bumps. CC-BY-NC is allowed by default (research use), excluded with
# --strict-licenses.
_LICENSE_PATTERNS_ALLOW = [
    "publicdomain/zero/",  # CC0
    "/licenses/by/",       # CC BY
]
_LICENSE_PATTERNS_NC = [
    "/licenses/by-nc/",    # CC BY-NC
]
# Freesound allows 60 req/min for token auth.
RATE_LIMIT_PER_MIN = 55  # stay safely under

# Acoustic queries per weak class. The labels here are keys into
# MeowDecoder's 10-class taxonomy; values are Freesound search queries
# that target that acoustic event from multiple angles.
TARGETS: dict[str, list[str]] = {
    "trinos": ["cat trill", "cat chirp", "cat greeting", "cat chatter", "cat chirping", "cat chittering"],
    "enfadado": ["cat growl", "cat growling", "cat snarl", "angry cat"],
    "llamada_madre": ["mother cat call", "cat calling kittens", "kitten meowing"],
    "advertencia": ["cat hiss", "cat hissing", "cat spitting"],
    "atencion": ["cat meow", "cat meowing", "kitten meow"],
    "llamada_apareamiento": ["cat caterwauling", "cat yowl", "cat mating call"],
    "feliz_contento": ["cat purring", "happy cat purr"],
    "descansando": ["cat purring rest", "sleeping cat purr"],
    "dolor": ["cat crying", "cat distress", "cat pain meow"],
    "pelea": ["cat fight", "cats fighting", "cat screeching"],
}


class FreesoundClient:
    """Thin wrapper around the Freesound REST API with a token bucket."""

    def __init__(self, token: str, allow_nc: bool = True) -> None:
        self._allow_nc = allow_nc
        if not token:
            raise SystemExit(
                "FREESOUND_API_KEY is not set. Set it with:\n"
                "  setx FREESOUND_API_KEY \"<your_key>\"   (persist)\n"
                "  $env:FREESOUND_API_KEY = \"<key>\"     (current shell)"
            )
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Token {token}"})
        self._req_times: list[float] = []

    def _throttle(self) -> None:
        now = time.monotonic()
        self._req_times = [t for t in self._req_times if now - t < 60.0]
        if len(self._req_times) >= RATE_LIMIT_PER_MIN:
            sleep_for = 60.0 - (now - self._req_times[0]) + 0.5
            print(f"  [rate-limit] sleeping {sleep_for:.1f}s")
            time.sleep(sleep_for)

    def _get(self, path: str, **params) -> dict:
        self._throttle()
        url = f"{FREESOUND_API}{path}"
        for attempt in range(3):
            r = self.session.get(url, params=params, timeout=30)
            self._req_times.append(time.monotonic())
            if r.status_code == 429 or r.status_code >= 500:
                time.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            return r.json()
        r.raise_for_status()
        return {}

    @staticmethod
    def _license_ok(license_url: str, allow_nc: bool) -> bool:
        lic = license_url.lower()
        for pat in _LICENSE_PATTERNS_ALLOW:
            if pat in lic:
                return True
        if allow_nc:
            for pat in _LICENSE_PATTERNS_NC:
                if pat in lic:
                    return True
        return False

    def search(self, query: str, page_size: int = 50) -> list[dict]:
        """Return a list of sound results for a query, license-filtered."""
        all_results: list[dict] = []
        filtered_out = 0
        total_seen = 0
        for page in range(1, 4):  # up to 150 results per query
            data = self._get(
                "/search/text/",
                query=query,
                page=page,
                page_size=page_size,
                fields="id,name,username,license,duration,previews,samplerate,channels",
                filter="duration:[1.0 TO 10.0] channels:1",
            )
            for s in data.get("results", []):
                total_seen += 1
                lic = s.get("license", "")
                if self._license_ok(lic, self._allow_nc):
                    all_results.append(s)
                else:
                    filtered_out += 1
            if not data.get("next"):
                break
        if total_seen > 0:
            print(f"      (API: {total_seen} total, {filtered_out} filtered by license, "
                  f"{len(all_results)} kept)")
        return all_results

    def download(self, sound: dict, dst: Path) -> bool:
        """Download the low-quality MP3 preview. Returns True on success."""
        preview_url = sound.get("previews", {}).get("preview-lq-mp3")
        if not preview_url:
            return False
        self._throttle()
        try:
            with self.session.get(preview_url, timeout=60, stream=True) as r:
                r.raise_for_status()
                tmp = dst.with_suffix(".part")
                with open(tmp, "wb") as f:
                    for chunk in r.iter_content(chunk_size=64 * 1024):
                        f.write(chunk)
                tmp.replace(dst)
        except Exception as e:
            print(f"    [SKIP] download fail {sound.get('id')}: {e}")
            return False
        return True


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, default=Path("data/raw/freesound"))
    ap.add_argument(
        "--max-per-query", type=int, default=25,
        help="Maximum sounds to download per (class, query) pair.",
    )
    ap.add_argument(
        "--strict-licenses", action="store_true",
        help="Exclude CC-BY-NC (only CC0 + CC-BY). Default: allow NC for research.",
    )
    ap.add_argument(
        "--classes", nargs="*", default=None,
        help="Restrict to these target classes (default: all in TARGETS).",
    )
    ap.add_argument("--dry-run", action="store_true", help="Search only, no downloads.")
    args = ap.parse_args()

    token = os.environ.get("FREESOUND_API_KEY", "").strip()
    allow_nc = not args.strict_licenses
    if allow_nc:
        print("[INFO] Including CC-BY-NC licenses (research use). Use --strict-licenses to exclude.")
    client = FreesoundClient(token, allow_nc=allow_nc) if not args.dry_run else None

    targets: Iterable[tuple[str, list[str]]] = TARGETS.items()
    if args.classes:
        wanted = set(args.classes)
        targets = [(c, qs) for c, qs in targets if c in wanted]

    total_downloaded = 0
    for cls, queries in targets:
        cls_dir = args.out / cls
        if not args.dry_run:
            cls_dir.mkdir(parents=True, exist_ok=True)
        cls_count = 0
        seen_ids: set[int] = set()
        for q in queries:
            if cls_count >= args.max_per_query * len(queries):
                break
            try:
                results = client.search(q) if client else [
                    {"id": i, "username": f"dry_{i}", "license": "Creative Commons 0",
                     "previews": {"preview-lq-mp3": None}}
                    for i in range(args.max_per_query)
                ]
            except Exception as e:
                print(f"  [{cls}/{q}] search fail: {e}")
                continue
            for sound in results:
                if cls_count >= args.max_per_query * len(queries):
                    break
                sid = int(sound["id"])
                if sid in seen_ids:
                    continue
                seen_ids.add(sid)
                uploader = str(sound.get("username", "anon")).strip() or "anon"
                safe_user = "".join(c if c.isalnum() or c in "-_" else "_" for c in uploader)[:32]
                dst = cls_dir / f"fs_{safe_user}__{sid}.mp3"
                if dst.exists():
                    cls_count += 1
                    continue
                if args.dry_run:
                    cls_count += 1
                    continue
                if client and client.download(sound, dst):
                    cls_count += 1
            print(f"  [{cls}] query='{q}' -> {cls_count} cumulative")
        print(f"[{cls}] {cls_count} new files in {cls_dir}")
        total_downloaded += cls_count

    print(f"\n[OK] Total sounds {'(dry-run)' if args.dry_run else 'downloaded'}: {total_downloaded}")
    if not args.dry_run:
        print("Next: run scripts/prepare_freesound.py to convert these to WAVs.")


if __name__ == "__main__":
    main()
