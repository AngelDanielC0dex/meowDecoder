# Plan de ejecución — MeowDecoder hacia ≥ 95/100

> Plan detallado y accionable. Organizado en **8 workstreams (W1–W8)**, cada uno con archivos exactos, cambios concretos y criterio de aceptación. Al final: orden de ejecución, decisiones que necesito de ti, y mapa workstream → puntuación.
> **Estado actual: 72/100. Objetivo: ≥ 95/100.** Nada se ejecuta hasta tu aprobación.

---

## Resumen de objetivos por área

| Área | Hoy | Meta | Workstreams que la suben |
|---|---|---|---|
| Arquitectura | 90 | 96 | W7 |
| Calidad de código | 85 | 96 | W1, W7 |
| Mantenibilidad | 84 | 96 | W1, W7, W8 |
| Deuda técnica | 70 | 95 | W1, W2, W6 |
| UX / Usabilidad | 68 | 96 | W1, W2, W6 |
| Accesibilidad | 72 | 96 | W4 |
| SEO | 66 | 97 | W3 |
| Diseño / UI | 80 | 95 | W1, W4 |
| Responsive | 82 | 95 | W4 |
| Rendimiento | 74 | 95 | W5, W8 |
| Seguridad | 62 | 95 | W2 |

---

## W1 — Coherencia marca↔código e i18n (Quick Wins críticos)

**Objetivo:** eliminar las contradicciones entre lo que el proyecto dice y lo que el código hace. Cero texto hardcodeado.

**Cambios concretos:**
1. **Publicidad (H-01).** Según tu decisión (ver "Decisiones", D1):
   - *Opción A — sin ads:* eliminar `presentation/components/results/ContextualAd.tsx` y su uso en `ResultCard.tsx` (línea 64).
   - *Opción B — afiliación honesta:* mover el componente a las páginas de contenido `app/[locale]/sounds/[type]/page.tsx`, detrás de `isEnabled("affiliate.enabled")`; textos a `i18n/messages/{es,en}.json`; enlaces reales con `rel="sponsored nofollow"`; **prohibir** anuncios en `yowl`/`growl`/`hiss` (clases clínicamente sensibles); etiquetado "Patrocinado" traducido y con contraste AA.
2. **Landing hardcodeada (H-04).** En `app/[locale]/page.tsx`: mover el bloque "Regístrate…/Crear cuenta" a `i18n/messages`; sustituir "IA predictiva" por copy honesto; condicionar la CTA de cuenta a `isEnabled("accounts.enabled")` (hoy `false`) → si no, ocultar o mostrar "lista de espera".
3. **Guardas automáticas.** Añadir regla ESLint `no-restricted-syntax` que prohíba `JSXText` no vacío en `app/**` y `presentation/**` (forzar `t()`), y `no-restricted-imports` que prohíba importar `ContextualAd` desde `results/`.

**Archivos:** `ContextualAd.tsx`, `ResultCard.tsx`, `page.tsx`, `sounds/[type]/page.tsx`, `i18n/messages/es.json`, `i18n/messages/en.json`, `eslint.config.mjs`, `server/flags.ts` (nuevas flags).

**Criterio de aceptación:** `npm run lint` falla si hay texto literal en JSX o import prohibido; `/en` no muestra ni una palabra en español; no hay enlaces `href="#"`.

---

## W2 — Seguridad real (cerrar la brecha doc↔código)

**Objetivo:** implementar lo que ARCHITECTURE §8 promete.

**Cambios concretos:**
1. **CSP + HSTS (H-03).** En `next.config.ts` añadir `Content-Security-Policy` (arranque en `Content-Security-Policy-Report-Only`) y `Strict-Transport-Security`.
   - CSP base: `default-src 'self'`; `script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com`; `worker-src 'self' blob:`; `connect-src 'self' <CDN modelos>`; `frame-src https://challenges.cloudflare.com`; `img-src 'self' data:`; `style-src 'self' 'unsafe-inline'` (Tailwind v4); `object-src 'none'`; `base-uri 'self'`.
   - HSTS: `max-age=63072000; includeSubDomains; preload`.
   - Endpoint `/api/csp-report` para recoger violaciones durante la fase Report-Only; promover a enforcing tras 1 semana sin reportes.
2. **Rate limiting (H-03).** Implementar `server/security/rate-limit.ts` (token bucket). Aplicar en `app/api/events/route.ts` y en `server/actions/submit-feedback.ts`.
   - Infra según tu decisión (D2): Upstash Redis (recomendado, serverless) o limitador en memoria por instancia (suficiente para MVP).
3. **Endurecer `/api/events`.** Cap de tamaño de payload (rechazar > N KB), tope de longitud por valor de `props`, `Content-Length` check.
4. **Cadena de suministro (H-12).** Job `npm audit --audit-level=high` en `ci.yml` + `.github/dependabot.yml`. Fijar `next-auth` a versión estable al activar cuentas (W6); si no, documentar el riesgo de la beta.

