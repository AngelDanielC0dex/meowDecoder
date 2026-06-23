# MeowDecoder — Arquitectura del Sistema

> Plataforma de inteligencia acústica felina: análisis, clasificación e interpretación de vocalizaciones de gatos mediante DSP e inferencia ML en el navegador.
>
> **Posicionamiento honesto:** clasificador de vocalizaciones con salida contextual y adaptable. No prometemos "traducción" literal del lenguaje felino.

---

## 1. Visión general

```
┌─────────────────────────────────────────────────────────────────┐
│                         NAVEGADOR (cliente)                     │
│                                                                 │
│  ┌──────────┐   ┌─────────────────────────┐   ┌─────────────┐  │
│  │ Captura  │──▶│  Web Worker (DSP)       │──▶│  Inferencia │  │
│  │ mic/file │   │  mono→16kHz→VAD→segment │   │  DSP | ONNX │  │
│  └──────────┘   │  →features              │   └──────┬──────┘  │
│                 └─────────────────────────┘          │         │
│  ┌──────────────────────────────────────────────────▼──────┐   │
│  │ IndexedDB: gatos, sesiones, feedback, caché de modelos  │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │ sync opcional (cuenta de usuario)
┌────────────────────────────▼────────────────────────────────────┐
│  BACKEND (Next.js Route Handlers + Postgres/Drizzle)            │
│  auth · perfiles · historial · feedback · flags · analítica     │
│  · registro de versiones de modelo · ingesta para reentreno     │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  ML OFFLINE (Python): datasets → features → CNN → eval →        │
│  export ONNX → cuantización INT8 → verificación → publicación   │
└──────────────────────────────────────────────────────────────────┘
```

Principio rector: **local-first**. Todo el flujo crítico (capturar → analizar → guardar → corregir) funciona sin cuenta y sin red. El backend añade sincronización, personalización y agregación de feedback, no es un requisito.

**Por qué local-first gana:** privacidad por defecto (el audio nunca sale del dispositivo salvo opt-in), coste operativo ≈ 0 en el flujo principal, latencia mínima, y el producto funciona offline. La alternativa (inferencia en servidor) implicaría coste por petición, latencia de red, y tratamiento de audio personal en servidores: peor en privacidad, coste y UX.

---

## 2. Decisiones técnicas clave

