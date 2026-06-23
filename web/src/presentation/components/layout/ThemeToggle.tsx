"use client";

import { useTranslations } from "next-intl";
import { useTheme } from "@/presentation/state/ThemeProvider";
import styles from "./ThemeToggle.module.css";

/**
 * Animated light/dark switch: a cat that pulls a window blind. By day (light
 * theme) the sun is up, the blinds are rolled away and the cat dozes with closed
 * eyes; by night (dark theme) the blinds drop, the moon rises and the cat wakes,
 * blinking. Reimplemented from a GSAP + DrawSVG/MorphSVG + jQuery CodePen as
 * dependency-free CSS driven by the `.night` class (see ThemeToggle.module.css),
 * so it ships without paid plugins or extra runtime — and honors reduced motion.
 *
 * It flips the RESOLVED theme (which starts by following the OS), so there is no
 * intermediate "system" state. The SVG is decorative; the button carries the
 * accessible name and pressed state.
 */
export function ThemeToggle() {
  const t = useTranslations("theme");
  const { resolved, setTheme } = useTheme();
  const isNight = resolved === "dark";
  const next = isNight ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={t(next)}
      aria-label={t("toggle", { current: t(resolved), next: t(next) })}
      aria-pressed={isNight}
      className="interactive flex items-center justify-center rounded-lg px-1.5 py-1 ring-1 ring-inset ring-brand-100 hover:ring-brand-300"
    >
      <svg
        viewBox="287 165 226 273"
        xmlns="http://www.w3.org/2000/svg"
        fillRule="evenodd"
        clipRule="evenodd"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeMiterlimit={1.5}
        aria-hidden="true"
        className={`${styles.scene} ${isNight ? styles.night : ""}`}
      >
        <path fill="#556f80" d="M297.762 168.842h204.444v235.735H297.762z" />
        <path fill="#d7edee" d="M314.593 179.677h172.094v211.138H314.593z" />
        <clipPath id="ttClipWin">
          <path d="M314.593 179.677h172.094v211.138H314.593z" />
        </clipPath>
        <g clipPath="url(#ttClipWin)">
          <g className={styles.sunMoon}>
            <path
              d="M400.34 182.186c120.805-.166 219.018 97.778 219.183 218.583.166 120.805-97.778 219.018-218.583 219.183-120.805.166-219.018-97.778-219.183-218.583-.166-120.805 97.778-219.017 218.583-219.183z"
              fill="none"
            />
            <path
              d="M444.497 194.968c18.422-.025 33.399 14.911 33.425 33.334.025 18.422-14.911 33.399-33.334 33.425-18.422.025-33.399-14.911-33.424-33.334-.026-18.422 14.91-33.399 33.333-33.425z"
              fill="#f3a683"
            />
            <path
              d="M260.414 257.684c-1.492 3.793-2.309 7.923-2.303 12.243.026 18.423 15.003 33.359 33.425 33.334 3.209-.005 6.313-.463 9.25-1.314-4.869 12.381-16.928 21.162-31.031 21.182-18.422.025-33.399-14.911-33.424-33.334-.021-15.213 10.161-28.077 24.083-32.111z"
              fill="#ffffff"
            />
          </g>
          <g fill="#556f80">
            <path d="M311.283 281.864h178.714v6.764H311.283z" />
            <path d="M397.258 175.835h6.764v218.823h-6.764z" />
          </g>
          <g className={styles.blinds} fill="#303853">
            <path d="M307.102 175.835h185.274v11.748H307.102z" />
            <path d="M307.102 190.626h185.274v11.748H307.102z" />
            <path d="M307.102 205.417h185.274v11.748H307.102z" />
            <path d="M307.102 220.208h185.274v11.748H307.102z" />
            <path d="M307.102 234.999h185.274v11.748H307.102z" />
            <path d="M307.102 249.79h185.274v11.748H307.102z" />
            <path d="M307.102 264.581h185.274v11.748H307.102z" />
            <path d="M307.102 279.372h185.274v11.748H307.102z" />
            <path d="M307.102 294.163h185.274v11.748H307.102z" />
            <path d="M307.102 308.954h185.274v11.748H307.102z" />
            <path d="M307.102 323.745h185.274v11.748H307.102z" />
            <path d="M307.102 338.536h185.274v11.748H307.102z" />
            <path d="M307.102 353.327h185.274v11.748H307.102z" />
            <path d="M307.102 368.118h185.274v11.748H307.102z" />
            <path d="M307.102 382.91h185.274v11.748H307.102z" />
          </g>
        </g>
        <path fill="#fff" d="M287.918 401.069h224.164v22.23H287.918z" />
        <g>
          <path
            className={styles.rightHand}
            d="M331.488 386.954s-27.273-1.471-26.23 7.167c.766 6.338 8.295 7.357 14.469 7.772 6.174.416 36.055.929 11.761-14.939z"
            fill="#98aebe"
          />
          <path
            d="M352.39 365.252s81.405-40.993 98.905-.68c11.659 26.856-7.929 42.029-43.527 42.029-23.361 0-43.863-1.589-52.67-5.837-8.806-4.248-2.708-35.512-2.708-35.512z"
            fill="#98aebe"
          />
          <clipPath id="ttClipBody">
            <path d="M352.39 365.252s81.405-40.993 98.905-.68c11.659 26.856-7.929 42.029-43.527 42.029-23.361 0-43.863-1.589-52.67-5.837-8.806-4.248-2.708-35.512-2.708-35.512z" />
          </clipPath>
          <g clipPath="url(#ttClipBody)" fill="#556f80">
            <ellipse cx="387.298" cy="348.073" rx="6.745" ry="21.523" />
            <ellipse cx="405.01" cy="345.617" rx="6.745" ry="21.523" />
            <ellipse cx="421.309" cy="342.364" rx="6.745" ry="21.523" />
          </g>
          <g>
            <path
              d="M364.317 400.424s11.226-4.284 15.647-9.691c6.564-8.027 3.892-15.747 3.892-15.747l-11.031.387-8.508 25.051z"
              fill="#303853"
              fillOpacity=".2"
            />
            <path
              d="M351 346.994c18.134 0 32.856 12.256 32.856 27.351 0 15.096-5.681 27.352-32.856 27.352s-32.856-12.256-32.856-27.352c0-15.095 14.722-27.351 32.856-27.351z"
              fill="#98aebe"
            />
            <clipPath id="ttClipHead">
              <path d="M351 346.994c18.134 0 32.856 12.256 32.856 27.351 0 15.096-5.681 27.352-32.856 27.352s-32.856-12.256-32.856-27.352c0-15.095 14.722-27.351 32.856-27.351z" />
            </clipPath>
            <g clipPath="url(#ttClipHead)">
              <ellipse cx="352.146" cy="341.559" rx="6.738" ry="21.523" fill="#556f80" />
            </g>
            <g>
              <path
                d="M329.297 344.831c1.229-1.448 3.397-1.633 4.854-.414 5.049 4.184 8.243 8.982 9.656 14.354.415 1.603-.359 3.277-1.849 4-5.62 2.725-11.188 3.166-16.711 1.657-1.627-.446-2.699-1.995-2.544-3.675.628-6.08 2.837-11.38 6.594-15.922z"
                fill="#98aebe"
              />
              <path
                d="M329.582 351.25a3.3964 3.3964 0 012.573-1.627c1.066-.106 2.12.298 2.843 1.088 1.11 1.065 1.923 2.266 2.509 3.539a3.4906 3.4906 0 01-2.203 4.826c-1.44.422-2.872.558-4.298.426a3.4897 3.4897 0 01-2.508-1.416 3.4889 3.4889 0 01-.591-2.819c.411-1.425.944-2.769 1.675-4.017z"
                fill="#d7edee"
              />
            </g>
            <g>
              <path
                d="M371.927 344.794c1.657-.929 3.754-.346 4.693 1.305 3.274 5.682 4.595 11.292 4.046 16.819-.17 1.648-1.479 2.947-3.127 3.105-6.218.595-11.591-.934-16.241-4.274-1.369-.985-1.834-2.811-1.103-4.331 2.709-5.48 6.627-9.677 11.732-12.624z"
                fill="#98aebe"
              />
              <path
                d="M370.019 350.745a3.3997 3.3997 0 012.96-.605 3.3971 3.3971 0 012.273 1.991c.726 1.497 1.094 3.016 1.194 4.522a3.4903 3.4903 0 01-3.717 3.729c-1.618-.099-3.114-.5-4.498-1.183a3.491 3.491 0 01-1.832-2.189c-.271-.957-.12-1.985.415-2.824.936-1.303 1.984-2.463 3.205-3.441z"
                fill="#d7edee"
              />
            </g>
            <g>
              <path d="M336.292 387.714s-4.319-1.775-9.465-.34" fill="none" stroke="#556f80" strokeWidth={2} />
              <path d="M362.652 387.714s4.319-1.775 9.465-.34" fill="none" stroke="#556f80" strokeWidth={2} />
              <path d="M336.575 390.032s-3.765-.486-8.735 2.944" fill="none" stroke="#556f80" strokeWidth={2} />
              <path d="M362.369 390.032s3.765-.486 8.735 2.944" fill="none" stroke="#556f80" strokeWidth={2} />
              <path
                d="M349.873 386.424c.392-.242.89-.232 1.273.025.165.106.317.227.457.355.443.399.599 1.027.393 1.586-.206.56-.732.937-1.327.953a6.271 6.271 0 01-.434-.01 1.4684 1.4684 0 01-.872-2.576c.164-.108.329-.224.51-.333z"
                fill="#556f80"
              />
              <path
                className={styles.eyeClose}
                d="M332.463 377.656c.993 1.432 3.476 2.14 5.122 2.13 1.987-.011 4.014-.609 5.028-2.13"
                fill="none"
                stroke="#556f80"
                strokeWidth={2}
              />
              <path
                className={styles.eyeClose}
                d="M357.174 377.656c.992 1.432 3.475 2.14 5.121 2.13 1.987-.011 4.015-.609 5.028-2.13"
                fill="none"
                stroke="#556f80"
                strokeWidth={2}
              />
              <g className={styles.eyeOpen}>
                <ellipse cx="362.196" cy="377.815" rx="4.942" ry="6.515" fill="#d7edee" />
                <ellipse cx="362.196" cy="377.815" rx="3.56" ry="4.82" fill="#556f80" />
              </g>
              <g className={styles.eyeOpen}>
                <ellipse cx="337.566" cy="377.815" rx="4.942" ry="6.515" fill="#d7edee" />
                <ellipse cx="337.566" cy="377.815" rx="3.56" ry="4.82" fill="#556f80" />
              </g>
            </g>
          </g>
          <path
            d="M434.587 386.268s41.571-.431 39.44 10.421c-1.563 7.963-13.079 8.856-22.495 9.058-9.416.202-54.893-.712-16.945-19.479z"
            fill="#98aebe"
          />
          <g className={styles.tail} fill="none" stroke="#98aebe" strokeWidth={14}>
            <path d="M447.606 379.471v24.772s-.061 26.915-28.211 26.915" />
          </g>
          <path
            className={styles.leftHand}
            d="M367.154 392.352s-15.939 22.18-8.101 25.956c5.751 2.772 10.668-3.021 14.346-7.998 3.677-4.976 20.216-29.868-6.245-17.958z"
            fill="#98aebe"
          />
        </g>
        <g>
          <path d="M305.992 179.677V390" fill="none" stroke="#fff" strokeWidth={3} />
          <circle className={styles.knob} cx="305.992" cy="372.85" r="10.928" fill="#f3a683" />
        </g>
      </svg>
    </button>
  );
}