**Archivos:** `next.config.ts`, nuevo `server/security/rate-limit.ts`, `app/api/events/route.ts`, `app/api/csp-report/route.ts` (nuevo), `submit-feedback.ts`, `.github/workflows/ci.yml`, `.github/dependabot.yml`.

**Criterio de aceptación:** cabeceras verificadas con test de integración; `/api/events` devuelve 429 al superar el límite y 413 al exceder tamaño; 0 dependencias `high/critical` en CI.

---

## W3 — SEO técnico (rescatar el idioma inglés)

**Objetivo:** indexabilidad correcta de ambos idiomas.

**Cambios concretos:**
1. **`canonical` self-referential (H-02).** En `lib/seo.ts`, `buildAlternates` debe recibir el `locale` actual y fijar `canonical: ${SITE_URL}/${locale}${clean}` (no `defaultLocale`). Mantener `x-default → defaultLocale` y `languages` por locale.
2. **`x-default` en sitemap (H-12).** En `sitemap.ts`, añadir la entrada `"x-default"` a `alternates.languages`.
3. **Verificación.** Test que afirme, para cada locale y ruta pública, que `canonical` coincide con su propia URL y que existe `x-default`.

**Archivos:** `lib/seo.ts`, `sitemap.ts`, nuevo `tests/seo/metadata.test.ts`.

**Criterio de aceptación:** la página `/en/...` declara `canonical=/en/...`; el test de metadata pasa para los 2 locales × todas las rutas públicas.

---

## W4 — Accesibilidad, UI y responsive (verificado, no asumido)

**Objetivo:** WCAG AA demostrable y patrón de tabs correcto.

**Cambios concretos:**
1. **Patrón Tabs (H-10).** En `AnalyzePanel.tsx`: navegación con flechas ←/→, `aria-controls`, roving `tabindex`, foco gestionado. (Alternativa: degradar a botones simples si no se requiere semántica de tabs — decisión menor, recomiendo completar el patrón.)
2. **Contraste/tamaño.** Auditar badges y textos pequeños (se resuelve parte con W1); garantizar AA (≥ 4.5:1 texto normal, ≥ 3:1 grande) en `globals.css` tokens y componentes.
3. **Tests a11y (H-10).** Añadir `vitest-axe` sobre `AnalyzePanel`, `ResultCard`, `Recorder`, landing y `/sounds/[type]`. Integrar en CI.
4. **Responsive verificado.** Suite de snapshots/visual o checks de breakpoints clave (360/768/1280); verificar targets táctiles ≥ 44px (ya se usa `min-h-11`).

**Archivos:** `AnalyzePanel.tsx`, `globals.css`, nuevos `tests/a11y/*.test.tsx`, `ci.yml`.

**Criterio de aceptación:** axe sin violaciones serias en las vistas clave; navegación completa por teclado del flujo grabar→resultado→feedback; 0 fallos de contraste AA.

---

## W5 — Rendimiento medido + optimización DSP

**Objetivo:** convertir presupuestos en mediciones y optimizar el hot path.

**Cambios concretos:**
1. **Lighthouse CI con presupuestos.** Añadir `@lhci/cli` al pipeline con budgets: LCP < 1.5 s (landing), INP < 200 ms, CLS < 0.05, JS inicial < 90 kB gzip. Falla el build si se incumple.
2. **DSP (H-08).** En `log-mel.ts`: memoizar `melFilterbank` por `(nMels,fftSize,sampleRate)` a nivel módulo. En `fft.ts`: scratch buffers reutilizables `re/im` en `powerSpectrum`. En `features.ts`: evaluar autocorrelación vía FFT (Wiener–Khinchin) para `trackF0` en segmentos largos. Microbenchmark en CI que fije el coste por inferencia.
3. **`crossOriginIsolation` (H-07).** Evaluar COOP/COEP en las rutas de análisis (no en landing); configurar `ort.env.wasm.numThreads`; medir antes/después. Si COEP rompe Turnstile/CDN, aislar solo `/analyze` o usar `credentialless`.

**Archivos:** `log-mel.ts`, `fft.ts`, `features.ts`, `next.config.ts`, `ci.yml`, nuevos `tests/perf/*.bench.ts`.

**Criterio de aceptación:** Lighthouse ≥ 95 en Performance (landing) en CI; reducción medible de tiempo de primera inferencia (objetivo ≥ 25%).

---

## W6 — Cerrar el bucle de datos (esto es lo que más te importa)

**Objetivo:** que las correcciones **influyan en las predicciones** y se sincronicen.

**Cambios concretos:**
1. **Realimentación local por gato (prioritario, sin servidor).** Nuevo `domain/analysis/cat-priors.ts` + `application/use-cases/apply-cat-priors.ts`:
   - Mantener priors bayesianos (counts α por clase) por `catId`, derivados de las correcciones guardadas en IndexedDB.
   - Ajustar las probabilidades del motor con el prior del gato seleccionado **antes** de aplicar la política de umbrales (`applyUnknownPolicy`).
   - Nuevo store IDB `catPriors` + migración versionada en `persistence/db.ts`; actualizar prior en cada `recordFeedback`.
   - Tests de dominio: una corrección repetida de `meow→trill` para un gato desplaza la decisión en señales ambiguas, sin romper señales claras.