| # | Decisión | Elección | Alternativas evaluadas | Por qué gana |
|---|----------|----------|------------------------|--------------|
| 1 | Framework web | **Next.js 15 (App Router, RSC)** | Astro, Remix, SvelteKit | SSG/ISR + RSC = landing con HTML completo sin JS; ecosistema maduro; metadata API nativa para SEO; un solo deploy para front+API. Astro sería superior para un sitio solo-contenido, pero la app interactiva de análisis encaja mejor en React+RSC. |
| 2 | Lenguaje | **TypeScript estricto** (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) | — | Requisito; los flags extra eliminan clases enteras de bugs en código DSP con arrays. |
| 3 | Estilos | **Tailwind CSS v4** | CSS Modules, vanilla-extract | Config CSS-first, design tokens como variables CSS (theming y fluid typography nativos), purga automática → CSS mínimo. |
| 4 | i18n | **next-intl** con rutas `/es` y `/en` | rollar i18n propio, next-international | Rutas localizadas + `generateMetadata` + hreflang + SSG sin fricción. Hacerlo a mano reinventa routing/metadata/plurales mal. |
| 5 | Estado | **Zustand** solo para el flujo de análisis; estado local para el resto | Context API, Redux, Jotai, Signals | El flujo grabación→pipeline→resultado cruza componentes y sobrevive a navegación interna; Zustand es 1 kB, sin providers, testeable. Context re-renderiza en cascada; Redux es ceremonia innecesaria. Nada más necesita estado global. |
| 6 | Persistencia local | **IndexedDB vía `idb`** con migraciones versionadas | localStorage, OPFS, raw IndexedDB | Blobs de audio + modelos + queries por índice exigen IndexedDB; `idb` (~1 kB) elimina el API de callbacks sin ocultar el modelo. localStorage no soporta blobs ni volumen. |
| 7 | Cómputo pesado | **Web Worker (module) dedicado** con protocolo RPC tipado propio (~80 líneas) | comlink, AudioWorklet para todo, main thread | El DSP es batch (no streaming): Worker es el fit exacto. AudioWorklet solo para metering en vivo durante la grabación (su única función real-time). RPC propio: cero dependencias, mensajes tipados con discriminated unions, transferables explícitos. |
| 8 | Inferencia navegador | **onnxruntime-web** (WASM+SIMD por defecto, WebGPU si disponible), cargado bajo demanda, modelo cacheado en IndexedDB | TensorFlow.js, MediaPipe, backend Python | ONNX es el formato de intercambio neutral (entrenamos en PyTorch); ORT-web WASM corre en todos los navegadores 2026 incl. iOS Safari; WebGPU como mejora progresiva. TFJS ataría el entrenamiento a TF. El runtime (~5 MB) y el modelo (~1-3 MB INT8) se cargan SOLO en el flujo de análisis, nunca en la landing. |
| 9 | Motor MVP | **Clasificador heurístico DSP** detrás del puerto `InferenceEngine` | esperar al modelo entrenado, mock | Features acústicas reales (f0, planitud espectral, modulación, duración) separan purr/hiss/growl/meow/trill/yowl de forma defendible y explicable. El producto funciona desde el día 1, es honesto sobre su certeza, y el puerto permite enchufar ONNX sin tocar UI. |
| 10 | VAD/segmentación | **Umbral RMS adaptativo + hangover** (híbrido energía + percentil de ruido) | WebRTC VAD, Silero VAD, energy fijo | Las vocalizaciones felinas son eventos cortos sobre ruido doméstico; un umbral adaptativo (percentil del ruido de fondo + margen) con hangover de 120 ms es predecible, testeable y suficiente. Silero (~1 MB, entrenado en voz humana) añade peso y sesgo a voz humana sin garantía de mejora con gatos. Revisar cuando haya datos de fallos reales. |
| 11 | Resampleo | **`OfflineAudioContext` nativo** para decode+mixdown+resample a 16 kHz | resampler propio en worker | El navegador ya trae un resampler de calidad probada y con aceleración nativa; escribir uno propio es deuda sin beneficio. El worker recibe Float32Array mono 16 kHz limpio. |
| 12 | Backend | **Next.js Route Handlers** + **Drizzle ORM** + **Postgres** | Fastify/NestJS separado, Supabase, Firebase | El backend es pequeño (CRUD + auth + eventos): un servicio separado duplicaría deploy, CORS, auth y observabilidad sin beneficio. Drizzle: SQL tipado, migraciones generadas, cero magia. Postgres: el default correcto. Si el backend crece (colas de reentreno), se extrae entonces — los módulos `server/` ya están aislados para ello. |
| 13 | Auth | **Auth.js v5** (magic link por email + OAuth opcional) | Clerk, Lucia, propio | Sin contraseñas que proteger, integración App Router nativa, coste 0. Clerk es excelente pero introduce vendor lock-in y coste antes de tener usuarios. |
| 14 | Entrenamiento | **PyTorch + torchaudio → ONNX → INT8 dinámico** | TensorFlow/Keras | Ecosistema de audio-ML dominante (2026), export ONNX de primera clase, cuantización dinámica reduce 4× el peso con pérdida <1 % en clasificación de audio. |
| 15 | Tests | **Vitest** (unit/integración) + Testing Library + axe; Playwright para e2e (fase 2) | Jest | Vitest: ESM nativo, velocidad, mismo config que Vite para tests de workers. |
| 16 | Monorepo | **No.** `web/` + `training/` + `docs/` planos | Turborepo, Nx | Un solo paquete JS y un paquete Python no justifican orquestación de monorepo. Añadirla hoy es complejidad costosa sin beneficio. Migrar después es mecánico. |

---

## 3. Arquitectura frontend (Clean Architecture pragmática)

