# 🐾 MeowDecoder

> Plataforma de **inteligencia acústica felina**: analiza, clasifica e interpreta
> las vocalizaciones de tu gato con DSP e inferencia ML directamente en el navegador.
>
> **Honesto por diseño:** es un *clasificador* de vocalizaciones con interpretación
> contextual, no un "traductor de gatos". Cuando la señal es ambigua, lo dice.

[![CI](https://github.com/your-org/meowdecoder/actions/workflows/ci.yml/badge.svg)](./.github/workflows/ci.yml)

---

## ¿Qué hace?

Graba o sube un sonido de tu gato y obtén la vocalización más probable
(`maullido · ronroneo · trino · bufido · gruñido · aullido · desconocido`) con su
nivel de confianza, alternativas, contextos probables, detalle técnico opcional y
un sistema de corrección que mejora el producto con el uso.

**Todo el análisis ocurre en tu dispositivo.** El audio no sale del navegador
salvo que lo dones explícitamente para mejorar el modelo. Funciona offline,
sin cuenta, en móvil y escritorio, en español e inglés.

## Funcionalidades

**Niveles de acceso** (fuente única `useAccess`; el sistema de cuentas se activa con
`NEXT_PUBLIC_ACCOUNTS_ENABLED`):

| | Anónimo | Registrado | Premium |
|---|:--:|:--:|:--:|
| Analizar maullidos | ✅ (puntual, sin guardar) | ✅ | ✅ |
| Historial + correcciones (mejoran las predicciones de **ese** gato) | ❌ | ✅ | ✅ |
| Historial médico + carnet de vacunas (descargable/imprimible) | ❌ | ✅ | ✅ |
| Asistente de IA (informativo, **no veterinario**) | ❌ | ❌ | ✅ |

- **Perfiles de gato** con microchip (ISO 11784/11785) y **tarjetas de presentación**
  descargables (3 diseños, foto, bio, **horóscopo** opcional) que se pueden **compartir**
  (Web Share + redes) y convertir en **código QR**.
- **Tema claro/oscuro** (sigue al sistema + interruptor, persistido, sin parpadeo).
- **Panel de administración** (`/admin`, allowlist `ADMIN_EMAILS`) para activar/desactivar
  funciones mediante *feature flags* sin redeploy — p. ej. el sistema premium.
- **SEO** (JSON-LD, canonical+hreflang, sitemap/robots, OG generadas) y **accesibilidad**
  (roles ARIA, foco visible, `prefers-reduced-motion`, suite **axe-core** en CI).

> Monetización: anuncios honestos (categorías, nunca por estado emocional individual) para
> usuarios free; Premium sin anuncios. El billing (Stripe) se conecta en su fase; hasta
> entonces el interruptor `premium.enabled` queda **desactivado**.

## Cómo funciona

```
micrófono / archivo (WAV·MP3·M4A)
   → decodificación y resampleo nativos (16 kHz mono)
   → Web Worker: normalización · VAD adaptativo · segmentación · features
   → inferencia: ONNX (YAMNet + cabeza densa, WASM) con fallback heurístico DSP
   → resultado: clase + confianza + alternativas + interpretación + feedback
```

Dos motores detrás del mismo puerto `InferenceEngine`:

| Motor | Qué es | Rol |
|---|---|---|
| `heuristic-dsp` | Reglas sobre features acústicas (f0, planitud espectral, modulación AM…) | Siempre disponible; **fallback** y **baseline de regresión** |
| `cnn-onnx` | Cualquier modelo ONNX que cumpla el [contrato v1](./docs/model-contract.md) | Se activa con `NEXT_PUBLIC_MODEL_BASE_URL`; carga diferida y caché en IndexedDB |

Un modelo nuevo solo se publica si **iguala o supera** a la heurística en el gate
de regresión (macro-F1, set de evaluación determinista). Si el manifest falta o
es incompatible, la app cae a la heurística sola: un mal deploy de modelo no
puede romper el producto.

## Estructura del repositorio

```
meowDecoder/
├── ARCHITECTURE.md      # Diseño del sistema, decisiones y roadmap (léelo primero)
├── DEPLOYMENT.md        # Guía completa de configuración y despliegue
├── web/                 # App Next.js 15 (TypeScript estricto)
│   ├── src/domain/          # Núcleo puro: entidades, reglas, contrato del modelo
│   ├── src/application/     # Casos de uso + puertos (sin IO)
│   ├── src/infrastructure/  # DSP, workers, inferencia, IndexedDB, telemetría
│   ├── src/presentation/    # Componentes React, hooks, store del flujo
│   ├── src/content/         # Base de conocimiento bilingüe (UI + SEO)
│   ├── src/i18n/            # next-intl: rutas /es y /en
│   ├── src/server/          # Esquema Drizzle/Postgres, validación, flags
│   ├── public/models/       # Modelo ONNX publicado + manifest (contrato v1)
│   └── tests/               # DSP, dominio, paridad, contrato, regresión, a11y, SEO
├── training/            # Python: datos → entrenamiento → export ONNX verificado
└── docs/                # Contrato del modelo, desarrollo, ADRs, limitaciones
```

Regla de dependencias (aplicada por lint): `domain ← application ← {infrastructure, presentation}`.
La lógica de negocio nunca vive en componentes.

## Empezar en 2 minutos

```bash
git clone <repo> && cd meowDecoder/web
cp .env.example .env.local
npm install
npm run dev          # http://localhost:3000 → /es
```

Puertas de calidad (lo mismo que ejecuta CI):

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

### Pipeline ML (opcional)

```bash
cd training
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Modelo real (YAMNet transfer learning) con CatMeows/NAYA: ver training/README.md
# Flujo: extract → train → evaluate (+ sweep de hiperparámetros opcional).
```

## El contrato del modelo (resumen)

Fijado en [`docs/model-contract.md`](./docs/model-contract.md) y en
`web/src/domain/analysis/contract.ts`; verificado por tests:

- **Entrada:** PCM mono 16 kHz (forma de onda). YAMNet (congelado) extrae embeddings de 1024 dim; frames de 0.96 s con salto de 0.48 s.
- **Salida:** softmax sobre **10 clases** (`feliz_contento, trinos, enfadado, pelea, llamada_madre, llamada_apareamiento, dolor, descansando, advertencia, atencion`, en ese orden).
- **Umbrales:** alta ≥ 0.70 con margen ≥ 0.15 · media ≥ 0.45 · baja < 0.45.
- **`unknown`:** decisión de producto, no clase del modelo — con certeza baja, el resultado primario es `desconocido` y la mejor clase se degrada a alternativa.

> ⚠️ Arquitectura: **YAMNet congelado → embeddings (+ features prosódicas) →
> cabeza densa → ONNX**. El motor por defecto en el navegador es el **heurístico
> DSP** (sin descarga); el motor ONNX se activa con `NEXT_PUBLIC_MODEL_BASE_URL`
> una vez el modelo entrenado supera el gate de regresión contra la baseline.
> Detalles en `docs/model-contract.md`.

## Verificación

La suite de Vitest cubre el flujo crítico: FFT contra DFT de referencia, VAD,
extracción de features, clasificador heurístico, reglas de dominio, caso de uso
de análisis con fakes, **priors por gato**, **paridad de features JS↔Python**,
**paridad de salida TS↔ONNX Runtime**, **test de contrato** sobre el manifest
publicado, **canonical/hreflang SEO**, **ads honestos/a11y** y **gate de
regresión modelo vs baseline** (actual: modelo 1.000 vs heurística 0.565 de
macro-F1 en **familia sintética held-out** — valida la cadena, no el rendimiento
con datos reales; ver `docs/model-contract.md` §7). CI bloquea el merge si algo
falla.

## Documentación

| Documento | Contenido |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Arquitectura completa, 16 decisiones justificadas, riesgos, roadmap |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Variables de entorno, DB, hosting, publicación de modelos, troubleshooting |
| [`docs/model-contract.md`](./docs/model-contract.md) | Contrato congelado de entrada/salida/umbrales/unknown |
| [`docs/development.md`](./docs/development.md) | Setup local, convenciones, cómo añadir una clase |
| [`docs/limitations.md`](./docs/limitations.md) | Qué NO afirma este producto |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Flujo de contribución y estándares |

## Licencia

Propietaria — © MeowDecoder. Todos los derechos reservados.
