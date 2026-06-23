"""
Intra-class contamination detector via k-NN purity (label-noise detection).

Motivación: una clase puede estar contaminada con audios de OTRA categoría
(p. ej. maullidos de atención/feliz etiquetados como dolor). El centroide se
envenena y la clase se vuelve un "atractor" que absorbe a las vecinas.

Método: k-NN local en el espacio de embeddings YAMNet (el MISMO que ve el
clasificador). Para cada archivo de la clase objetivo:
  - busca sus k vecinos más cercanos entre TODOS los originales (coseno)
  - purity = fracción de vecinos que comparten su etiqueta
  - foreign = clase ajena dominante entre los vecinos

Por qué k-NN y no el centroide: el k-NN es LOCAL. Aunque el centroide de la
clase esté envenenado por la contaminación, un archivo genuino seguirá teniendo
muchos vecinos de su propia clase cerca. Un archivo contaminado tendrá vecinos
mayoritariamente de la clase real a la que pertenece -> baja purity + foreign
clara = candidato fuerte a mala etiqueta.

Solo se analizan archivos ORIGINALES (sin __aug). Lee data/embeddings/*.npz,
que YA contienen los embeddings y file_paths -> no recalcula nada (rápido).

Output: quarantine/intraclass/<class>/   (con --move)
Report: quarantine/intraclass/INTRACLASS_REPORT.txt

Usage:
  python scripts/qc_intraclass.py --classes dolor              # solo dolor, dry-run
  python scripts/qc_intraclass.py --all                        # todas, reporte
  python scripts/qc_intraclass.py --classes dolor --purity-thr 0.25 --move
"""

from __future__ import annotations

import argparse
import shutil
import sys
from collections import Counter
from pathlib import Path

import numpy as np

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

EMB_DIR  = Path("data/embeddings")
OUT_DIR  = Path("quarantine/intraclass")

DEFAULT_K          = 20
DEFAULT_PURITY_THR = 0.30   # < 30% de vecinos de la propia clase -> flag
DEFAULT_FOREIGN_FR = 0.40   # y >= 40% de vecinos de una sola clase ajena


def is_aug(path: str) -> bool:
    return "__aug" in Path(path).name


def load_originals(classes: list[str]):
    """Return (embs[N,D] L2-normed, labels[N], paths[N]) for ORIGINALS only."""
    embs, labs, paths = [], [], []
    for ci, cls in enumerate(classes):
        npz = EMB_DIR / f"{cls}.npz"
        if not npz.exists():
            print(f"[WARN] missing embeddings: {npz}")
            continue
        z = np.load(npz, allow_pickle=True)
        E = z["embeddings"]
        P = [str(p) for p in z["file_paths"]]
        for e, p in zip(E, P):
            if is_aug(p):
                continue
            embs.append(e)
            labs.append(ci)
            paths.append(p)
    X = np.stack(embs).astype(np.float32)
    X = X / (np.linalg.norm(X, axis=1, keepdims=True) + 1e-8)
    return X, np.array(labs), paths