```
web/src/
├── domain/          # Núcleo puro. Cero dependencias externas, cero IO.
│   ├── analysis/    #   VocalizationClass, Classification, AnalysisSession,
│   │                #   AcousticFeatures, confianza/ambigüedad
│   ├── cat/         #   Cat, CatProfile
│   ├── feedback/    #   FeedbackVerdict, FeedbackEntry
│   └── shared/      #   Result<T,E>, branded IDs, clock
├── application/     # Casos de uso + puertos. Depende SOLO de domain.
│   ├── ports/       #   InferenceEngine, AudioPipeline, CatRepository,
│   │                #   SessionRepository, FeedbackRepository, Telemetry
│   └── use-cases/   #   analyzeAudio, manageCats, recordFeedback, getHistory
├── infrastructure/  # Adaptadores. Implementan puertos. Depende de application/domain.
│   ├── audio/       #   captura mic (MediaRecorder), decode, AudioWorklet metering
│   ├── dsp/         #   funciones puras: resample-check, normalize, vad,
│   │                #   segmentation, features (f0, centroid, flatness, AM)
│   ├── inference/   #   HeuristicEngine (DSP), OnnxEngine, EngineRegistry,
│   │                #   ModelCache (IndexedDB)
│   ├── persistence/ #   idb schema + migraciones + repositorios
│   ├── workers/     #   analysis.worker.ts + rpc.ts (protocolo tipado)
│   └── telemetry/   #   logger estructurado, eventos, Web Vitals
├── presentation/    # React. Depende de application (nunca al revés).
│   ├── components/  #   ui/, audio/, results/, cats/, ads/, layout/, decor/
│   ├── hooks/       #   useAnalysis, useCats, useHistory, useMediaPermission
│   └── state/       #   analysis-store (Zustand), ThemeProvider (claro/oscuro)
├── i18n/            # next-intl: routing, messages es/en
├── content/         # Base de conocimiento tipada (vocalizaciones, FAQ, artículos)
├── app/             # App Router: [locale]/, api/, sitemap, robots, manifest
└── server/          # Backend: db schema, repos, auth, validación (zod)
```

**Regla de dependencias (la única que importa):** `domain ← application ← {infrastructure, presentation}`. El dominio no sabe que existe React, IndexedDB ni ONNX. Se valida con `eslint-plugin-boundaries` en CI.

**Convenciones:** archivos `kebab-case.ts`; componentes `PascalCase.tsx`; un export principal por archivo; funciones puras en `dsp/` y `domain/` (testeables sin mocks); los componentes visuales no contienen lógica de negocio — orquestan hooks que llaman a casos de uso.

**Capa decorativa (`presentation/components/decor/`):** piezas puramente visuales y `aria-hidden`, sin lógica ni datos — `PawBackground` (fondo de huellas animado global, tinte `--paw-color` por tema), `Paw` (glifo SVG reutilizable), `CatLogo` (wordmark), `CatFace` (gato del hero) y `RopeCat` (gato colgando del navbar en la landing). Las animaciones provenientes de SCSS se **compilan a CSS Modules** estáticos (el proyecto no usa Sass): los `@for`/`@mixin`/funciones de color de Sass se expanden a keyframes y hex fijos, y cualquier reset global se *scopea* al componente. Todas respetan `prefers-reduced-motion` y animan solo `opacity/transform` (GPU).

**Theming:** origen único de verdad en `globals.css` (`@theme` tokens + remapeo bajo `.dark`). La paleta de marca es "rosa almohadilla" (acento AA sobre blanco); el tema claro/oscuro/sistema lo resuelve `state/ThemeProvider` aplicando `.dark` en `<html>` con un script anti-FOUC inline. Las utilidades existentes (`bg-surface`, `text-ink-*`, `border-brand-*`) se adaptan solas. La landing usa secciones a `100svh` con `scroll-snap` suave + `SectionDots`.

---

## 4. Pipeline de audio (justificación paso a paso)

```
captura (mic MediaRecorder | archivo WAV/MP3/M4A)
  ↓ decodeAudioData                — formatos heterogéneos → PCM uniforme
  ↓ mixdown mono                   — la clasificación no usa info espacial; ÷2 datos
  ↓ resample 16 kHz                — la energía felina relevante está <8 kHz (Nyquist);
  │                                  estándar en audio-ML; reduce cómputo 3×
  ↓ normalización de pico (-1 dBFS)— invarianza a volumen de grabación/distancia
  ↓ VAD adaptativo (RMS + hangover)— recorta ruido previo/posterior y espacios muertos
  ↓ segmentación por silencios     — un audio puede contener varias vocalizaciones
  ↓ selección de ventana útil      — score energía×duración elige el mejor segmento
  ↓ extracción de features         — f0 (autocorrelación), contorno, centroide,
  │                                  planitud espectral, ZCR, modulación AM, RMS
  ↓ inferencia                     — HeuristicEngine | OnnxEngine (log-mel)
```

