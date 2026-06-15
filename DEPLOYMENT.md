# Guía Maestra de Producción y Despliegue — MeowDecoder

Esta guía detalla paso a paso el camino absoluto desde cero hasta tener la plataforma en producción, incluyendo la recolección de datos, el entrenamiento del modelo por Transfer Learning, la configuración de Supabase, la seguridad anti-bots y el despliegue final.

---

## FASE 1: Entrenamiento del Modelo (Transfer Learning)

El corazón de MeowDecoder es su modelo local. Entrenaremos un `MobileNetV2` adaptado a audio.

### 1.1 Preparación del Entorno Python
Debes tener Python ≥ 3.10 instalado.
```bash
cd training
python -m venv .venv
# Activar entorno virtual:
source .venv/bin/activate  # En Mac/Linux
.venv\Scripts\activate     # En Windows
pip install -e ".[dev]"
```

### 1.2 Descarga y Preparación de los Datos
Dado que usamos *Transfer Learning*, necesitamos el dataset base y ejemplos complementarios.
1. Entra a **Zenodo** y descarga el dataset `CatMeows` (ID: 4008297).
2. Extrae los archivos de audio en la ruta exacta: `training/data/raw/catmeows/`.
3. Para mejorar las clases que faltan (`growl`, `hiss`, `purr`), entra a **Kaggle** y busca "Cat Sound Classification". Descarga esos audios y guárdalos clasificados, por ejemplo: `training/data/raw/hiss/`, `training/data/raw/purr/`.
4. Ejecuta el procesador de audios para generar los espectrogramas Log-Mel:
```bash
python scripts/prepare_catmeows.py --raw data/raw/catmeows --out data/processed
```

### 1.3 Fine-Tuning y Exportación
Ejecuta el entrenamiento en dos fases (Warm-up y Fine-tuning). Si tienes GPU el proceso tomará menos de 5 minutos; en CPU, alrededor de 15 minutos.
```bash
python -m meowdecoder_training.train --config config.yaml
```
Verás que el modelo resultante se guarda en `artifacts/model.pt`. Ahora hay que exportarlo a formato ONNX optimizado (INT8) para el navegador:
```bash
python -m meowdecoder_training.export --config config.yaml
```
Este comando automáticamente moverá `model.onnx` y `manifest.json` a tu carpeta `web/public/models/`.

---

## FASE 2: Configuración de Bases de Datos y Seguridad (Supabase y Cloudflare)

La aplicación usa Next.js Server Actions y Drizzle ORM. Funciona perfectamente con Supabase (Postgres gratuito).

### 2.1 Configuración de Supabase
1. Créate una cuenta en [Supabase](https://supabase.com) y crea un proyecto nuevo.
2. Ve a los ajustes de base de datos ("Database") y copia la cadena de conexión usando el **Connection Pooler** (la que lleva el puerto 6543 en IPv4).
3. Añade esa cadena a tu archivo `web/.env.local` y a tu hosting (Vercel) como `DATABASE_URL`.

### 2.2 Despliegue del Esquema (Drizzle)
Dentro de la carpeta `web/`:
```bash
npm install
npm run db:push
```
Esto creará inmediatamente todas las tablas (`users`, `cats`, `sessions`, `feedback`) en tu base de datos de Supabase.

### 2.3 Protección Anti-Bots (Cloudflare Turnstile)
1. Ve al panel de [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile).
2. Crea un nuevo widget, introduce tu dominio de producción (ej. `meowdecoder.com`).
3. Copia la *Site Key*.
4. Ponla en tus variables de entorno como `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. El componente de Feedback que hemos programado bloqueará automáticamente los envíos masivos si el token no es válido.

---

## FASE 3: Autenticación (Auth.js)

Para que los usuarios guarden su historial y registren a sus gatos, se usa login sin contraseña (Magic Link).

1. Genera un secreto para las sesiones de forma segura (ejecuta en terminal `openssl rand -base64 32`) y ponlo como `AUTH_SECRET` en tu `.env.local` y Vercel.
2. Configura un servicio de correo transaccional gratuito (como Resend o SendGrid).
3. Obtén las credenciales SMTP y añádelas como `AUTH_EMAIL_SERVER` y `AUTH_EMAIL_FROM`.

---

## FASE 4: Despliegue de la Aplicación en Vercel

Vercel es la plataforma nativa y recomendada para Next.js 15.

1. Sube tu código (incluyendo la carpeta `public/models` generada en la Fase 1) a un repositorio de GitHub.
2. Entra a Vercel, dale a "Add New Project" y selecciona tu repositorio.
3. **Importante:** Establece el **Root Directory** como `web/`. El framework se detectará como Next.js automáticamente.
4. En el paso de "Environment Variables", pega absolutamente todas las variables:
   - `DATABASE_URL` (Supabase)
   - `AUTH_SECRET` y `AUTH_EMAIL_*`
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   - `NEXT_PUBLIC_SITE_URL` (Debe ser tu dominio en producción sin la barra final, ej: `https://meowdecoder.com`)
   - `NEXT_PUBLIC_MODEL_BASE_URL="/models"` (Para decirle a la app que cargue la IA en el cliente).
5. Dale a **Deploy**.

## Checklist de Producción
- [ ] Has entrenado y exportado el modelo real (`model.onnx`).
- [ ] `npm run db:push` ejecutado sin errores.
- [ ] El login por email te envía el Magic Link correctamente.
- [ ] Al analizar un maullido, la red de tu navegador descarga `model.onnx` (~2MB).
- [ ] Tras el análisis, se carga el componente de **Anuncios Contextuales** (puedes enlazarlo a Amazon Afiliados después).
- [ ] Al corregir un resultado en el *Feedback Form*, el tick verde de Turnstile carga y la corrección se refleja instantáneamente en Supabase.
