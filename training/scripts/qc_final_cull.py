"""
Criba FINAL — la última. Saca los ~N audios ORIGINALES más probablemente
MAL ETIQUETADOS o INVÁLIDOS de todo el dataset para una revisión manual única,
e informa de los déficits para igualar clases.

────────────────────────────────────────────────────────────────────────────
MÉTODO (compuesto, robusto al envenenamiento de centroides)
Usa los embeddings con los que se entrena el modelo (data/embeddings, 2073-dim
= YAMNet 1024 mean/std + 25 prosódicas), SOLO originales (sin "__aug"). Para
cada archivo:
  - k-NN coseno (k=20) sobre TODOS los originales de todas las clases.
  - impureza = fracción de vecinos cuya clase != la etiqueta del archivo.
  - clase_ajena = clase dominante entre los vecinos de otra clase  → la etiqueta
    CORRECTA sugerida (te dice si BORRAR=inválido o RECLASIFICAR=mover ahí).
  - z_propio = cuántas desviaciones por debajo de la similitud media con su
    propio centroide (detector de outlier/grabación atípica).
  suspicion = impureza (principal); z_propio como desempate.

Por qué k-NN y no centroide: es LOCAL. Un ejemplo de frontera bien etiquetado
conserva muchos vecinos de su clase; uno mal etiquetado/ inválido está rodeado
por otra clase. Resistente aunque el centroide de la clase esté contaminado.

PRESUPUESTO: ordena todos los originales por sospecha y coge los --budget peores
(def. 300), con tope por clase (--max-frac, def. 0.45) para no vaciar ninguna
clase, y un suelo de impureza (--min-impurity, def. 0.35) para no rellenar con
archivos limpios. Calidad > cantidad: si hay menos sospechosos que el cupo,
marca solo esos.

Dry-run por defecto. Con --move mueve a quarantine/final_cull/<clase>/.
Informe: quarantine/final_cull/FINAL_CULL_REPORT.txt (peores primero, por clase,
con la clase sugerida de cada archivo).

Uso:
  python scripts/qc_final_cull.py                       # dry-run, ver conteo
  python scripts/qc_final_cull.py --budget 300 --move   # mover los 300 peores
  python scripts/qc_final_cull.py --min-impurity 0.4    # más estricto
"""

from __future__ import annotations

import argparse
import shutil
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

EMB_DIR = Path("data/embeddings")
PROCESSED = Path("data/processed_clean")
OUT_DIR = Path("quarantine/final_cull")


def is_aug(path: str) -> bool:
    return "__aug" in Path(path).name


def load_originals(classes: list[str]):
    """(embs[N,D] L2-normed, labels[N], paths[N]) para SOLO originales."""
    embs, labs, paths = [], [], []
    for ci, cls in enumerate(classes):
        npz = EMB_DIR / f"{cls}.npz"
        if not npz.exists():
            print(f"[WARN] faltan embeddings: {npz}")
            continue
        z = np.load(npz, allow_pickle=True)
        for e, p in zip(z["embeddings"], z["file_paths"]):
            if is_aug(str(p)):
                continue
            embs.append(e)
            labs.append(ci)
            paths.append(str(p))
    X = np.stack(embs).astype(np.float32)
    X /= np.linalg.norm(X, axis=1, keepdims=True) + 1e-8
    return X, np.array(labs), paths


def class_balance_report(classes: list[str]) -> list[str]:
    """Conteo de originales por clase + déficit para igualar al máximo."""
    counts = {}
    for cls in classes:
        d = PROCESSED / cls
        counts[cls] = (
            len([w for w in d.glob("*.wav") if "__aug" not in w.name]) if d.exists() else 0
        )
    target = max(counts.values()) if counts else 0
    lines = ["", "=" * 60, "IGUALACIÓN DE CLASES (originales actuales en disco)",
             "=" * 60, f"{'clase':<22}{'actual':>8}{'faltan→max':>12}"]
    total_deficit = 0
    for cls in sorted(counts, key=lambda c: counts[c]):
        deficit = target - counts[cls]
        total_deficit += deficit
        lines.append(f"{cls:<22}{counts[cls]:>8}{deficit:>12}")
    lines.append("-" * 42)
    lines.append(f"{'TARGET (clase máxima)':<22}{target:>8}")
    lines.append(f"{'TOTAL a conseguir':<22}{'':>8}{total_deficit:>12}")
    return lines