Decode/resample en main thread (APIs nativas async, no bloquean); todo lo demás en el Worker. La UI recibe progreso por etapas para feedback visual.

## 5. Taxonomía de clasificación

Clases v2 (10 estados del modelo + `unknown` a nivel de producto): `feliz_contento`, `trinos`, `enfadado`, `pelea`, `llamada_madre`, `llamada_apareamiento`, `dolor`, `descansando`, `advertencia`, `atencion`. `unknown` NO es una salida del modelo: es una política de producto aplicada por umbrales de confianza. (`caza` se fusionó en `trinos` y ya no existe como clase.) Cada clase lleva interpretaciones contextuales y 20 frases aleatorias en `content/state-phrases.ts`, reutilizadas por la UI de resultados y por las páginas SEO. Las frases seleccionan aleatoriamente con `Math.random()` para dar variedad sin repetición.

`unknown` es una clase de primer nivel: si la señal es ambigua, el producto lo dice. La honestidad sobre la incertidumbre es requisito de producto (y ventaja de confianza frente a competidores que "siempre saben").

**Mapeo desde v1 (6 clases acústicas):**
- meow → atencion (o llamada_madre, según contexto)
- purr → feliz_contento O descansando (contexto-dependiente; suavizado temporal resuelve la ambigüedad)
- trill → trinos
- hiss → advertencia
- growl → enfadado (o pelea)
- yowl → llamada_apareamiento O dolor (contexto-dependiente)

## 6. Estrategia ML

- **Enfoque:** Transfer learning con YAMNet (entrenado en AudioSet, 2M+ clips) como extractor de características congelado. La cabeza densa (~660K params) se entrena sobre los 1024-dim embeddings con validación LOCO (Leave-One-Cat-Out). El suavizado temporal EMA sobre 3 segundos resuelve la ambigüedad purr (felicidad vs descanso vs dolor).
- **Arquitectura:** YAMNet (congelado) → mean pooling → Dense(512) → BN → ReLU → Dropout(0.4) → Dense(256) → BN → ReLU → Dropout(0.3) → Dense(11) → Softmax. Dos modelos ONNX en producción: `yamnet.onnx` (~14 MB) + `meow_decoder_head_int8.onnx` (~650 KB).
- **Datos:** Pandeya Cat Sound Classification V2 (12 GB, 10 categorías), CatMeows (440 muestras, 21 gatos), Meow-10K (10K+ muestras), complementados con Freesound API para clases minoritarias.
- **Validación:** LOCO (Leave-One-Cat-Out) — el modelo nunca ve datos del mismo gato en train y validation simultáneamente, evitando fuga de identidad.
- **Métricas:** principal **macro-F1** (clases desbalanceadas); secundaria **ECE** (calibración). Target por clase: ≥0.73, con advertencia ≥0.92.
- **Incertidumbre:** umbral de confianza + margen top1−top2 + suavizado temporal EMA; bajo umbral → `unknown` con explicación.
- **Personalización por gato (diseño, no implementado):** el feedback corregido por gato alimenta priors bayesianos. Cada corrección se almacena con features + embedding para habilitar fine-tuning futuro.
- **Versionado:** `schemaVersion: 2` en manifest JSON; el frontend negocia versión → actualizar modelo nunca rompe el cliente.

## 7. SEO técnico y programático

