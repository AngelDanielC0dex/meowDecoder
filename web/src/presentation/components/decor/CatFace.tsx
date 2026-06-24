import type { CSSProperties } from "react";
import styles from "./CatFace.module.css";

/**
 * Decorative blinking cat that glances around — the hero mascot. Pure CSS
 * (no JS), theme-aware via the ink/surface tokens, and `aria-hidden` (it carries
 * no information the heading doesn't already convey). Size is controlled with the
 * `sizePx` prop, exposed to the stylesheet as the `--cat-size` custom property.
 */
export function CatFace({
  className,
  sizePx = 170,
}: {
  className?: string;
  sizePx?: number;
}) {
  return (
    <div
      className={`${styles.cat} ${className ?? ""}`}
      style={{ "--cat-size": `${sizePx}px` } as CSSProperties}
      aria-hidden="true"
    >
      <div className={`${styles.ear} ${styles.earLeft}`} />
      <div className={`${styles.ear} ${styles.earRight}`} />
      <div className={styles.face}>
        <div className={`${styles.eye} ${styles.eyeLeft}`}>
          <div className={styles.eyePupil} />
        </div>
        <div className={`${styles.eye} ${styles.eyeRight}`}>
          <div className={styles.eyePupil} />
        </div>
        <div className={styles.muzzle} />
        <div className={`${styles.whisker} ${styles.whiskerLeft} ${styles.whiskerLeft2}`} />
        <div className={`${styles.whisker} ${styles.whiskerLeft} ${styles.whiskerLeft3}`} />
        <div className={`${styles.whisker} ${styles.whiskerRight} ${styles.whiskerRight2}`} />
        <div className={`${styles.whisker} ${styles.whiskerRight} ${styles.whiskerRight3}`} />
      </div>
    </div>
  );
}
