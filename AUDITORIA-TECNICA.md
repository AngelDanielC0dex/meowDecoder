# Auditoría Técnica y de Producto — MeowDecoder

**Auditor:** Software Principal / CTO / UX (perfil senior)
**Fecha:** 13 de junio de 2026
**Alcance auditado:** repositorio completo `meowDecoder/` — `web/` (Next.js 15 / TS), `training/` (Python/ONNX), `docs/`, CI.
**Naturaleza:** auditoría estática sobre el código y la documentación entregados. **No** se ejecutó la app en navegador ni se midieron Core Web Vitals reales (ver §Limitaciones de esta auditoría). Todo hallazgo cita evidencia observable en archivos concretos.

---

## 1. Puntuación Global

# **72 / 100**

Desglose por área (peso indicativo):

| Área | Nota | Comentario de una línea |
|---|---|---|
| Arquitectura | 90 | Hexagonal/Clean real y bien aplicada; regla de dependencias forzada por lint. |
| Calidad de código | 85 | DSP riguroso, tipado estricto, `Result<T>` consistente; algún acoplamiento a globales. |
| Mantenibilidad | 84 | Puertos + composition root facilitan el cambio; documentación excepcional. |
| Deuda técnica | 70 | Deuda mayormente *planificada y honesta*, pero hay código contradictorio sin revisar. |
| UX / Usabilidad | 68 | Flujo claro; honestidad de incertidumbre como ventaja; CTA muerta y ad intrusivo restan. |
| Accesibilidad | 72 | Buenas bases (focus, skip-link, reduced-motion); patrón de tabs incompleto, sin tests axe. |
| SEO | 66 | Infra excelente, **pero un bug de `canonical` puede desindexar todo un idioma.** |
| Diseño / UI | 80 | Design tokens, fluid type, paleta con contraste declarado AA. |
| Responsive | 82 | Mobile-first real (fluid clamp, `min-h-dvh`, targets ≥44px). |
| Rendimiento | 74 | Local-first y carga diferida sobresalientes; faltan COOP/COEP y hay micro-asignaciones en el hot path DSP. |
| Seguridad | 62 | Turnstile + fail-closed bien; **CSP y rate-limiting documentados pero NO implementados.** |

La nota está penalizada sobre todo por un conjunto de **contradicciones entre lo que el proyecto dice de sí mismo y lo que el código hace** (publicidad, i18n, CSP, rate-limiting, auth). El núcleo de ingeniería es de nota alta; lo que falla es la "última milla" de la superficie de producto.

---

## 2. Resumen Ejecutivo

MeowDecoder es un proyecto con una **columna vertebral de ingeniería notablemente por encima de la media**: arquitectura hexagonal aplicada de verdad (no decorativa), un pipeline DSP escrito a mano y cubierto por tests de paridad JS↔Python, un contrato de modelo congelado y verificado en CI, una estrategia local-first coherente con privacidad y coste, y una documentación (ARCHITECTURE.md con 16 decisiones justificadas) que muchos productos en producción envidiarían. El posicionamiento "honesto por diseño" —clasificador con clase `unknown` de primer nivel— es además una ventaja competitiva y ética real.

Sin embargo, la auditoría revela una **grieta de coherencia preocupante en la capa de presentación y backend**: existe código que contradice directamente la documentación y la promesa de marca. El caso más grave es un componente de **publicidad (`ContextualAd`) inyectado en el resultado del analizador** —exactamente donde la arquitectura dice que NUNCA habrá publicidad— con textos **hardcodeados en español** que rompen la internacionalización, sin feature flag, con enlaces muertos, y que llega a ofrecer un anuncio de "consulta veterinaria" sobre un `yowl` (que puede indicar dolor): monetización sobre la angustia del animal, lo opuesto a "honesto por diseño". A esto se suman un **bug de `canonical` que auto-canonicaliza el idioma inglés hacia el español** (riesgo SEO de desindexación), un bloque de **marketing hardcodeado en español en la landing** con una **CTA a `/auth/signin` que es un 404** (la autenticación no existe en el código), y **CSP y rate-limiting que la documentación promete pero que el código no implementa**.

El diagnóstico es claro y, en cierto modo, alentador: **no hay un problema de capacidad de ingeniería, hay un problema de control de calidad de la superficie**. Los defectos críticos son baratos de corregir y de alto impacto. El proyecto está a un sprint de disciplina de pasar de "prototipo brillante con fugas" a "producto defendible".

---

## 3. The Path to 100 (3–5 palancas)

1. **Erradicar las contradicciones documento↔código (confianza y marca).** Eliminar o re-arquitecturar `ContextualAd`, internacionalizar TODO texto hardcodeado, e implementar lo que la doc ya promete (CSP, rate-limiting). Es la palanca de mayor ROI: barata y de impacto directo en confianza, legal y SEO. *(+8–10 pts)*
2. **Arreglar el SEO técnico real.** Corregir el `canonical` por-locale, añadir `x-default` en el sitemap, y validar indexabilidad. Sin esto, el motor SEO programático (su foso de adquisición) trabaja en contra de un idioma entero. *(+5–7 pts)*
3. **Cerrar el bucle de datos (el verdadero foso).** Activar la persistencia real del feedback (hoy es un no-op) y la donación de audio opt-in: sin datos reales, el modelo ML nunca supera al heurístico y el producto se estanca. *(+5 pts, habilita E2)*
4. **Endurecer la robustez móvil/iOS.** `AudioContext.resume()` tras gesto, timeout/abort en el pipeline, error boundary de React. Ataca el riesgo "40% de fallos en móvil" que la propia doc declara pero no mitiga en código. *(+4 pts)*
5. **Subir el techo de verificación.** Tests de a11y (axe), componentes y e2e (Playwright), más un gate de regresión con **datos reales** (no solo sintéticos) antes de activar el motor ONNX. *(+4 pts)*