def main() -> None:
    ap = argparse.ArgumentParser(description="Criba final por sospecha k-NN + igualación")
    ap.add_argument("--budget", type=int, default=300, help="Máx. archivos a marcar")
    ap.add_argument("--k", type=int, default=20)
    ap.add_argument("--min-impurity", type=float, default=0.35,
                    help="No marcar por debajo de esta impureza (suelo de calidad)")
    ap.add_argument("--max-frac", type=float, default=0.45,
                    help="Tope de archivos marcados por clase (fracción del tamaño de la clase)")
    ap.add_argument("--out", default=str(OUT_DIR))
    ap.add_argument("--reviewed-list", default="data/_reviewed_audios.txt",
                    help="Fichero con basenames ya revisados a EXCLUIR (y al que se "
                         "AÑADEN los nuevos marcados, para no repetir en futuras cribas)")
    ap.add_argument("--move", action="store_true", help="Mover (def. dry-run)")
    args = ap.parse_args()

    # Excluir lo ya revisado por el usuario en cribas anteriores (por nombre).
    reviewed_path = Path(args.reviewed_list)
    excluded: set[str] = set()
    if reviewed_path.exists():
        excluded = {ln.strip() for ln in reviewed_path.read_text(encoding="utf-8").splitlines()
                    if ln.strip()}
    print(f"[INFO] Ya revisados (excluidos): {len(excluded)}")

    classes = sorted(p.stem for p in EMB_DIR.glob("*.npz"))
    if not classes:
        raise SystemExit(f"No hay embeddings en {EMB_DIR}. Corre `extract` primero.")

    print(f"[INFO] Cargando originales ({len(classes)} clases)...")
    X, y, paths = load_originals(classes)
    print(f"[INFO] {len(paths)} originales, dim={X.shape[1]}")

    from sklearn.neighbors import NearestNeighbors
    nn = NearestNeighbors(n_neighbors=args.k + 1, metric="cosine").fit(X)
    _, neigh = nn.kneighbors(X)

    # Similitud con el centroide propio → z-score por clase (outliers).
    centroids = {c: X[y == ci].mean(0) for ci, c in enumerate(classes)}
    for c in centroids:
        centroids[c] /= np.linalg.norm(centroids[c]) + 1e-8
    C = np.stack([centroids[c] for c in classes])
    own_sim = (X * C[y]).sum(1)
    cls_mu = {ci: own_sim[y == ci].mean() for ci in range(len(classes))}
    cls_sd = {ci: own_sim[y == ci].std() + 1e-8 for ci in range(len(classes))}

    # Puntuar cada original.
    cand = []  # (impurity, own_z, cls, path, foreign_cls, foreign_frac)
    class_size = Counter(y.tolist())
    for i, p in enumerate(paths):
        if Path(p).name in excluded:
            continue  # ya verificado por el usuario; no volver a marcarlo
        ci = int(y[i])
        nbr = neigh[i][1:]
        nbr_lbls = y[nbr]
        impurity = float(np.mean(nbr_lbls != ci))
        if impurity < args.min_impurity:
            continue
        foreign = nbr_lbls[nbr_lbls != ci]
        if len(foreign):
            fci, fcnt = Counter(foreign.tolist()).most_common(1)[0]
            foreign_cls = classes[fci]
            foreign_frac = fcnt / len(nbr_lbls)
        else:
            foreign_cls, foreign_frac = "-", 0.0
        own_z = float((own_sim[i] - cls_mu[ci]) / cls_sd[ci])  # negativo = atípico
        cand.append((impurity, own_z, classes[ci], p, foreign_cls, foreign_frac))

    # Ordenar: más impureza primero; desempate por más atípico (own_z menor).
    cand.sort(key=lambda t: (-t[0], t[1]))

    # Selección con tope por clase y presupuesto global.
    per_class_cap = {c: max(1, int(args.max_frac * class_size[ci]))
                     for ci, c in enumerate(classes)}
    picked = []
    per_class_count: dict[str, int] = defaultdict(int)
    for item in cand:
        cls = item[2]
        if len(picked) >= args.budget:
            break
        if per_class_count[cls] >= per_class_cap[cls]:
            continue
        picked.append(item)
        per_class_count[cls] += 1

    # Informe + (opcional) mover.
    out_dir = Path(args.out)
    report = [f"CRIBA FINAL  budget={args.budget} k={args.k} "
              f"min_impurity={args.min_impurity} max_frac={args.max_frac}",
              f"originales={len(paths)}  marcados={len(picked)}  "
              f"({'MOVIDOS' if args.move else 'DRY-RUN'})", ""]
    # Distribución y destinos sugeridos.
    dest = Counter(f"{it[2]}→{it[4]}" for it in picked)
    report.append("Por clase (marcados / tamaño):")
    for ci, c in enumerate(classes):
        if per_class_count[c]:
            report.append(f"  {c:<22} {per_class_count[c]:>3} / {class_size[ci]}")
    report.append("")
    report.append("Reclasificaciones sugeridas más comunes (etiqueta→vecino):")
    for k, v in dest.most_common(15):
        report.append(f"  {k:<40} {v}")
    report.append("")
    report.append("=" * 60)
    report.append("DETALLE (peores primero) — revisa: ¿BORRAR (inválido) o MOVER a la clase sugerida?")
    report.append("=" * 60)

    moved = 0
    for impurity, own_z, cls, p, fcls, ffrac in picked:
        report.append(f"[{cls} → {fcls}] impureza={impurity:.2f} ajena={ffrac:.2f} "
                      f"z={own_z:+.1f}  {Path(p).name}")
        if args.move:
            dst = out_dir / cls
            dst.mkdir(parents=True, exist_ok=True)
            src = Path(p)
            if src.exists():
                shutil.move(str(src), str(dst / src.name))
                moved += 1

    # Registrar los nuevos marcados como "revisados" para no repetirlos en una
    # futura criba. Solo al mover (en dry-run el usuario aún re-tunea el budget).
    if args.move and picked:
        new_names = sorted({Path(it[3]).name for it in picked} - excluded)
        with open(reviewed_path, "a", encoding="utf-8") as f:
            for n in new_names:
                f.write(n + "\n")
        print(f"[INFO] +{len(new_names)} añadidos a {reviewed_path} (total revisados acumulados)")

    report += class_balance_report(classes)

    print("\n".join(report[:60]))
    print(f"\n... ({len(picked)} marcados en total)")
    out_dir.mkdir(parents=True, exist_ok=True)
    rp = out_dir / "FINAL_CULL_REPORT.txt"
    rp.write_text("\n".join(report), encoding="utf-8")
    print(f"\nInforme completo -> {rp.resolve()}")
    if not args.move:
        print("DRY-RUN: añade --move para mover los marcados a quarantine/final_cull/")


if __name__ == "__main__":
    main()