2. **Persistencia y sync en servidor (H-05, requiere W2 + cuentas).** Activar el `db.insert(feedback)` en `submit-feedback.ts` con la sesión Auth.js, rate-limit (W2) y consentimiento registrado; sync IndexedDB↔Postgres (last-write-wins por entidad); donación de audio opt-in a object storage.
3. **Cuentas (Auth.js v5).** Implementar lo que hoy no existe: `auth.ts`, `app/api/auth/[...nextauth]/route.ts`, magic link por email; habilitar flag `accounts.enabled`; conectar la CTA de la landing (W1).

> Nota: el punto 1 es local-first y entrega valor de inmediato (cumple "mejora con el uso" sin backend). Los puntos 2–3 dependen de tu decisión D3 (activar cuentas/servidor ahora o después).

**Archivos:** nuevos `cat-priors.ts`, `apply-cat-priors.ts`, `auth.ts`, `app/api/auth/[...nextauth]/route.ts`; modificar `persistence/db.ts`, `repositories.ts`, `analyze-audio.ts`, `record-feedback.ts`, `submit-feedback.ts`, `flags.ts`.

**Criterio de aceptación:** demostrar con test que N correcciones por gato cambian la predicción en casos ambiguos; (si D3=sí) feedback escrito en Postgres con rate-limit y consentimiento.

---

## W7 — Pureza arquitectónica y calidad

**Objetivo:** eliminar fugas y subir la consistencia.

**Cambios concretos:**
1. **Inyectar `clock` e `idGenerator` (H-09).** `analyze-audio.ts` deja de llamar `Date.now()`/`performance.now()`/`crypto.randomUUID()` directamente; los recibe por deps (o vía `domain/shared/clock`). Fakes deterministas en tests.
2. **Robustez de runtime (H-06).** `AudioContext.resume()` tras gesto en `recorder.ts`; timeout + `AbortController` en `analysis-store.ts`/`worker-pipeline.ts`; `app/[locale]/error.tsx` y `global-error.tsx` localizados.
3. **Consistencia.** Revisar `Uploader.tsx` (validación MIME/tamaño de archivo subido — no auditado a fondo), repositorios y `worker-pipeline.ts`.

**Archivos:** `analyze-audio.ts`, `domain/shared` (clock/id), `recorder.ts`, `analysis-store.ts`, `worker-pipeline.ts`, nuevos `error.tsx`/`global-error.tsx`, `Uploader.tsx`.

**Criterio de aceptación:** caso de uso testeable sin globales; el pipeline colgado pasa a estado `error` con telemetría; error de render muestra UI de recuperación.

---

## W8 — Anti-drift documental y verificación final

**Objetivo:** que doc y código no vuelvan a divergir; ML real validado.

**Cambios concretos:**
1. **Corregir drift.** README "46 tests" → valor real (o generar el número en CI). Actualizar ARCHITECTURE §8/§9 para reflejar el estado real de CSP/rate-limit/ads tras los cambios.
2. **Gate ML con datos reales (H-11).** Mantener `engine.onnx=false`; añadir al gate de regresión un umbral de macro-F1 **sobre held-out real (CatMeows)** y reporte de ECE como condición de publicación. (Ejecutable cuando haya datos reales — puede quedar como criterio documentado si los datos no están aún.)
3. **Verificación final con subagente.** Pase de revisión independiente: lint+typecheck+test+build verdes, Lighthouse CI, axe, y diff review de los cambios.

**Archivos:** `README.md`, `ARCHITECTURE.md`, `training/`, `ci.yml`.

**Criterio de aceptación:** check automatizado de coherencia; CI completo en verde; informe de verificación.

---

## Orden de ejecución sugerido

1. **Fase 1 (Quick Wins, sin dependencias):** W1 + W3 → recuperan confianza, marca y SEO con esfuerzo mínimo.
2. **Fase 2:** W2 (seguridad) + W7 (robustez/pureza).
3. **Fase 3:** W4 (a11y/UI) + W5 (rendimiento medido).
4. **Fase 4:** W6 (bucle de datos: primero realimentación local; luego servidor/cuentas si D3=sí).
5. **Cierre:** W8 (anti-drift + verificación).

---

## Decisiones que necesito de ti (bloquean parte del plan)

- **D1 — Publicidad:** ¿Eliminar `ContextualAd` por completo, o convertirla en afiliación honesta solo en páginas de contenido y detrás de flag?
- **D2 — Infra de rate limit:** ¿Upstash Redis (robusto, multi-instancia) o limitador en memoria por instancia (cero infra, suficiente para MVP)?
- **D3 — Servidor/cuentas ahora o después:** ¿Activo Auth.js + persistencia/sync de feedback en este ciclo (W6 completo), o me limito a la **realimentación local por gato** (W6.1) y dejo servidor/cuentas para más adelante?

Cuando me confirmes estas tres decisiones y des el visto bueno al plan, lo ejecuto en el orden indicado.