---

## 4. Hallazgos por área (fichas)

> Severidad por colores: 🔴 Crítica · 🟠 Alta · 🟡 Media · 🟢 Baja.
> Impacto y Esfuerzo en escala 1–10.

---

### 4.1 🔴 H-01 — Publicidad inyectada en el resultado, contra la propia arquitectura, rompiendo i18n

- **Problema:** Anuncios hardcodeados dentro del flujo crítico del analizador.
- **Descripción:** `presentation/components/results/ContextualAd.tsx` define un mapa `AD_MAPPING` con anuncios por clase y se renderiza en `ResultCard.tsx` (línea 64: `<ContextualAd predictedClass={primary.cls} />`), entre la barra de confianza y las alternativas. Los textos ("Patrocinado", "Ver ofertas recomendadas", "Oferta Royal Canin", "Consulta Veterinaria 24/7") están **escritos a mano en español**, sin pasar por `next-intl`. No hay feature flag. Los enlaces son `link: "#"` (muertos).
- **Evidencia:**
  - `ARCHITECTURE.md` §9: *"Sin publicidad en la app; afiliación contextual discreta **solo en páginas de contenido**… Todo detrás de `feature_flags`."* `README.md`: *"**Sin publicidad** en la app."*
  - El componente vive en `results/` (superficie de app, no de contenido) y se renderiza siempre, sin `isEnabled(...)`.
  - Strings en español puro en `ContextualAd.tsx`; el resto de la UI usa `useTranslations`.
  - `yowl → { title: "Consulta Veterinaria", desc: "Atención médica felina 24/7" }`: un `yowl` puede señalar dolor/enfermedad; se monetiza la angustia.
- **Riesgo:**
  - *Corto:* usuarios en `/en` ven anuncios en español → rotura visible de i18n y de profesionalidad; enlaces muertos.
  - *Medio:* erosión de la promesa "honesto por diseño"; posible incumplimiento de normativa de publicidad (etiquetado/transparencia) y de la propia política de "sin ads".
  - *Largo:* daño reputacional y de confianza, justo el activo diferencial del producto; deuda de un patrón de monetización fuera de la arquitectura de flags.
- **Solución recomendada (paso a paso):**
  1. Decisión de producto: ¿hay ads o no? Si la política es "no ads en la app", **eliminar** el componente y su uso en `ResultCard`.
  2. Si se desea afiliación: moverla **solo a páginas de contenido** (`/sounds/[type]`), detrás de `isEnabled("affiliate.enabled")`, con textos en `i18n/messages/*`, enlaces reales con `rel="sponsored nofollow"` y etiquetado claro.
  3. Prohibir explícitamente cualquier anuncio en clases clínicamente sensibles (`yowl`, `growl`, `hiss`).
  4. Añadir un test que falle si `results/` importa `ContextualAd`.
- **Impacto:** 9 · **Esfuerzo:** 2 · **Prioridad:** Crítica · **Horizonte:** Inmediato.

---

### 4.2 🔴 H-02 — `canonical` auto-canonicaliza todos los idiomas al locale por defecto (riesgo de desindexación)

- **Problema:** Cada página, independientemente del idioma, declara su `canonical` apuntando al locale por defecto.
- **Descripción:** En `lib/seo.ts`, `buildAlternates()` fija `canonical: ${SITE_URL}/${routing.defaultLocale}${clean}`. Como `buildPageMetadata` lo usa para todas las páginas, la versión en inglés (`/en/...`) emite `<link rel="canonical" href=".../es/...">`. Esto le dice a Google que la página inglesa es un duplicado de la española.
- **Evidencia:** `lib/seo.ts` líneas de `buildAlternates`: `canonical: \`${SITE_URL}/${routing.defaultLocale}${clean}\``; el `x-default` también apunta a `defaultLocale` (correcto), pero el `canonical` debería ser **self-referential por locale**.
- **Riesgo:**
  - *Corto:* Google consolida señales hacia `/es`; las URLs `/en` pierden ranking propio.
  - *Medio:* indexación pobre o nula del idioma inglés → la mitad del SEO programático (6 vocalizaciones × 2 idiomas) no captura tráfico.
  - *Largo:* el "foso" de adquisición orgánica queda tuerto; difícil de diagnosticar a posteriori.
- **Solución recomendada:**
  1. En `buildAlternates`, calcular el canonical con el **locale actual**, no el por defecto: pasar `locale` y usar `canonical: ${SITE_URL}/${locale}${clean}`.
  2. Mantener `x-default → defaultLocale` y `languages` por locale (ya correctos).
  3. Añadir `x-default` también en `sitemap.ts` (hoy solo emite `es`/`en`; ver H-12).
  4. Verificar con la herramienta de inspección de URLs y un test de metadata por locale.
- **Impacto:** 8 · **Esfuerzo:** 2 · **Prioridad:** Crítica · **Horizonte:** Inmediato.

---

### 4.3 🔴 H-03 — CSP y rate-limiting documentados pero ausentes en el código