def main() -> None:
    ap = argparse.ArgumentParser(description="Intra-class contamination via k-NN purity")
    ap.add_argument("--classes", nargs="*", default=None,
                    help="Clases objetivo a analizar (default: todas si --all)")
    ap.add_argument("--all", action="store_true", help="Analizar todas las clases")
    ap.add_argument("--k", type=int, default=DEFAULT_K)
    ap.add_argument("--purity-thr", type=float, default=DEFAULT_PURITY_THR)
    ap.add_argument("--foreign-frac", type=float, default=DEFAULT_FOREIGN_FR)
    ap.add_argument("--out", default=str(OUT_DIR))
    ap.add_argument("--move", action="store_true",
                    help="Mover flaggeados a quarantine/intraclass/<class>/ (default: dry-run)")
    args = ap.parse_args()

    # Discover all classes present in embeddings
    all_classes = sorted(p.stem for p in EMB_DIR.glob("*.npz"))
    if not all_classes:
        raise SystemExit(f"No embeddings in {EMB_DIR}. Run `extract` first.")

    targets = all_classes if args.all else (args.classes or [])
    if not targets:
        raise SystemExit("Especifica --classes <cls...> o --all")
    targets = [c for c in targets if c in all_classes]

    print(f"[INFO] Loading original embeddings ({len(all_classes)} classes)...")
    X, y, paths = load_originals(all_classes)
    print(f"[INFO] {len(paths)} originals, dim={X.shape[1]}\n")

    from sklearn.neighbors import NearestNeighbors
    # k+1 because the first neighbor is the point itself
    nn = NearestNeighbors(n_neighbors=args.k + 1, metric="cosine").fit(X)
    print(f"[INFO] kNN fitted (k={args.k}, cosine). Querying...\n")

    out_dir = Path(args.out)
    report_lines: list[str] = []
    grand_flag = 0

    for cls in targets:
        ci = all_classes.index(cls)
        idx = np.where(y == ci)[0]
        if len(idx) == 0:
            continue

        dist, neigh = nn.kneighbors(X[idx])
        rows = []  # (purity, path, foreign_cls, foreign_frac)
        for row_i, gi in enumerate(idx):
            nbr = neigh[row_i][1:]              # drop self
            nbr_lbls = y[nbr]
            purity = float(np.mean(nbr_lbls == ci))
            foreign = nbr_lbls[nbr_lbls != ci]
            if len(foreign):
                fcls_i, fcnt = Counter(foreign.tolist()).most_common(1)[0]
                fcls = all_classes[fcls_i]
                ffrac = fcnt / len(nbr_lbls)
            else:
                fcls, ffrac = "-", 0.0
            rows.append((purity, paths[gi], fcls, ffrac))

        # Flag: low purity AND a clear dominant foreign class
        flagged = [r for r in rows
                   if r[0] < args.purity_thr and r[3] >= args.foreign_frac]
        flagged.sort(key=lambda r: r[0])  # worst (lowest purity) first

        # Distribution summary
        purities = np.array([r[0] for r in rows])
        foreign_targets = Counter(r[2] for r in flagged)

        hdr = (f"\n{'='*64}\n"
               f"CLASS: {cls}  (n_orig={len(rows)})\n"
               f"  mean_purity={purities.mean():.2f}  "
               f"median={np.median(purities):.2f}  "
               f"frac_purity<{args.purity_thr}={np.mean(purities < args.purity_thr):.2f}\n"
               f"  FLAGGED={len(flagged)}  "
               f"(purity<{args.purity_thr} AND foreign>={args.foreign_frac})\n"
               f"  foreign destinations: {dict(foreign_targets)}\n"
               f"{'='*64}")
        print(hdr)
        report_lines.append(hdr)
        grand_flag += len(flagged)

        for purity, p, fcls, ffrac in flagged:
            line = f"[{cls}->{fcls}] purity={purity:.2f} foreign={ffrac:.2f}  {Path(p).name}"
            print("  " + line)
            report_lines.append(line)
            if args.move:
                dst = out_dir / cls
                dst.mkdir(parents=True, exist_ok=True)
                src = Path(p)
                if src.exists():
                    shutil.move(str(src), str(dst / src.name))

    print(f"\n{'='*64}")
    print(f"TOTAL FLAGGED: {grand_flag}  "
          f"({'MOVED' if args.move else 'DRY-RUN, nothing moved'})")
    print(f"{'='*64}")

    out_dir.mkdir(parents=True, exist_ok=True)
    rp = out_dir / "INTRACLASS_REPORT.txt"
    with open(rp, "w", encoding="utf-8") as f:
        f.write(f"INTRACLASS k-NN PURITY  k={args.k}  purity_thr={args.purity_thr}  "
                f"foreign_frac={args.foreign_frac}\n")
        f.write(f"total_flagged={grand_flag}  moved={'yes' if args.move else 'no'}\n")
        f.write("\n".join(report_lines))
    print(f"Report -> {rp.resolve()}")


if __name__ == "__main__":
    main()