- Landing y páginas de contenido: **SSG puro** — HTML completo sin JS, el modelo jamás se carga ahí.
- `generateMetadata` por página/locale: title, description, canonical, `hreflang` (es/en/x-default), Open Graph, Twitter Cards.
- JSON-LD: `WebApplication` (home), `FAQPage`, `Article` + `BreadcrumbList` (contenido).
- `sitemap.ts` y `robots.ts` generados con ambos locales.
- **SEO programático con valor real:** páginas `/[locale]/sounds/[type]` (11 vocalizaciones × 2 idiomas) generadas desde la base de conocimiento curada — contenido único, FAQ propias, breadcrumbs, enlazado interno hacia el analizador. No se generan combinaciones vacías (raza × edad × contexto se añadirá solo cuando exista contenido curado que lo justifique).
- Presupuesto de rendimiento: landing LCP < 1.5 s, JS inicial < 90 kB gzip, CLS ≈ 0 (dimensiones reservadas), INP < 200 ms (cómputo en workers).

## 8. Seguridad y privacidad

Permiso de micrófono solo tras gesto del usuario, con explicación previa. Audio local por defecto; subir audio al servidor es opt-in explícito por sesión (para feedback/reentreno) con consentimiento registrado. Minimización: el backend guarda features/predicciones, no audio, salvo donación explícita. Secretos solo en variables de entorno del servidor; validación zod en cada endpoint; rate limiting en rutas de escritura; cookies httpOnly/secure/sameSite; CSP estricta. Retención: audios donados 24 meses, eventos analíticos 14 meses, borrado de cuenta = borrado en cascada.

## 9. Monetización (diseñada, activada por flags)

Free: análisis ilimitado en dispositivo, 1 gato, historial 30 días local. **Premium (suscripción):** multi-gato, historial ilimitado + sync entre dispositivos, exportación (CSV/PDF), analítica de tendencias por gato, monitor continuo (fase 2). La inferencia básica nunca se bloquea — el valor premium es persistencia, personalización y análisis longitudinal, no el core. Sin publicidad en la app; afiliación contextual discreta solo en páginas de contenido si algún día compensa. Todo detrás de `feature_flags` para activar sin redeploy.

## 10. Observabilidad

Logger estructurado propio (JSON, niveles, contexto) → consola en dev, endpoint `/api/events` en prod. Métricas: Web Vitals (LCP/INP/CLS), embudo del flujo (captura→pipeline→resultado→feedback), tiempo de carga del modelo, errores de audio por tipo de dispositivo, abandono por etapa. Sentry como sink de errores opcional vía adaptador (puerto `Telemetry` — cambiar de proveedor no toca código de producto).

## 11. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Datasets felinos públicos pequeños (~10³ muestras) | Modelo ML limitado | Heurístico DSP honesto en v1; pipeline de donación de audio + feedback desde el día 1 para construir dataset propio (el verdadero foso competitivo) |
| Expectativa de "traducción" vs. realidad | Decepción, churn | Posicionamiento como análisis + interpretación contextual; clase `unknown`; sección de transparencia científica en la landing |
| Safari/iOS: peculiaridades de Web Audio y MediaRecorder | Fallos de captura en ~40 % móvil | decodeAudioData con fallback, formatos de grabación negociados, AudioContext resume tras gesto; matriz de pruebas iOS prioritaria |
| Peso de ORT-web en móvil de gama baja | Latencia primera inferencia | WASM+SIMD por defecto, carga diferida, caché IndexedDB del runtime+modelo, heurístico como fallback instantáneo |
| Mismatch features JS vs. Python | Predicciones inconsistentes | Test de paridad: vectores de referencia generados en Python verificados en CI contra la implementación TS |
| SEO programático percibido como thin content | Penalización | Solo páginas con contenido curado real; sin generación combinatoria vacía |

## 12. Plan de implementación por etapas

1. **E1 — Fundación** (esta sesión): scaffolding, dominio, pipeline DSP+workers, heurístico, IndexedDB, UI de análisis, i18n, landing SEO, esquema backend, pipeline Python, tests críticos, CI, docs.
2. **E2 — Modelo real:** ejecutar entrenamiento con CatMeows+augmentación, publicar ONNX v1, activar OnnxEngine tras A/B contra heurístico, test de paridad en CI.
3. **E3 — Cuentas y sync:** Auth.js v5 cableado (magic link por email + DrizzleAdapter; tablas `accounts`/`auth_sessions`/`verification_tokens`; páginas en `app/auth/*` fuera del segmento `[locale]`). El gating registrado/anónimo ya está implementado y se activa con `NEXT_PUBLIC_ACCOUNTS_ENABLED=true`: los anónimos pueden analizar pero deben iniciar sesión para corregir o tener historial (componente `SignInGate`, hook `useAuth`). **Pendiente de E3:** sync IndexedDB↔Postgres (last-write-wins por entidad) y donación de audio opt-in (endpoint de subida + job de export al pipeline de entrenamiento).
4. **E4 — Monetización:** Stripe + flags premium, exportación, multi-gato.
5. **E5 — Profundidad:** personalización por gato (priors), monitor continuo, expansión de contenido SEO (pilares + glosario), e2e Playwright completo.

