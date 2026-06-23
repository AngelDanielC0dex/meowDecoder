import type { ReactNode } from "react";
import styles from "./RopeCat.module.css";

/** Builds a chain of `depth` nested <div>s of the same class, innermost wrapping
 *  `leaf`. The stylesheet offsets each nested segment, turning the chain into a
 *  jointed leg or curling tail. */
function chain(cls: string | undefined, depth: number, leaf?: ReactNode): ReactNode {
  let node: ReactNode = leaf ?? null;
  for (let i = 0; i < depth; i++) node = <div className={cls}>{node}</div>;
  return node;
}

/**
 * Decorative "cat dangling from a ball of yarn" that swings from the top-right,
 * below the header, on the landing only. Pure CSS (compiled from SCSS); fixed,
 * `aria-hidden`, `pointer-events:none`, shown on large screens only and removed
 * entirely under prefers-reduced-motion (see RopeCat.module.css).
 */
export function RopeCat() {
  const leg = () => chain(styles.catLeg, 16, <div className={styles.catPaw} />);

  return (
    <div className={styles.allWrap} aria-hidden="true">
      <div className={styles.all}>
        <div className={styles.yarn} />
        <div className={styles.catWrap}>
          <div className={styles.cat}>
            <div className={styles.catUpper}>
              <div className={styles.catLeg} />
              <div className={styles.catLeg} />
              <div className={styles.catHead}>
                <div className={styles.catEars}>
                  <div className={styles.catEar} />
                  <div className={styles.catEar} />
                </div>
                <div className={styles.catFace}>
                  <div className={styles.catEyes} />
                  <div className={styles.catMouth} />
                  <div className={styles.catWhiskers} />
                </div>
              </div>
            </div>
            <div className={styles.catLowerWrap}>
              <div className={styles.catLower}>
                {leg()}
                {leg()}
                {chain(styles.catTail, 16)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
