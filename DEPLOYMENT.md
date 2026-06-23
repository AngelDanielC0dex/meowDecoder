# Guía Maestra de Producción y Despliegue — MeowDecoder

Esta guía detalla paso a paso el camino desde cero hasta tener la plataforma en producción, incluyendo la preparación de datos, el entrenamiento del modelo por YAMNet Transfer Learning, la configuración de Supabase, la seguridad anti-bots y el despliegue final.

---

## FASE 1: Entrenamiento del Modelo (YAMNet Transfer Learning — 10 Clases)

El corazón de MeowDecoder es su modelo local. Usamos **YAMNet** (entrenado en AudioSet con 2M+ clips) como extractor de características congelado, con una cabeza densa personalizada para 10 estados emocionales/conductuales felinos (más `unknown` como política de producto vía umbrales).

### 1.1 Preparación del Entorno Python
Debes tener Python ≥ 3.10 instalado.
```bash
cd training
python -m venv .venv
.\.venv\Scripts\Activate.ps1       # Windows
# source .venv/bin/activate        # Linux/macOS
pip install -e ".[dev]"
pip install -e ".[yamnet]"         # TensorFlow + YAMNet dependencies
```

### 1.2 Descarga y Preparación de los Datos

> **Fuente de verdad (detallada y en evolución):** `training/README.md`. Aquí va el resumen para despliegue. La carpeta de trabajo es `data/processed_clean`.

Datasets que usa el pipeline actual:

1. **Pandeya / NAYA_DATA_AUG1X** (CATMood, equipo Pandeya — base principal, multi-fuente):
   - `python scripts/ingest_naya.py` → ingiere los originales a `data/processed_clean` (mapea Angry→enfadado, Defence/Warning→advertencia, Fighting→pelea, Happy→feliz_contento, HuntingMind→trinos, Mating→llamada_apareamiento, MotherCall→llamada_madre, Paining→dolor, Resting→descansando).

2. **CatMeows** (Zenodo 4008297 — contexto en el nombre B/F/I):
   ```bash
   python scripts/prepare_catmeows.py --raw data/raw/catmeows --out data/processed_clean --label feliz_contento --context-filter B
   python scripts/prepare_catmeows.py --raw data/raw/catmeows --out data/processed_clean --label atencion --context-filter F
   python scripts/prepare_catmeows.py --raw data/raw/catmeows --out data/processed_clean --label dolor --context-filter I
   ```

3. **Freesound dirigido** (complemento de clases minoritarias; clave API expuesta antes → ROTAR):
   `python scripts/ingest_freesound_targeted.py` (revisar en cuarentena antes de aceptar).

> **Meow-10K**: evaluado y **descartado** (etiquetas por "intención" ruidosas + audio que solapa con Freesound). No se usa.

Limpieza/criba (importante para calidad): `qc_audio.py` (voz/música), `qc_final.py` (señal), `qc_final_cull.py --min-impurity 0.90 --move` (mal etiquetados, con `--reviewed-list`). Balance: `python scripts/check_class_balance.py --data data/processed_clean`.

### 1.3 Extracción de Embeddings y Entrenamiento

```bash
# Paso 0: Augmentación + caché prosódica (las 25 features prosódicas → head 2073-dim)
python scripts/clean_augmented.py --root data/processed_clean
python scripts/preprocess_audio.py --input data/processed_clean --factor 3
python scripts/build_prosodic_cache.py

# Paso 1: Extraer embeddings YAMNet + prosodia (offline; lee la caché)
python -m meowdecoder_training.yamnet_pipeline extract --config config.yaml

# Paso 2: Entrenar la cabeza densa (StratifiedGroupKFold por cat_id; OOF honesto)
python -m meowdecoder_training.yamnet_pipeline train --config config.yaml

# Paso 3: Evaluar
python -m meowdecoder_training.yamnet_pipeline evaluate --config config.yaml

# Paso 4: Calibrar umbrales por clase (sobre las probabilidades OOF)
python scripts/calibrate_thresholds.py

# Paso 5: Exportar la cabeza a ONNX + INT8, y YAMNet base a ONNX
python -m meowdecoder_training.export_yamnet_head --config config.yaml
python -m meowdecoder_training.export_yamnet_onnx --output ../web/public/models/yamnet.onnx
```

> ⚠️ **Paridad prosódica pendiente:** el modelo entrena con 2073 dims (1024 mean + 1024 std + 25 prosódicas). Para activar el motor ONNX en el navegador hay que replicar esas 25 features en JS (`web/src/infrastructure/dsp/`) y pasar el test de paridad. Hasta entonces, el motor por defecto es el heurístico (deja `NEXT_PUBLIC_MODEL_BASE_URL` vacío).