- **Problema:** La documentación de seguridad promete controles que el código no implementa.
- **Descripción:** `ARCHITECTURE.md` §8 afirma *"CSP estricta"* y *"rate limiting en rutas de escritura"*. En `next.config.ts`, los `securityHeaders` incluyen `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` y `Permissions-Policy`, pero **no** `Content-Security-Policy` ni `Strict-Transport-Security` (HSTS). Ni `/api/events` ni la server action `submitFeedbackAction` aplican rate-limiting alguno.
- **Evidencia:** `next.config.ts` (lista `securityHeaders` sin CSP/HSTS); `app/api/events/route.ts` y `server/actions/submit-feedback.ts` (sin throttling, sin contador por IP/sesión).
- **Riesgo:**
  - *Corto:* sin CSP, una inyección de script (XSS) no tiene contención; sin HSTS, ventana a downgrade.
  - *Medio:* `/api/events` es un sumidero sin auth ni límite que acepta 50 eventos/lote con `props: z.record(z.string(), z.unknown())` (valores sin tope de tamaño) → abuso/DoS y, cuando se conecte a `analytics_events`, escritura masiva de `jsonb`.
  - *Largo:* brecha entre seguridad declarada y real → falso sentido de cumplimiento en auditorías/clientes enterprise.
- **Solución recomendada:**
  1. Añadir CSP (empezar en `Report-Only`): `default-src 'self'`; permitir `'wasm-unsafe-eval'` (ORT-web), el endpoint de Cloudflare Turnstile (`challenges.cloudflare.com`), `worker-src 'self' blob:`, `connect-src` para `/api` y CDN de modelos. Iterar hasta 0 reportes y promover a enforcing.
  2. Añadir `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
  3. Rate-limit en `/api/events` y en la server action (p. ej. token bucket por IP en edge, o Upstash/Redis): límite por minuto + tope de tamaño de payload (cap por `props`).
  4. Actualizar §8 si alguna medida se pospone, para que doc y código no diverjan.
- **Impacto:** 8 · **Esfuerzo:** 5 · **Prioridad:** Crítica · **Horizonte:** 30 días (CSP en Report-Only: inmediato).

---

### 4.4 🟠 H-04 — Marketing hardcodeado en la landing + CTA a una autenticación inexistente (404)

- **Problema:** Bloque promocional en español fijo y enlace a `/auth/signin` que no existe.
- **Descripción:** `app/[locale]/page.tsx` incluye un recuadro con *"Regístrate para afinar las predicciones utilizando IA predictiva"*, *"Guarda el historial…"* y un `Link href="/auth/signin"` → "Crear cuenta gratis". Todo el texto está **hardcodeado en español** (no usa `t(...)`). Además **no existe ninguna implementación de Auth.js** en el código: no hay `auth.ts`, ni `app/api/auth/*`, ni uso de `next-auth` en `src/` (solo está en `package.json`).
- **Evidencia:** `page.tsx` (strings literales en español dentro de JSX); `find -iname "*auth*"` → vacío; el README/ARCH citan Auth.js como E3 (no implementado todavía). `submit-feedback.ts` referencia `session.user.id` solo en un comentario.
- **Riesgo:**
  - *Corto:* usuarios en `/en` leen español; quien pulse "Crear cuenta" llega a un 404 → fricción y pérdida de confianza en la primera pantalla.
  - *Medio:* la frase "IA predictiva" es marketing vacío que choca con el posicionamiento honesto.
  - *Largo:* señales mixtas de calidad en la página de mayor tráfico orgánico.
- **Solución recomendada:**
  1. Si la cuenta no está lista (E3), **retirar la CTA** o sustituirla por una lista de espera/explicación, internacionalizada.
  2. Mover todo el copy a `i18n/messages/es.json` y `en.json`.
  3. Reemplazar "IA predictiva" por lenguaje preciso y honesto.
  4. Añadir un lint/test que prohíba JSX con texto literal fuera de `t()` en `app/` y `presentation/`.
- **Impacto:** 7 · **Esfuerzo:** 2 · **Prioridad:** Alta · **Horizonte:** Inmediato.

---

### 4.5 🟠 H-05 — La persistencia del feedback es un no-op: Turnstile sin destino

- **Problema:** El feedback se verifica con Turnstile pero nunca se escribe en el servidor.
- **Descripción:** `submitFeedbackAction` valida con Zod, verifica el token Turnstile contra Cloudflare y luego… el `db.insert(feedback)` está **completamente comentado**; retorna `{ ok: true }`. El `FeedbackForm` carga el widget Turnstile (JS extra + dependencia Cloudflare) y llama a la acción, que no persiste nada en remoto (solo IndexedDB local vía `recordFeedback`).
- **Evidencia:** `server/actions/submit-feedback.ts` (bloque `// await db.insert(...)` comentado, "E3"); `FeedbackForm.tsx` (importa `Turnstile`, llama `submitFeedbackAction`).
- **Riesgo:**
  - *Corto:* coste/peso de Turnstile y de la verificación de red sin beneficio; "seguridad teatral".
  - *Medio:* el claim del README *"un sistema de corrección que mejora el producto con el uso"* no es cierto a nivel de agregación server-side; el dataset propio (el foso) no se está construyendo.
  - *Largo:* sin datos reales agregados, E2 (modelo real) se retrasa indefinidamente.
- **Solución recomendada:**
  1. Si E3 aún no llega: **no** montar Turnstile todavía (evita peso/expectativa), o conectar ya la escritura a una tabla mínima.
  2. Si se activa: descomentar el insert con la sesión Auth.js, rate-limit y consentimiento registrado; test de integración del camino feliz y de bot-detected.
- **Impacto:** 6 · **Esfuerzo:** 4 · **Prioridad:** Alta · **Horizonte:** 30–90 días.

---

### 4.6 🟠 H-06 — Robustez móvil/iOS: falta `AudioContext.resume()`, timeout de pipeline y error boundary

- **Problema:** Tres puntos de fallo en el flujo de captura/análisis sin red de seguridad.
- **Descripción:**
  - `infrastructure/audio/recorder.ts` crea `new AudioContext()` para el medidor de nivel pero **nunca llama a `.resume()`**. En iOS Safari el contexto puede arrancar `suspended`, dejando el `AnalyserNode` (medidor) en silencio.
  - El store (`analysis-store.ts`) pone `status: "processing"` y espera `analyzeAudio`; **no hay timeout/abort**. Si el Web Worker se cuelga, la UI queda atascada en "processing" para siempre.
  - **No existe `error.tsx`/`global-error.tsx`**: un error de render no controlado cae al fallback por defecto de Next, sin recuperación localizada.
- **Evidencia:** `recorder.ts` (sin `audioContext.resume()`); `ARCHITECTURE.md` §11 lista *"AudioContext resume tras gesto"* como mitigación —no implementada—; `analysis-store.ts` (sin `AbortController`/timeout); `find error.tsx/global-error.tsx` → vacío.
- **Riesgo:** la propia doc estima *"~40% de fallos de captura en móvil"*; sin estas mitigaciones, ese riesgo se materializa en el segmento mayoritario.
- **Solución recomendada:**
  1. Tras el gesto de grabar, `await audioContext.resume()` y comprobar `state === "running"`.
  2. Envolver el pipeline en un timeout (p. ej. 20 s) con `AbortController`; en timeout, `status:"error"` + telemetría `stage:"pipeline-timeout"`.
  3. Añadir `app/[locale]/error.tsx` y `global-error.tsx` localizados con botón de reintento.
  4. Matriz de pruebas iOS Safari real (la doc ya la prioriza).
- **Impacto:** 7 · **Esfuerzo:** 4 · **Prioridad:** Alta · **Horizonte:** 30 días.

---

### 4.7 🟡 H-07 — `crossOriginIsolation` ausente: ORT-web cae a WASM monohilo (latencia de primera inferencia)

- **Problema:** Sin cabeceras COOP/COEP, onnxruntime-web no puede usar hilos (SharedArrayBuffer).
- **Descripción:** La decisión #8 apuesta por "WASM+SIMD por defecto" y cita latencia de primera inferencia en móvil de gama baja como riesgo. Para WASM **multihilo**, el navegador exige `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` (estado `crossOriginIsolated`). `next.config.ts` no las define, así que ORT corre en un solo hilo.
- **Evidencia:** `next.config.ts` (sin COOP/COEP); `onnx-engine.ts` usa `executionProviders: ["webgpu"?, "wasm"]` sin configurar hilos.
- **Riesgo:** inferencia más lenta en el dispositivo objetivo declarado; peor INP percibido en el primer análisis. *(Nota: activar COEP `require-corp` puede romper recursos cross-origin —Turnstile, CDN— por lo que requiere `crossorigin` y CORP en ellos; de ahí que sea Media y no Alta.)*
- **Solución recomendada:**
  1. Evaluar COOP/COEP **solo en las rutas de análisis** (no en la landing) si hay recursos cross-origin.
  2. Configurar `ort.env.wasm.numThreads` y servir el `.wasm` con SIMD; medir antes/después.
  3. Priorizar WebGPU donde exista (ya intentado) como vía principal en gama alta.
- **Impacto:** 5 · **Esfuerzo:** 5 · **Prioridad:** Media · **Horizonte:** 90 días.

---

### 4.8 🟡 H-08 — Micro-asignaciones en el hot path DSP (filterbank recomputado, espectros por frame)

- **Problema:** Trabajo redundante y presión de GC en la extracción de features/log-mel.
- **Descripción:**
  - `log-mel.ts`: `melFilterbank(nMels, FRAME_SIZE, SAMPLE_RATE)` se **recalcula en cada llamada** a `logMel` (64 filtros reconstruidos por inferencia).
  - `fft.ts` `powerSpectrum`: asigna dos `Float64Array(n)` **por frame**; en log-mel son 96 frames/inferencia, más los de `spectralStats`.
  - `features.ts` `trackF0`: autocorrelación por fuerza bruta O(frames × lags × frameLen); para un `yowl` largo (hasta `MAX_SEGMENT_S`) es el mayor coste de CPU.
- **Evidencia:** `log-mel.ts` (llamada a `melFilterbank` dentro de `logMel`); `fft.ts` (`new Float64Array(n)` ×2 por frame); `features.ts` (`trackF0` triple bucle).
- **Riesgo:** latencia añadida en la primera inferencia y churn de GC en móvil gama baja (segmento objetivo). No es bug —corre en Worker— pero merma el presupuesto INP < 200 ms declarado.
- **Solución recomendada:**
  1. Memoizar el filterbank por `(nMels, fftSize, sampleRate)` a nivel módulo.
  2. Reutilizar buffers `re`/`im` (scratch) entre frames en `powerSpectrum`.
  3. Evaluar autocorrelación vía FFT (Wiener–Khinchin) para `trackF0` en segmentos largos.
  4. Microbenchmark en CI para fijar el presupuesto.
- **Impacto:** 5 · **Esfuerzo:** 4 · **Prioridad:** Media · **Horizonte:** 90 días.

---

### 4.9 🟡 H-09 — Fuga de pureza en el caso de uso `analyzeAudio` (globales en vez de puertos)

- **Problema:** La "orquestación pura" depende de globales de entorno.
- **Descripción:** `application/use-cases/analyze-audio.ts` —documentado como *"Pure orchestration — every capability arrives through a port"*— llama directamente a `performance.now()`, `Date.now()` y `crypto.randomUUID()`. La arquitectura declara un `clock` en `domain/shared`, no utilizado aquí.
- **Evidencia:** `analyze-audio.ts` (`performance.now()`, `Date.now()`, `crypto.randomUUID()`); `ARCHITECTURE.md` §3 lista `shared/ … clock`.
- **Riesgo:** tests no deterministas en tiempo/IDs; contradice la disciplina de pureza que el resto del dominio sí respeta; acoplamiento sutil a entorno browser.
- **Solución recomendada:** inyectar `clock` y un `idGenerator` por las deps del caso de uso (o vía `domain/shared`), y usarlos; fakes deterministas en los tests.
- **Impacto:** 4 · **Esfuerzo:** 3 · **Prioridad:** Media · **Horizonte:** 90 días.

---

### 4.10 🟡 H-10 — Accesibilidad: patrón de tabs incompleto, contraste del badge "Patrocinado", sin tests axe

- **Problema:** Bases de a11y buenas, pero con huecos concretos y sin verificación automatizada.
- **Descripción:**
  - `AnalyzePanel.tsx` usa `role="tablist"/"tab"/"tabpanel"` y `aria-selected`, pero **sin navegación con flechas, sin `tabindex` roving ni `aria-controls`** → patrón ARIA Tabs incompleto (APG).
  - `ContextualAd` badge "Patrocinado": `bg-ink-200 text-ink-600` a `text-[10px]` → muy probable fallo de contraste AA y tamaño sub-mínimo (además de H-01).
  - La decisión #15 promete *"+ axe"*, pero **no hay ningún test axe** en `tests/`.
- **Evidencia:** `AnalyzePanel.tsx` (tabs); `ContextualAd.tsx` (badge); `grep axe tests` → vacío; 39 casos de test, todos DSP/dominio/inferencia.
- **Riesgo:** usuarios de teclado/lector de pantalla con experiencia degradada en el control principal; regresiones de a11y invisibles sin gate.
- **Solución recomendada:**
  1. Completar el patrón Tabs (flechas, `aria-controls`, roving tabindex) **o** degradar a botones simples si no se requiere semántica de tabs.
  2. Añadir `jest-axe`/`vitest-axe` sobre `AnalyzePanel`, `ResultCard`, landing.
  3. Corregir contraste/tamaño del badge (se resuelve al ejecutar H-01).
- **Impacto:** 5 · **Esfuerzo:** 4 · **Prioridad:** Media · **Horizonte:** 90 días.

---

### 4.11 🟡 H-11 — Gate de regresión circular: modelo sintético vs heurístico sobre datos sintéticos

- **Problema:** El "modelo supera al baseline" se mide sobre la misma familia sintética que ambos conocen.
- **Descripción:** El modelo publicado (`mlp-synthetic-2026.06.0`) se entrena con señales paramétricas; el gate compara macro-F1 1.000 (modelo) vs 0.565 (heurístico) en un held-out **sintético**. El heurístico fue afinado con los mismos priors bioacústicos que generan esas señales → comparación auto-referencial. Demuestra el *plumbing*, no el rendimiento real.
- **Evidencia:** `README.md` §Verificación y §Contrato (advertencia explícita); `heuristic-engine.ts` (rangos calibrados a priors); `training/data/synthetic/*.npz`.
- **Riesgo:** falsa confianza si alguien activa `engine.onnx=true` en prod creyendo que "el modelo gana"; un modelo que nunca vio un gato real sustituiría a una heurística defendible. *(Mitigado hoy: el flag por defecto es `false`.)*
- **Solución recomendada:**
  1. Mantener `engine.onnx=false` hasta tener held-out **real** (CatMeows), split por gato emisor (ya planificado en §6).
  2. Añadir al gate un umbral de macro-F1 **sobre datos reales** como condición de publicación (no solo paridad).
  3. Reportar ECE/calibración real antes de activar.
- **Impacto:** 6 · **Esfuerzo:** 6 · **Prioridad:** Media · **Horizonte:** 90–180 días.

---

### 4.12 🟢 H-12 — SEO menor: sitemap sin `x-default`; deuda de dependencia en `next-auth` beta; CI sin `npm audit`

- **Problema:** Varios huecos menores de SEO/seguridad de cadena de suministro.
- **Descripción:**
  - `sitemap.ts` emite alternates solo `es`/`en`, **sin `x-default`** (la metadata por página sí lo tiene, vía `lib/seo.ts`).
  - `package.json` fija `next-auth: ^5.0.0-beta.20` (auth en **beta** para un producto propietario).
  - El CI (`ci.yml`) corre lint/typecheck/test/build y paridad, pero **no** `npm audit`/Dependabot; ARCH §Seguridad cita "dependencias vulnerables".
  - Drift de documentación: README dice "46 tests"; el repo tiene **39 casos** (`it/test`).
- **Evidencia:** `sitemap.ts`; `package.json`; `.github/workflows/ci.yml`; conteo de tests.
- **Riesgo:** señales hreflang incompletas en sitemap; rotura potencial al estabilizarse Auth.js v5; CVEs sin detección temprana; doc poco fiable.
- **Solución recomendada:** añadir `x-default` al sitemap; fijar `next-auth` a versión estable al migrar a E3; añadir job de `npm audit --audit-level=high` + Dependabot; corregir el conteo en README (o automatizarlo).
- **Impacto:** 3 · **Esfuerzo:** 2 · **Prioridad:** Baja · **Horizonte:** 30–90 días.

---

### Áreas con información insuficiente (no se inventan hallazgos)

- **Core Web Vitals reales (TTFB/LCP/INP/CLS):** no se ejecutó la app ni Lighthouse; las cifras del §7 de ARCHITECTURE son presupuestos, no mediciones. La estructura (SSG, carga diferida, fluid type, dimensiones reservadas) es favorable, pero **no verificada**.
- **Backend en ejecución:** la mayoría de rutas/tablas están definidas pero inactivas (E2/E3). No se evalúa comportamiento real de DB, migraciones aplicadas, ni Auth.js (inexistente en código).
- **Componentes no leídos en detalle:** `Uploader.tsx`, `CatManager.tsx`, `HistoryList.tsx`, `worker-pipeline.ts`, repositorios IDB — revisados de forma indirecta; un pase específico podría revelar matices de validación de archivos subidos (tipo/tamaño/MIME) que aquí no se afirman.
- **Bundle size real:** no se ejecutó `next build`/análisis de bundle; el objetivo <90 kB no se confirma.

---

## 5. Análisis de Riesgos

### 5.1 Top 10 riesgos del proyecto

1. **Contradicción marca↔código (ads en el analizador, H-01):** daño de confianza y posible exposición legal/normativa. *Crítico.*
2. **Desindexación de un idioma por `canonical` erróneo (H-02):** anula la mitad del foso SEO. *Crítico.*
3. **Seguridad declarada ≠ real (CSP/rate-limit, H-03):** XSS sin contención y endpoints sin límite. *Crítico.*
4. **Datos reales nunca capturados (feedback no-op, H-05):** el modelo ML no progresa; el producto se estanca en heurístico. *Alto.*
5. **Fallos de captura en móvil/iOS (H-06):** ~40% del público objetivo, con mitigaciones no implementadas. *Alto.*
6. **CTA/auth muerta en landing (H-04):** fricción y 404 en la primera pantalla. *Alto.*
7. **Activación prematura del modelo ONNX (H-11):** sustituir heurística defendible por un modelo no validado con datos reales. *Medio.*
8. **Dependencia de auth en beta (H-12):** rotura al estabilizarse Auth.js v5. *Medio.*
9. **Sin verificación de a11y/e2e (H-10):** regresiones invisibles en accesibilidad y flujos. *Medio.*
10. **Presupuesto de rendimiento no medido + micro-asignaciones DSP (H-07/H-08):** INP/LCP podrían incumplir el objetivo en gama baja. *Medio.*

### 5.2 Cuellos de botella que impedirán escalar

- **Datos, no código:** el cuello real es la **ausencia de un bucle de datos activo** (donación + feedback agregado). Sin él, no hay modelo real ni personalización; toda la arquitectura ML queda ociosa.
- **`/api/events` sin límites:** al conectarlo a `analytics_events`, el `jsonb` sin tope y sin rate-limit es un cuello de escritura y un riesgo de coste.
- **`trackF0` O(n·lags):** en uso intensivo o audios largos, dominará la latencia por análisis.
- **Single-thread WASM (H-07):** techo de throughput de inferencia en cliente hasta habilitar hilos/WebGPU.

### 5.3 Decisiones actuales que darán problemas graves a futuro

- **Monetización fuera del sistema de flags (H-01):** sienta el precedente de "parches" que evaden la arquitectura. Corregir el patrón, no solo el componente.
- **`canonical` global a `defaultLocale` (H-02):** difícil de detectar tarde; cuanto más contenido se publique, mayor el daño acumulado.
- **Doc que promete lo no implementado (H-03/H-04):** genera falsa seguridad en revisiones y onboarding.

### 5.4 Sobreingeniería (over-engineering)

- **Arquitectura hexagonal completa + `Result` monad + branded IDs + composition root + RPC tipado propio** para una app que hoy tiene **un** flujo real y un backend no-op. Está **bien ejecutada y justificada por el roadmap**, pero es inversión adelantada: si E2–E5 no se ejecutan, es complejidad sin retorno.
- **Esquema DB completo (`subscriptions`, `catPriors`, `modelVersions`, `featureFlags`)** definido y sin uso. Barato de mantener, pero es "schema-ahead-of-need".

### 5.5 Infraingeniería (soluciones frágiles)

- **`/api/events`:** `props` ilimitado, sin auth, sin rate-limit (H-03).
- **Feedback con Turnstile pero sin persistencia (H-05):** seguridad teatral.
- **Sin error boundary ni timeout de pipeline (H-06):** estados terminales colgados.
- **i18n eludido por strings hardcodeados (H-01/H-04):** frágil ante el segundo idioma.

### 5.6 Dependencias críticas

- **Internas:** el **contrato del modelo** (`contract.ts` ↔ `manifest.json` ↔ `config.yaml`) es el punto único de verdad; bien protegido por el contract test. La **paridad de features JS↔Python** es crítica y, acertadamente, está en CI.
- **Externas:** `onnxruntime-web` (~5 MB, motor de inferencia), `Cloudflare Turnstile` (anti-bot), `next`/`react` 19 (current), `next-auth` **beta** (riesgo), Postgres/Drizzle (no activo aún), datasets públicos felinos (CatMeows/Zenodo) — escasos (~10³ muestras), el mayor riesgo del lado ML.

### 5.7 Riesgos operativos y de negocio derivados de la tecnología

- **Reputación/legal:** ads no etiquetados/idioma cruzado y monetización de señales clínicas (H-01) pueden violar normativa de consumo/publicidad y dañar la marca "honesta".
- **Adquisición:** el bug de SEO (H-02) compromete el canal orgánico, principal vía de crecimiento de bajo coste del diseño local-first.
- **Coste:** sin rate-limit, los endpoints abiertos pueden disparar coste/abuso al activarse el backend.
- **Time-to-value ML:** sin bucle de datos, el diferencial "mejora con el uso" no se cumple → riesgo de churn por expectativas.

---

## 6. Matriz de Priorización (Impacto vs Esfuerzo)

### ⚡ Quick Wins — Alto impacto, bajo esfuerzo *(hacer ya)*
- **H-01** Eliminar/re-arquitecturar `ContextualAd` (I9/E2). *Confianza + i18n + legal en un cambio barato.*
- **H-02** Corregir `canonical` por locale (I8/E2). *Salva el SEO de un idioma con una línea.*
- **H-04** Quitar/i18n del bloque de marketing + CTA muerta (I7/E2). *Primera pantalla, coste mínimo.*
- **H-12 (parcial)** `x-default` en sitemap + corregir conteo de tests (I3/E1).

*Justificación:* defectos de superficie con impacto desproporcionado en confianza, marca y adquisición; ninguno toca el núcleo arquitectónico.

### 🏗️ High Impact Initiatives — Alto impacto, alto esfuerzo *(planificar)*
- **H-03** CSP (Report-Only→enforce) + HSTS + rate-limiting (I8/E5).
- **H-05** Activar persistencia de feedback + donación opt-in (I6/E4–6) → habilita el bucle de datos.
- **H-06** Robustez móvil/iOS (resume, timeout, error boundary) (I7/E4).

*Justificación:* mueven la aguja en seguridad real, datos y conversión móvil; requieren diseño y pruebas, no son parches.

### 🎯 Strategic Bets — Bajo impacto inmediato, alto esfuerzo (necesarios a futuro)
- **H-11** Validación del modelo con datos **reales** y gate de publicación por macro-F1 real (I6/E6).
- **H-07** `crossOriginIsolation` + hilos WASM/WebGPU (I5/E5).
- **Tests e2e (Playwright)** y suite de a11y (axe) (I5/E5).

*Justificación:* condicionan la fase ML y el techo de rendimiento/calidad; su retorno aparece cuando crece el uso real.

### 🧹 Low Priority — Bajo impacto, bajo esfuerzo *(oportunista)*
- **H-08** Memoizar filterbank / reutilizar buffers DSP (I5/E4) — subir si las mediciones lo exigen.
- **H-09** Inyectar `clock`/`idGenerator` en el caso de uso (I4/E3).
- **H-12 (resto)** `npm audit`/Dependabot; fijar `next-auth` estable (I3/E2).

---

## 7. Roadmap de evolución (6 meses → 100/100)

> Supuesto: 1–2 ingenieros. Cada mes cierra con CI verde y sin drift doc↔código.

### Mes 1 — "Coherencia y confianza" (Quick Wins críticos)
- **Objetivos:** eliminar contradicciones marca↔código; arreglar SEO técnico; saneamiento i18n.
- **Entregables:** H-01 resuelto (sin ads en app o afiliación correcta y flagueada en contenido); H-02 `canonical` por locale; H-04 marketing i18n + CTA condicionada; H-12 `x-default` en sitemap; lint que prohíbe texto literal fuera de `t()` y `import ContextualAd` en `results/`.
- **Dependencias:** decisión de producto sobre monetización.
- **Riesgos del mes:** decisión de ads se demora y bloquea H-01.
- **KPI técnico:** 0 strings hardcodeados en `app/`+`presentation/`; 100% URLs con canonical self-referential (verificado en test).
- **Resultado de negocio:** marca "honesta" intacta; SEO de ambos idiomas indexable.

### Mes 2 — "Seguridad real"
- **Objetivos:** cerrar la brecha seguridad declarada↔implementada.
- **Entregables:** CSP en Report-Only→enforce, HSTS, COOP/COEP evaluado; rate-limiting en `/api/events` y server action; cap de tamaño de payload; `npm audit` + Dependabot en CI.
- **Dependencias:** infra de rate-limit (edge/Redis); inventario de orígenes (Turnstile/CDN) para CSP.
- **Riesgos del mes:** CSP rompiendo ORT/Turnstile → mitigado con Report-Only.
- **KPI técnico:** 0 violaciones CSP en Report-Only durante 1 semana; 0 dependencias `high/critical`.
- **Resultado de negocio:** apto para clientes/partners exigentes; superficie de abuso acotada.

### Mes 3 — "Robustez móvil y verificación"
- **Objetivos:** ganar el 40% móvil; subir el techo de tests.
- **Entregables:** `AudioContext.resume()`, timeout/abort de pipeline, `error.tsx`/`global-error.tsx`; suite axe + tests de componentes; Playwright e2e del flujo grabar→resultado→feedback; matriz iOS Safari.
- **Dependencias:** dispositivos/navegadores reales (BrowserStack o similar).
- **Riesgos del mes:** peculiaridades iOS difíciles de reproducir en CI.
- **KPI técnico:** tasa de error de captura móvil < 5% en telemetría; cobertura e2e del flujo crítico 100%.
- **Resultado de negocio:** conversión de análisis completados ↑ en móvil.

### Mes 4 — "Bucle de datos" (habilita ML real)
- **Objetivos:** activar persistencia de feedback y donación opt-in.
- **Entregables:** Auth.js v5 estable + magic link; `submitFeedbackAction` escribiendo a DB con consentimiento; donación de audio a object storage; sync IndexedDB↔Postgres (last-write-wins).
- **Dependencias:** Mes 2 (rate-limit/seguridad) listo; infra DB/almacenamiento.
- **Riesgos del mes:** privacidad/consentimiento mal modelados → bloqueo legal.
- **KPI técnico:** % de sesiones con feedback persistido; latencia de sync p95.
- **Resultado de negocio:** comienza la construcción del dataset propio (el foso).

### Mes 5 — "Modelo real y rendimiento"
- **Objetivos:** entrenar/validar modelo con datos reales; optimizar inferencia.
- **Entregables:** entrenamiento CatMeows + augmentación, split por gato; gate de publicación por **macro-F1 real** y ECE; A/B ONNX vs heurístico; H-08 (memoización/buffers DSP, FFT-autocorr); hilos WASM/WebGPU medidos.
- **Dependencias:** datos del Mes 4; H-11.
- **Riesgos del mes:** datos reales insuficientes → modelo no supera baseline (plan B: seguir en heurístico).
- **KPI técnico:** macro-F1 real ≥ baseline + margen; INP < 200 ms en gama media; LCP landing < 1.5 s (medido).
- **Resultado de negocio:** salto de calidad percibida en clasificación; activación segura de ONNX.

### Mes 6 — "Pulido a 100 y monetización limpia"
- **Objetivos:** cerrar deuda menor; activar premium por flags; medir todo.
- **Entregables:** H-09 (clock/id inyectados); personalización por gato (priors bayesianos); premium (Stripe + flags) con afiliación correcta en contenido; Lighthouse CI con presupuestos; consolidación de docs (sin drift).
- **Dependencias:** Meses 4–5.
- **Riesgos del mes:** scope creep de premium.
- **KPI técnico:** Lighthouse ≥ 95 en Perf/SEO/Best/A11y en CI; 0 drift doc↔código (check automatizado).
- **Resultado de negocio:** vías de ingreso activas sin comprometer la confianza; producto en estado "100/100" defendible.

---

## 8. Autodiagnóstico (segunda pasada)

**Problemas ocultos detectados en la revisión:**
- **Canonical apuntando siempre a `defaultLocale`** (H-02) no es solo "SEO menor": es el tipo de fallo que pasa la revisión humana porque la metadata "parece correcta". Lo elevé a Crítico.
- **El medidor de nivel sin `resume()`** (H-06) se manifiesta solo en iOS — fácil de pasar por alto en desarrollo en escritorio; es precisamente el riesgo que la doc declara y no cubre.
- **Turnstile activo con destino comentado** (H-05): un revisor podría asumir que "el feedback ya se guarda" porque el widget y la verificación existen.
- **Drift documental** (46 vs 39 tests, CSP/rate-limit prometidos): la documentación es tan buena que **induce a confiar en claims no implementados** — un riesgo en sí mismo.

**Recomendación contraria al consenso (y por qué aquí es la correcta):**
> **Pausar/retirar la integración de Turnstile y del backend de feedback hasta el Mes 4, en lugar de "dejarlo preparado".** El consenso de la industria premia "shippear stubs listos para conectar". Aquí es contraproducente: el stub (a) carga JS de terceros y una dependencia de Cloudflare en la página de resultado sin beneficio, (b) crea la **falsa impresión** —para usuarios y para el propio equipo— de que el producto "mejora con el uso" cuando no persiste nada, y (c) añade superficie sin rate-limit. En un producto cuyo activo central es la *honestidad*, exhibir un mecanismo de mejora que no mejora nada es una deuda de **confianza**, no solo técnica. Mejor un camino honesto: sin captcha hasta que haya escritura real, y entonces hacerlo completo.

**Segunda recomendación contraintuitiva (bonus):**
> **No activar `engine.onnx` aunque el gate diga 1.000 de macro-F1.** Lo intuitivo es "el modelo gana, actívalo". Pero el gate es circular (H-11): un modelo que nunca vio un gato real sustituiría a una heurística explicable y defendible. Mantener el heurístico como cara pública hasta tener validación real es la decisión correcta, aunque parezca "desaprovechar" el modelo.

---

## 9. 🏆 Las 5 acciones de mayor ROI

> Bloque destacado — máximo retorno por unidad de esfuerzo.

1. **Eliminar/re-arquitecturar `ContextualAd` (H-01).** Esfuerzo ~2, impacto en confianza/marca/i18n/legal ~9. Es el cambio más rentable del proyecto: protege el único diferencial real (honestidad) por casi nada.
2. **Corregir el `canonical` por locale (H-02).** Una línea en `lib/seo.ts` que rescata la indexabilidad de un idioma entero y, con ello, la mitad del canal de adquisición orgánica.
3. **Internacionalizar y condicionar la CTA de la landing (H-04).** Quita un 404 y texto cruzado de idioma de la pantalla de mayor tráfico; coste mínimo, impacto directo en conversión y percepción.
4. **CSP en Report-Only + rate-limit básico (H-03, fase 1).** Cierra la brecha entre seguridad declarada y real con esfuerzo moderado y sin riesgo (Report-Only no rompe nada); habilita conversaciones enterprise.
5. **`AudioContext.resume()` + timeout de pipeline + error boundary (H-06).** Tres cambios pequeños que atacan el riesgo de "~40% de fallos móvil" autodeclarado; mejora medible de la tasa de análisis completados.

---

## Limitaciones de esta auditoría

Auditoría **estática** sobre el código entregado. No incluye: ejecución en navegador, mediciones reales de Core Web Vitals/Lighthouse, análisis del bundle compilado, pruebas en dispositivos iOS/Android reales, ni revisión del backend en ejecución (Auth.js no existe en el código; las rutas DB están inactivas). Los hallazgos de rendimiento, accesibilidad de runtime y comportamiento móvil son inferidos del código y deben confirmarse con medición. No se revisaron en profundidad: `Uploader.tsx`, `CatManager.tsx`, `HistoryList.tsx`, `worker-pipeline.ts` y los repositorios IndexedDB (validación de archivos subidos —MIME/tamaño— no se afirma ni se descarta aquí).