## 12bis. Subsistemas de cuenta, IA, anuncios y legal (jun 2026)

Añadidos sobre la base local-first. La fuente de tareas pendientes/hechas es `ROADMAP.md`.

- **Auth (Auth.js v5)** — `server/auth/config.ts` (DrizzleAdapter + Nodemailer/Resend, sesión de BD), `getServerUserId()` como única puerta de autorización servidor, páginas en `app/auth/*` (fuera de `[locale]`, excluidas del middleware), cliente `AuthSessionProvider` + `useAuth`. Se activa con `NEXT_PUBLIC_ACCOUNTS_ENABLED=true`.
- **Niveles de acceso (`useAccess` — fuente única)** — modelo de 3 niveles: **anónimo** (analiza puntual, NO persiste — `analyzeAudio` recibe `persist`; `AnalyzePanel` oculta selector de gato/keepAudio y muestra aviso), **registrado** (+ historial, correcciones, **historial médico**), **premium** (+ asistente IA; requiere `premium.enabled` + plan). `isRegistered = accountsEnabled ? isAuthenticated : true` (modo local preserva todas las funciones on-device).
- **Gating** — `SignInGate` (contextos `history`/`cats`/`correct`/`medical`/`assistant`). Anónimo: el resultado se muestra pero no se guarda; corregir y médico piden cuenta. `FeedbackForm` gatea con `accountsEnabled && !isAuthenticated`.
- **Asistente IA (premium)** — un servicio, dos modos (`medical`/`meow`): `server/ai/assistant.ts` (schema zod + guardarraíles: informativo, NO veterinario) + `app/api/assistant/route.ts` (auth + rate-limit 8h/20d + tope de tokens). RAG por **inyección de contexto** (sin vector DB). UI `AssistantChat` con `lockedMode`, **embebida** en `/history` (meow) y `/medical` (medical); se renderiza solo si `premium.enabled` (si está OFF, el chatbot no aparece). No hay página `/assistant` standalone. Proveedor: GPT-4o-mini (`OPENAI_API_KEY`, solo servidor).
- **Anuncios** — landing 100% sin ads; rails laterales solo en `analyze`/`history` vía `AdRailsLayout` (xl+, sin CLS). `usePremium()` oculta todos los ads para Premium (fuente única). Contextual en resultados (`ContextualAd`).
- **Premium** — **landing condicional**: con `premium.enabled` ON la landing muestra `PremiumPlans` (showcase); con OFF muestra `FreeTiers` (comparativa Sin cuenta vs Con cuenta gratis, sin precio). `usePremium()` se conectará al `plan` de sesión cuando exista billing (Stripe).
- **Legal** — `content/legal.ts` (Términos+Privacidad bilingües), páginas `app/[locale]/legal/[doc]`, enlaces en footer, **aceptación obligatoria** en signin. Disclaimer clave: IA informativa, NO veterinaria.
- **Perfiles de gato** — `cat.ts` con `traits`, `microchip` (validación ISO 11784/11785, `isValidMicrochip`) y `photoObjectKey` (esquema listo para foto). Multi-gato sin límite; rejilla responsive.
- **Frase de estado** — `StatePhrase` (frase por estado al descifrar y al corregir); persistida por `AnalysisSession.phraseSeed` (entero, no texto) → consistente en resultado e historial.
- **SEO** — JSON-LD `WebApplication`+`Organization`+`WebSite`+`FAQPage` en landing (FAQ visible con `<details>`, `content/faq.ts`), `BreadcrumbList` en legal y `/sounds`, OG/favicon generados (`opengraph-image.tsx`, `icon.tsx`), `viewport`/themeColor, canonical+hreflang, `robots.ts`+`sitemap.ts` (privadas excluidas, legales incluidas). Microdatos: se usa **JSON-LD** (recomendado por Google), no `itemprop` redundante.
- **Historial médico / vacunas** — `content/vaccines.ts` (catálogo + reglas por región: legal/recomendada/opcional + WSAVA core), store IndexedDB v3 `vaccinations`, `VaccinationRepository`, `VaccineChecklist` (**registrado**, selector región, marcar puesta) en `/[locale]/medical`. **Carnet descargable/imprimible** (window.print + `@media print`) + export JSON.
- **Timeline** — `HistoryList` (`role="feed"`, `<time>`): reproducir/descargar audio, frase por estado (seed estable) y corregir desde el historial.
- **Estados de anuncios** — `InterstitialAd` (free-only): ad de carga durante la predicción y ad obligatorio en corrección con la frase; Premium sin ads (`usePremium`), sin CLS.
- **Panel de administración** — `/[locale]/admin` (server-gated). Acceso por allowlist `ADMIN_EMAILS` resuelta en servidor (`server/auth/admin.ts`: `getIsAdmin`/`requireAdmin`); no-admin → 404. Flags en tabla `feature_flags` resueltos por `getAllFlags`/`isEnabled` (override BD → default; env manda en `accounts.enabled`); `setFeatureFlagAction` re-verifica admin + Zod sobre `ADMIN_TOGGLEABLE_FLAGS`. Cliente: `FlagsProvider` (poblado por el layout) → `useFlags`; `usePremium` lee `premium.enabled` como interruptor maestro (un solo hook gatea todos los anuncios/premium). `premium.enabled` OFF por defecto (sin Stripe).
- **Tema claro/oscuro** — `globals.css` con `@custom-variant dark (&:where(.dark,.dark *))` + override de tokens (`--color-surface`/`ink-*`/`brand-50/100/200` invierten bajo `.dark`; `brand-300..800` constantes para botones bg+texto blanco en ambos). `ThemeProvider` (system/light/dark, `localStorage` `meow-theme`, sigue al SO en vivo) + `THEME_INIT_SCRIPT` anti-FOUC en `<head>` de AMBOS layouts ([locale] y auth) + `<html suppressHydrationWarning>` + `colorScheme`/`themeColor` por esquema. `ThemeToggle` en `SiteHeader`. Cuidado con colores que NO deben invertir (banda oscura de la landing, scrim del menú, badges/alertas): usan constantes o variantes `dark:`.
- **Tarjetas de presentación** — `/[locale]/cards` (registrado). `Cat` extendido (`birthDate`, `bio`, `cardTemplate`, `showHoroscope`); foto en almacén IndexedDB v4 `catPhotos` (blob local, borrado en cascada con el gato); `normalizeCat` da defaults a gatos antiguos. `domain/cat/zodiac.ts` (signo desde fecha, puro+testeado) + `catAgeYears`. UI `CardDesigner` + renderizador **canvas** `card-render.ts` (3 diseños classic/playful/elegant; una sola fuente para preview y descarga PNG, sin dependencias ni CORS). Horóscopo opcional (checkbox) con frase por signo en i18n (`zodiac`). i18n agnóstico en el renderer (recibe textos ya localizados). **Compartir + QR** (`card-share.ts` codifica los datos en base64url; `ShareCard` usa Web Share API con el PNG real donde se pueda + iconos sociales + QR (`qrcode`, local) que apuntan a la página pública **`/[locale]/card?d=…`** (`PublicCardView`, reconstruye la tarjeta sin foto, noindex pero crawleable para previews). La foto NO viaja en la URL/QR (es blob local).

## 13. Limitaciones conocidas

Ver `docs/limitations.md`. Las principales: el heurístico DSP no distingue sub-contextos de maullido (eso requiere el modelo entrenado); la ciencia de vocalización felina soporta clasificación de *tipo* y *contexto aproximado*, no semántica fina; iOS limita formatos de MediaRecorder (se negocia el mejor disponible).