Esto genera en `web/public/models/`:
- `yamnet.onnx` (~14 MB) — extractor de características
- `meow_decoder_head_int8.onnx` (~650 KB) — clasificador cuantizado
- `manifest.json` — contrato del modelo (schemaVersion: 2)

### 1.4 Guía Completa de Entrenamiento

Para instrucciones detalladas y actualizadas, ver **`training/README.md`** (fuente de verdad del pipeline). El plan de tareas vivo del proyecto está en `ROADMAP.md`.

---

## FASE 2: Configuración de Bases de Datos y Seguridad (Supabase y Cloudflare)

La aplicación usa Next.js Server Actions y Drizzle ORM. Funciona perfectamente con Supabase (Postgres gratuito).

> **Nota:** Supabase ES Postgres gestionado. El código de la app (driver `postgres-js` + Drizzle) es idéntico con cualquier Postgres; solo cambia de dónde sacas la cadena `DATABASE_URL`. Si algún día migras a otro Postgres (Neon, propio…), basta con cambiar esa variable.

### 2.1 Configuración de Supabase (paso a paso)
1. Crea una cuenta en [supabase.com](https://supabase.com) → **New project**.
2. Pon un nombre, **elige y GUARDA la "Database Password"** (la necesitarás en la cadena de conexión), y selecciona la región más cercana a tus usuarios. Pulsa **Create new project** y espera ~2 min a que se aprovisione.
3. Obtén la cadena de conexión: **Project Settings → Database → Connection string**. Elige la pestaña **Connection pooling**, modo **Transaction** (puerto **6543**). Copia la URI con formato:
   ```
   postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```
   - **Sustituye `[YOUR-PASSWORD]`** por la contraseña del paso 2.
   - Usa el **pooler (6543)**, no la conexión directa (5432): es lo correcto para entornos serverless (Vercel). El código ya está preparado (`prepare: false` en `src/server/db/client.ts`, compatible con el pooler PgBouncer).
4. Pega esa cadena como `DATABASE_URL` en `web/.env.local` (local) y en las variables de entorno de Vercel (producción).

### 2.2 Despliegue del Esquema (Drizzle)
Dentro de la carpeta `web/`, con `DATABASE_URL` ya configurada:
```bash
npm install
npm run db:migrate
```
Esto aplica **todas** las migraciones de `web/drizzle/` (`0000…` → la última) y crea **todas** las tablas en Supabase: las de la app (`users`, `cats`, `sessions`, `predictions`, `feedback`, `subscriptions`, `analytics_events`, `model_versions`, `feature_flags`, `cat_priors`, `vaccinations`, `medical_records`) y las de Auth.js (`accounts`, `auth_sessions`, `verification_tokens`).
- `npm run db:generate` genera una migración nueva SI cambias `schema.ts`; `npm run db:migrate` aplica las pendientes. (No existe `db:push` en este proyecto.)
- Verifícalo en Supabase → **Table Editor**: deberías ver las **15 tablas**.

### 2.3 Protección Anti-Bots (Cloudflare Turnstile)
Turnstile es el CAPTCHA invisible de Cloudflare. Protege el envío de correcciones (feedback): el navegador obtiene un token y el servidor lo verifica contra Cloudflare antes de escribir en la BD. Necesita **dos** claves: una pública (widget) y una secreta (verificación en servidor).

1. Crea una cuenta gratis en [Cloudflare](https://dash.cloudflare.com) (no hace falta mover tu dominio a Cloudflare; Turnstile funciona solo).
2. Ve a **Turnstile** → **Add widget**. Pon un nombre y en **Hostnames** añade tu dominio de producción (ej. `meowdecoder.com`) y, para desarrollo, `localhost`.
3. Tipo de widget: **Managed** (recomendado).
4. Copia las dos claves y añádelas a `.env.local` y a Vercel:
   - **Site Key** → `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (pública, va al navegador).
   - **Secret Key** → `TURNSTILE_SECRET_KEY` (secreta, **solo servidor**, nunca con prefijo NEXT_PUBLIC).
5. Para **probar en local** sin claves reales, Cloudflare ofrece claves de test que siempre pasan: Site Key `1x00000000000000000000AA` y Secret `1x0000000000000000000000000000000AA`.

> El componente de feedback (`FeedbackForm.tsx`) renderiza el widget solo si `NEXT_PUBLIC_TURNSTILE_SITE_KEY` está definida; el server action `submit-feedback.ts` verifica el token con `verify-turnstile.ts` y **falla cerrado** si no es válido. Si dejas ambas vacías, el feedback funciona en local pero sin protección anti-bot (no usar así en producción).

> **Nota sobre Cloudflare como CDN/proxy (opcional):** si además quieres poner tu dominio detrás de Cloudflare (DNS proxy, caché, WAF), apunta los nameservers del dominio a Cloudflare y activa el proxy (nube naranja). La app ya envía cabeceras correctas y `trustHost: true` en Auth.js respeta los `X-Forwarded-*` de Cloudflare. No es obligatorio para que la app funcione.

---

## FASE 3: Autenticación (Auth.js)

Para que los usuarios guarden su historial y registren a sus gatos, se usa login sin contraseña (Magic Link). El stack ya está cableado: Auth.js v5 + DrizzleAdapter + proveedor Nodemailer (ver `web/src/server/auth/config.ts`). Las páginas viven en `web/src/app/auth/*` (fuera del segmento `[locale]`) y los endpoints en `/api/auth/*`.

**1. Secreto de sesión.** En `web/` ejecuta:
```bash
npx auth secret
```
Esto genera y escribe `AUTH_SECRET` en `.env.local`. En Vercel, añádelo también como variable de entorno (cópialo del `.env.local`).

**2. Servicio de email con Resend (SMTP para los magic links).**
   1. Crea cuenta en [resend.com](https://resend.com).
   2. Para **producción**: ve a **Domains → Add Domain**, añade tu dominio y crea los registros DNS que te indica (SPF/DKIM). Para **probar ya** sin dominio, puedes enviar desde `onboarding@resend.dev` (solo a tu propio email verificado).
   3. Ve a **API Keys → Create API Key** y copia la clave (`re_...`).
   4. Resend expone SMTP estándar. Rellena en `.env.local` (y en Vercel):
      ```
      AUTH_EMAIL_SERVER=smtp://resend:re_TU_API_KEY@smtp.resend.com:465
      AUTH_EMAIL_FROM=MeowDecoder <onboarding@resend.dev>
      ```
      - Usuario SMTP: literalmente `resend`. Contraseña: tu API key. Host: `smtp.resend.com`. Puerto `465` (SSL) o `587` (STARTTLS).
      - En producción cambia `AUTH_EMAIL_FROM` a una dirección de tu dominio verificado (ej. `hola@tudominio.com`).

   > *Alternativa para desarrollo local sin enviar correos reales:* [Mailtrap](https://mailtrap.io) → Sandbox → SMTP Settings, y usa esa cadena en `AUTH_EMAIL_SERVER`. Los emails quedan capturados en su buzón.

**3. Esquema de BD.** Ya creado en la Fase 2.2 con `npm run db:migrate` (incluye `accounts`, `auth_sessions`, `verification_tokens`). Si te saltaste la Fase 2, hazlo ahora.

**4. Activa las cuentas.** Pon en `.env.local` (y Vercel):
```
NEXT_PUBLIC_ACCOUNTS_ENABLED=true
```
Mientras esté en `false`, la app funciona 100% local sin login (modo por defecto, no rompe nada). Con `true`, los anónimos pueden analizar pero deben iniciar sesión para **corregir** o tener **historial**.

**5. Prueba el flujo.** `npm run dev` → pulsa "Iniciar sesión" (arriba a la derecha) → introduce tu email → revisa el correo (o el buzón de Mailtrap) → abre el magic link → deberías volver autenticado y poder corregir/guardar historial.

> **Modelo registrado vs anónimo:** el gating está centralizado en `useAuth()` + `SignInGate`. El servidor exige sesión vía `getServerUserId()` (en `submit-feedback.ts`), de modo que ningún anónimo escribe en la BD. Los endpoints de Auth.js están en `/api/auth/*` y las páginas en `app/auth/*` (fuera de `[locale]`).

---

## FASE 3.5: Panel de Administración

Hay un panel privado en `/[locale]/admin` para activar/desactivar funciones del producto **sin redeploy** (los flags se guardan en la tabla `feature_flags` de la BD).

**Seguridad (cómo funciona):**
- El acceso se decide **en el servidor** (`getIsAdmin()` en `src/server/auth/admin.ts`): un usuario con sesión cuyo email esté en la allowlist `ADMIN_EMAILS`. Quien no sea admin recibe **404** (no se revela que la página existe).
- Toda mutación pasa por el server action `setFeatureFlagAction`, que vuelve a llamar a `requireAdmin()` y valida la clave contra una allowlist (`ADMIN_TOGGLEABLE_FLAGS`) con Zod → la UI **nunca** es la frontera de seguridad.
- `/admin` está en `robots.ts` (disallow) y marcada `noindex`.

**Configuración:**
1. En `.env.local` (y Vercel) pon tu email de admin (coma/espacio para varios):
   ```
   ADMIN_EMAILS=tucorreo@ejemplo.com
   ```
2. Requiere cuentas activas (`NEXT_PUBLIC_ACCOUNTS_ENABLED=true`) + BD migrada (la tabla `feature_flags` se crea en la Fase 2.2). Sin `ADMIN_EMAILS`, el panel queda **bloqueado** (nadie es admin).
3. Inicia sesión con ese email y entra a `/es/admin` (o `/en/admin`).

**Qué se puede togglear hoy:**
- **Cuentas premium** (`premium.enabled`): interruptor maestro del sistema premium. **Déjalo desactivado** hasta tener Stripe (sin billing nadie es premium; activarlo no concede premium por sí solo). Es lo que pediste: poder activarlo/desactivarlo desde el panel.
- **Donación de audio** (`audioDonation.enabled`).
- Estado **solo lectura**: cuentas (Auth.js) y motor ONNX (controlados por env).

**Efecto de `premium.enabled` (niveles de acceso):**
- **OFF** (por defecto): NO aparece el chatbot de IA en ningún sitio; la landing muestra la comparativa de niveles gratuitos (`FreeTiers`). La app funciona para anónimos y registrados.
- **ON**: el asistente de IA aparece embebido en el historial de maullidos y en el médico (para premium; el resto ve el upsell); la landing muestra el showcase premium.
- Niveles (independientes del toggle): **anónimo** = analiza puntual sin guardar, sin correcciones ni médico; **registrado** = historial + correcciones + **historial médico**; **premium** = + chatbot IA.

> Roadmap del panel (futuro, ver `ROADMAP.md`): gestión de versiones del modelo, revisión de feedback/datos donados, métricas de uso y gestión de usuarios (GDPR).

## FASE 4: Despliegue de la Aplicación en Vercel

Vercel es la plataforma nativa y recomendada para Next.js 15.

1. Sube tu código (incluyendo la carpeta `public/models` generada en la Fase 1) a un repositorio de GitHub.
2. Entra a Vercel, dale a "Add New Project" y selecciona tu repositorio.
3. **Importante:** Establece el **Root Directory** como `web/`. El framework se detectará como Next.js automáticamente.
4. En el paso de "Environment Variables", pega absolutamente todas las variables:
   - `DATABASE_URL` (Supabase)
   - `AUTH_SECRET` y `AUTH_EMAIL_*`
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY`
   - `OPENAI_API_KEY` (asistente de IA premium; solo servidor)
   - `ADMIN_EMAILS` (allowlist de emails con acceso a `/admin`; solo servidor)
   - `NEXT_PUBLIC_ACCOUNTS_ENABLED="true"` (activa login/historial/correcciones)
   - `NEXT_PUBLIC_SITE_URL` (Debe ser tu dominio en producción sin la barra final, ej: `https://meowdecoder.com`)
   - `NEXT_PUBLIC_MODEL_BASE_URL="/models"` (solo cuando el ONNX + paridad prosódica estén listos; vacío = motor heurístico).
   - *(Futuro, al activar subidas)* credenciales de object storage (Cloudflare R2) y `STRIPE_*` (billing).
5. Dale a **Deploy**.

## Checklist de Producción
- [ ] Has entrenado y exportado los modelos YAMNet (`yamnet.onnx` ~14 MB + `meow_decoder_head_int8.onnx` ~650 KB).
- [ ] `manifest.json` en `web/public/models/` tiene `schemaVersion: 2` y las 10 clases.
- [ ] `npm run db:migrate` ejecutado sin errores (las 15 tablas visibles en Supabase → Table Editor).
- [ ] El login por email te envía el Magic Link correctamente.
- [ ] `ADMIN_EMAILS` configurado: con tu email entras a `/admin`; sin él (u otro email) devuelve 404.
- [ ] Al analizar un maullido, la red descarga `yamnet.onnx` y `meow_decoder_head_int8.onnx`.
- [ ] La clasificación muestra uno de los 10 estados emocionales (o `unknown` si la confianza es baja) con una frase aleatoria.
- [ ] Al corregir un resultado en el *Feedback Form*, el tick verde de Turnstile carga y la corrección se refleja instantáneamente en Supabase.