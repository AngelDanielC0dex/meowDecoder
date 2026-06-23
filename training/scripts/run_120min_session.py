"""Sesión de entrenamiento desatendida de ~120 min (i7 Ultra 155H).

Diseñada para rendir al máximo dentro de un presupuesto de pared FIJO, sin
intervención. Orden de fases (cada una aislada: si una falla no tumba la
siguiente cuando es seguro continuar):

  FASE 0  Caché prosódica en PARALELO (22 hilos).         ~6 min
          pyin cuesta ~0.3s/archivo en serie (75 min); en paralelo ~6 min.
  FASE 1  Extracción de embeddings YAMNet (lee la caché). ~8 min
  FASE 2  Entrenamiento baseline + evaluación.            ~6 min
          >>> ESTE es el entregable garantizado: modelo + OOF macro-F1. <<<
  FASE 3  Barrido de hiperparámetros con el tiempo SOBRANTE. ~resto
          Explora arquitecturas/dropout/lr/cap maximizando OOF. Time-boxed
          duro: nunca se pasa del presupuesto. NO pisa el modelo desplegado.

Todo se registra en artifacts/session_<ts>/. Resultados clave al terminar:
  artifacts/training_config.json   -> OOF del baseline (modelo desplegado)
  artifacts/sweep_results.csv      -> OOF de todas las configs, rankeable

Usage:
  python scripts/run_120min_session.py
  python scripts/run_120min_session.py --budget 120
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import subprocess
import sys
import time
from pathlib import Path

PY = sys.executable  # el python del venv que invoca este script


def banner(msg: str) -> None:
    print(f"\n{'='*70}\n{msg}\n{'='*70}", flush=True)


def run(cmd: list[str], log_path: Path, env: dict) -> int:
    """Ejecuta cmd, vuelca stdout+stderr a log_path y a consola. Devuelve returncode."""
    print(f"[CMD] {' '.join(cmd)}", flush=True)
    with open(log_path, "w", encoding="utf-8") as lf:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, env=env, bufsize=1)
        for line in proc.stdout:  # type: ignore[union-attr]
            sys.stdout.write(line)
            lf.write(line)
        proc.wait()
    return proc.returncode


def main() -> None:
    ap = argparse.ArgumentParser(description="Sesión desatendida de ~120 min")
    ap.add_argument("--budget", type=float, default=120.0, help="Presupuesto total (min)")
    ap.add_argument("--config", default="config.yaml")
    ap.add_argument("--margin", type=float, default=3.0,
                    help="Margen de seguridad al final (min) para cierre limpio")
    ap.add_argument("--skip-cache", action="store_true",
                    help="Saltar FASE 0 (usar caché prosódica existente)")
    args = ap.parse_args()

    t_start = time.time()
    ts = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    sess = Path("artifacts") / f"session_{ts}"
    sess.mkdir(parents=True, exist_ok=True)

    env = dict(os.environ)
    env.setdefault("PYTHONIOENCODING", "utf-8")
    env["TF_CPP_MIN_LOG_LEVEL"] = "3"
    env["TF_ENABLE_ONEDNN_OPTS"] = "0"

    def elapsed_min() -> float:
        return (time.time() - t_start) / 60.0

    banner(f"SESIÓN {ts}  presupuesto={args.budget:.0f} min  logs -> {sess}")

    # ── FASE 0: caché prosódica paralela ──────────────────────────────────────
    if not args.skip_cache:
        banner("FASE 0 — Caché prosódica (paralela, 22 hilos)")
        rc = run([PY, "scripts/build_prosodic_cache.py"], sess / "phase0_cache.log", env)
        if rc != 0:
            print("[WARN] FASE 0 devolvió error; extract usará fallback inline (más lento).")
    else:
        print("[INFO] FASE 0 saltada (--skip-cache).")

    # ── FASE 1: extracción de embeddings ──────────────────────────────────────
    banner(f"FASE 1 — Extract embeddings (YAMNet + prosodia)  [t+{elapsed_min():.1f} min]")
    rc = run([PY, "-m", "meowdecoder_training.yamnet_pipeline", "extract",
              "--config", args.config], sess / "phase1_extract.log", env)
    if rc != 0:
        print("[FATAL] Extract falló. Sin embeddings no se puede entrenar. Abortando.")
        sys.exit(1)

    # ── FASE 2: train baseline + evaluate (entregable garantizado) ────────────
    banner(f"FASE 2 — Train baseline + evaluate  [t+{elapsed_min():.1f} min]")
    rc = run([PY, "-m", "meowdecoder_training.yamnet_pipeline", "train",
              "--config", args.config], sess / "phase2_train.log", env)
    if rc == 0:
        run([PY, "-m", "meowdecoder_training.yamnet_pipeline", "evaluate",
             "--config", args.config], sess / "phase2_evaluate.log", env)
    else:
        print("[WARN] Train baseline falló; intento continuar con el sweep igualmente.")

    # ── FASE 3: sweep con el tiempo restante ──────────────────────────────────
    remaining = args.budget - elapsed_min() - args.margin
    if remaining < 8:
        print(f"[INFO] Solo quedan {remaining:.1f} min: insuficiente para sweep. Fin.")
    else:
        banner(f"FASE 3 — Sweep hiperparámetros  presupuesto={remaining:.0f} min  "
               f"[t+{elapsed_min():.1f} min]")
        run([PY, "scripts/sweep_head.py", "--config", args.config,
             "--max-minutes", f"{remaining:.0f}",
             "--out", str(sess / "sweep_results.csv")],
            sess / "phase3_sweep.log", env)
        # copia también al sitio estándar para comodidad
        try:
            import shutil
            shutil.copy(sess / "sweep_results.csv", "artifacts/sweep_results.csv")
        except Exception:
            pass

    # ── Resumen ───────────────────────────────────────────────────────────────
    banner(f"SESIÓN COMPLETA  duración total={elapsed_min():.1f} min")
    tc = Path("artifacts/training_config.json")
    if tc.exists():
        import json
        d = json.loads(tc.read_text())
        print(f"[BASELINE] OOF macro-F1 = {d.get('oof_macro_f1')}")
        pcf = d.get("per_class_f1", {})
        for k, v in sorted(pcf.items(), key=lambda x: x[1]):
            print(f"    {k:<22} F1={v:.3f}")
    sw = sess / "sweep_results.csv"
    if sw.exists():
        import csv
        rows = list(csv.DictReader(open(sw, encoding="utf-8")))
        rows.sort(key=lambda r: float(r["oof_macro_f1"]), reverse=True)
        print(f"\n[SWEEP] {len(rows)} trials. Top 5 por OOF macro-F1:")
        for r in rows[:5]:
            print(f"    macroF1={r['oof_macro_f1']}  hidden={r['hidden']}  "
                  f"drop={r['dropout']}  lr={r['lr']}  cap={r['cap']}")
    print(f"\nLogs completos en: {sess.resolve()}")


if __name__ == "__main__":
    main()
