# MeowDecoder — Checklist Maestra (roadmap completo)

> Fuente única de tareas pendientes y hechas. Revisado contra toda la conversación.
> Regla transversal en CADA cambio: `typecheck + lint + test + build` verdes,
> documentación en línea donde aporte, sin código obsoleto, mobile-first.
> Decisión fijada: **se mantiene YAMNet** (no AST). **No MeowRoom. No Meow-Omni-1.**

---

## ✅ YA HECHO (no repetir)

**Modelo/datos**
- [x] Dataset reconstruido; OOF honesto (StratifiedGroupKFold por cat_id).
- [x] NAYA_DATA_AUG1X ingerido (ingest_naya.py); bloqueo de cat_id resuelto.
- [x] Features prosódicas (25) + caché paralela (build_prosodic_cache.py, threads=1).
- [x] Silencios recortados; freesound contaminado borrado; sweep de hiperparámetros.
- [x] Mejor config: head [256,128], dropout [0.5,0.4], lr 0.001, cap 1200.
- [x] Scripts de criba: qc_audio / qc_final / qc_intraclass / qc_final_cull (con --reviewed-list).
- [x] +23 audios de atención (YouTube). OOF actual ~0.62.

**Web**
- [x] Límites de audio (20s, 12MB, multiformato, cuenta atrás, mensajes i18n).
- [x] Excepción "no es sonido de gato" (evita voz/ruido).
- [x] Anuncios: landing SIN ads; rails solo en analyze/history; **premium SIN ads** (usePremium); CLS con min-h.
- [x] Auth.js v5 cableado (DrizzleAdapter + Nodemailer/Resend, tablas adaptador, /api/auth, páginas /auth/*).
- [x] Gating anónimo vs registrado (SignInGate, useAuth) — anónimo solo analiza.
- [x] Frase por estado (StatePhrase): sale al descifrar y cambia al corregir (en resultado).
- [x] cat-priors: CLAMP [0.5,2.0] (no anula evidencia fuerte). Multi-gato + rejilla responsive.
- [x] SEO: OG image + favicon generados, viewport/themeColor, robots, canonical/hreflang.
- [x] A11y: aria-current nav, aria-live frase. Tipografía: selection, balance, legibility.
- [x] Legal: páginas Términos+Privacidad bilingües, enlaces en footer, **aceptación obligatoria** en signin. Reenfoque "asistente de IA, NO veterinario".
- [x] Esquema BD médico: vaccinations + medical_records (migración 0001).
- [x] Docs corregidas (10 clases, db:migrate, Supabase/Cloudflare/Resend).

**Progreso nocturno (sesión autónoma, jun 2026) — verificado verde:**
- [x] Asistente IA (Fase 4): assistant.ts + /api/assistant + AssistantChat + página + nav (GPT-4o-mini).
- [x] SEO landing: FAQ visible (`<details>`, content/faq.ts) + JSON-LD FAQPage/Organization/WebSite.
- [x] Premium Container en landing (PremiumPlans, sin ads, server).
- [x] Anuncios: landing sin ads (rails movidos a analyze/history vía AdRailsLayout) + premium sin ads (usePremium) + CLS.
- [x] Reframe legal IA "asistente, NO veterinario" + páginas legales + aceptación signin.
- [x] Perfil gato: traits UI + microchip (ISO `isValidMicrochip`) + columnas esquema (microchip, photo_object_key, migración 0002).
- [x] Frase persistente: `AnalysisSession.phraseSeed` + StatePhrase determinista (consistente en historial).
- [x] cat-priors CLAMP [0.5,2.0]; criba final qc_final_cull.py con --reviewed-list (umbral correcto 0.90).
- [x] **Vacunas (Fase 5.1)**: catálogo content/vaccines.ts (reglas por región + WSAVA core), store IndexedDB v3 (vaccinations + by-cat), puerto+IdbVaccinationRepository+composición, VaccineChecklist (premium, selector región, marcar puesta), página /[locale]/medical + nav, i18n. Verde (build 52/52).
- [x] **Estados de anuncios** (InterstitialAd): ad de carga en predicción (AnalyzePanel) + ad obligatorio en corrección con la frase (FeedbackForm); premium sin ads; CLS reservado.
- [x] **Timeline** (HistoryList enriquecido): reproducir/descargar audio, frase por estado (seed), corregir desde el historial (reusa FeedbackForm), `role="feed"`.
- [x] **Carnet descargable/imprimible**: botón imprimir (→PDF vía window.print + CSS `@media print`) + export JSON, en VaccineChecklist.
- [ ] PENDIENTE infra-independiente: suite axe-core; carnet QR (dep `qrcode`); fotos de vacunas/informes (store IndexedDB v4 + galería + compresión); escáner de tarjeta oficial (BarcodeDetector + parseo best-effort).
- [ ] **Historial médico "tipo carnet" (infra-independiente, dentro de /medical):**
  - QR del microchip ❌ DESCARTADO (los chips no llevan QR).
  - **Escáner de tarjeta oficial** (RIAC Madrid, etc.): BarcodeDetector + fallback; el QR suele ser una URL → reconocer patrón conocido → abrir web oficial + **importación asistida** de rabia (append-only, fecha hoy); QR desconocido → mostrar contenido + confirmación manual. NO prometer verificación automática.
  - **Fotos de vacunas/informes** en IndexedDB local (store nuevo, blobs comprimidos canvas→WebP); subida a R2 cuando exista object storage.
  - **Descargable/imprimible**: vista de impresión + window.print()→PDF; export JSON.
  - **QR del carnet** (lib `qrcode`): resumen compacto (nombre, microchip, rabia al día + fecha).
  - **UX**: /medical con selector de gato → resumen de estado (anillo % al día) + pestañas Vacunas/Documentos/Carnet. Append-only, accesible, responsive.
- [ ] DIFERIDO (necesita TU infra): paridad prosódica JS (cuando exista ONNX); sync IndexedDB↔Postgres (Postgres); billing Stripe (claves) + usePremium real; subida foto/informes médicos (object storage R2). Activar IA: OPENAI_API_KEY.

**Rediseño visual v2 (jun 2026) — verificado verde (typecheck/lint/test/build, 56/56):**
- [x] **Paleta rosa almohadilla**: escala `brand` rosa en `globals.css` (acento 600 `#bf3568`, AA ~5.3:1) + `--color-brand-900`; assets de marca (icon/manifest/OG/global-error) y `card-render` PALETTES a rosa. Semánticos (amber/verde/rojo) y banda `#1c1917` intactos.
- [x] **Background de huellas animado** (`decor/PawBackground` + Paw): capa fija `-z-10`, huellas que aparecen/desaparecen, gris claro/oscuro por tema (`--paw-color`), reduced-motion. En TODAS las páginas ([locale] + auth).
- [x] **Navbar**: logo gato SVG estático (`decor/CatLogo`, sustituye 🐾) en header/menú móvil/footer; toggle de tema con gato (`currentColor` → oscuro en claro / claro en oscuro); selector de idioma como **popover** accesible (icono globo + idioma activo, abre al pulsar, Escape/click-fuera).
- [x] **Hero**: gato que parpadea y mira (`decor/CatFace`, SCSS→CSS Module, theme-aware).
- [x] **Landing 100vh + scroll-snap proximity** + `SectionDots` (IntersectionObserver, teclado, `aria-current`); `scroll-padding-top` para el header.
- [x] **RopeCat** (`decor/RopeCat`, SCSS complejo→CSS estático): gato colgando de un ovillo que se balancea, arriba-derecha, solo landing, `pointer-events-none`, lg+ , oculto en reduced-motion.
- [x] **Tarjetas** (`card-render`): marco mejorado (sombra + filete de acento) + fondo de huellas en canvas (classic denso, playful tenue, elegant limpio).
- [x] **Anuncios responsive**: rail 160→300px (half-page) en 2xl, AdSlot fluido, leaderboard horizontal en móvil/tablet (`AdRailsLayout`).
- [x] Item "login": confirmado que NO es bug — `AccountMenu` se oculta con `accounts.enabled=false`; aparece al activar cuentas. Footer `<nav>` redundante retirado.

**Mejoras UX v3 (jun 2026) — verificado verde (typecheck/lint/test/build):**
- [x] **Modal/ConfirmDialog** (`ui/Modal.tsx`, `ui/ConfirmDialog.tsx`): diálogos accesibles (portal, focus-trap, Escape, scroll-lock) que sustituyen `confirm()`/`alert()` nativos. Usado en borrar gato y borrar dosis de vacuna.
- [x] **Optimización de imágenes** (`infrastructure/media/optimize-image.ts`): downscale+WebP en cliente vía `createImageBitmap`+canvas. Presets avatar (≤512px) y card (≤1080px). Límite entrada 10 MB.
- [x] **Foto de gato (avatar)** (`cats/CatManager.tsx`): subida optimizada, avatar circular desde IndexedDB (`catPhotos`). Sustituye al emoji 🐈. Borrado de gato con ConfirmDialog.
- [x] **"Vacunación"** (rename desde "Médico") + **6 avisos de cuidado felino** (`content/cat-care-tips.ts`, `CatCareTips.tsx`): chocolate, ibuprofeno, cebolla/ajo, lirios, leche, anticongelante. Rejilla de tarjetas con severidad danger/warn.
- [x] **Historial de dosis** (`VaccineChecklist.tsx`): chips con todas las fechas por vacuna (no solo la última). Borrado de dosis con X al hover + ConfirmDialog.
- [x] **Tarjetas rediseñadas** (`card-render.ts`): 3 estilos diferenciados — Minimal (claro, filete rosa), Sticker (fondo huellas, badges), Premium (oscuro, doble filete rosa/dorado, serif). `wrapText` respeta `\n` del textarea.
- [x] **CatFace mejorado** (`decor/CatFace.{tsx,css}`): orejas rosas (`--color-brand-400`) en ambos temas + bigotes (3 líneas finas L/R ancladas al muzzle).
- [x] **Landing sin hueco** (`globals.css` + `page.tsx`): `--header-h` + `scroll-padding-top` corrigen el snap de secciones 2/3.
- [x] **SectionDots mejorado** (`SectionDots.tsx`): flechas ↑/↓ (y ←/→) navegan entre secciones con foco en el dot. Tooltip con nombre de sección al hover/focus.
- [x] **PawBackground "caminar realista"** (`decor/PawBackground.tsx`): componente cliente que genera estelas de 5 huellas L/R alternas en dirección aleatoria, con ritmo de pasos y fade progresivo. Máx 2 paseos simultáneos. Reduced-motion: 3 huellas estáticas.

---

## ⏳ PENDIENTE (ordenado por fase y dependencia)

### FASE 0 — Cerrar el modelo (prioridad inmediata)
- [ ] **Revisar criba v2** (302 a impureza ≥0.90): `qc_final_cull.py --min-impurity 0.90 --max-frac 0.6 --out quarantine/final_cull_v2 --move` → borrar inválidos / reubicar mal etiquetados.
- [ ] Devolver supervivientes a `processed_clean` (por carpeta = clase correcta).
- [ ] **Conseguir datos de atención** (95 → ≥250) vía `fetch_quarantine.py --classes atencion`; equilibrar clases hacia ~400-450 (atención es el cuello).
- [ ] **Reentrenar limpio**: clean_augmented → preprocess --factor 3 → build_prosodic_cache → extract → train → evaluate.
- [ ] **Calibrar umbrales** (calibrate_thresholds.py sobre OOF) + **exportar ONNX** (export_yamnet_head.py + export_yamnet_onnx.py).
- [ ] **Paridad prosódica en JS**: replicar las 25 features (prosodic_features.py) en dsp/features.ts para activar el motor ONNX en el navegador. BLOQUEANTE para desplegar el modelo real.

### FASE 1 — Infra de producción (desbloquea premium/cuentas)
- [ ] Supabase: crear proyecto, `DATABASE_URL` (pooler 6543), `npm run db:migrate`.
- [ ] Resend (SMTP) + `npx auth secret` + `AUTH_EMAIL_*`.
- [ ] Cloudflare Turnstile (site + secret key).
- [ ] **Object storage** (Cloudflare R2 o Supabase Storage) para: audio donado, fotos de gato, archivos médicos. Bucket privado + URLs firmadas.
- [ ] `NEXT_PUBLIC_ACCOUNTS_ENABLED=true` + probar flujo de login.

### FASE 2 — Sync, perfiles y Timeline
- [x] **Sync IndexedDB↔Postgres** (cats, sessions) para registrados (last-write-wins por entidad). API + autorización por dueño.
- [x] **Perfiles de gato**: foto (subida + compresión), raza, edad, **campo traits** (falta en el form), **nº microchip** (validación ISO 15 díg.) + **escáner QR** (BarcodeDetector/fallback JS; extrae chip/URL best-effort).
- [ ] **Timeline** interactiva y responsiva: reproducir/descargar maullidos (**Opus**), **frase por estado en cada entrada** (persistir SEED int, no texto), **corrección desde el historial**.
- [ ] Persistencia ligera: audio en Opus (mínimo tamaño) + seed de frase.

### FASE 3 — Monetización y máquina de anuncios
- [ ] **Billing (Stripe)**: suscripción Premium; exponer `plan` en sesión; `usePremium()` real.
- [ ] **"Premium Container"** en landing (estético, irresistible, sin ads en landing).
- [ ] Estados de anuncios (free): `isPredicting` → **ad de carga durante predicción** (no se quita); `isCorrecting` → **ad obligatorio en corrección** (sin romper scroll móvil) mostrando la **frase por estado** destacada. Premium: sin ads (ya).
- [ ] CLS: `aspect-ratio` en banners reales además del min-h.

### FASE 4 — Asistente IA unificado + RAG (premium) ⭐ — ✅ HECHO (jun 2026)
- [x] Servicio único `/api/assistant` con **dos modos** (médico / maullido) y guardarraíles compartidos. (assistant.ts + route.ts)
- [x] **RAG por inyección de contexto** (sin vector DB): perfil + resumen de maullidos recientes (vacunas/informes se inyectarán cuando exista su UI/sync).
- [x] **System prompts** con guardarraíles (informativo, no diagnóstico, rechazo de dosis, redirección a urgencias).
- [x] Seguridad: auth + **rate-limit por usuario** (8/h + 20/día) + zod + tope de tokens (500) + API key **solo servidor** (OPENAI_API_KEY).
- [x] **Proveedor LLM elegido: GPT-4o-mini** (OpenAI).
- [x] UI: AssistantChat (premium-gated, selector de modo/gato, disclaimer persistente) + página /[locale]/assistant + nav.
- [x] Asistente maullido: el LLM explica el resultado de NUESTRO clasificador. (Meow-Omni-1 descartado.)
- [ ] PENDIENTE activar: poner `OPENAI_API_KEY` y, con billing, premium real (`usePremium`) — hoy gate por usuario autenticado + upsell premium.

### FASE 5 — Historial médico (registrado)
- [x] **Checklist de vacunas** + **selector de región** (UE/país): catálogo con nivel `requerida_legal` (rabia y según país) vs `recomendada` (WSAVA core) vs `no-core`. Conteo/estado (al día / pendiente / falta requerida).
- [x] **Historial de dosis** por vacuna: chips de fechas borrables, input de fecha para añadir refuerzos.
- [x] **6 avisos de cuidado felino** (`CatCareTips`): chocolate, ibuprofeno/paracetamol, cebolla/ajo, lirios, leche, anticongelante. Rejilla danger/warn.
- [ ] **Subida de informes/imágenes**: PDF/JPG/PNG/WebP, **límite 5MB/archivo**, **compresión de imagen en cliente**, caps por usuario (~30/gato o 100MB), bucket privado + signed URLs, cifrado + consentimiento, no entrenar.

### FASE 6 — Lanzamiento
- [ ] **Revisión legal por abogado** (Términos/Privacidad) antes de público.
- [ ] Consentimiento explícito de datos médicos en el alta médica.
- [ ] QA final: axe-core (a11y), responsividad real (móvil/tablet/desktop/ultra-wide), CLS, rate-limit en TODAS las rutas de escritura, docs sin inconsistencias.

---

## 🎚️ Corrector por gato (cat-priors) — análisis y refinamientos

**Lo que YA está bien (mantener):** aislamiento por `catId` (la corrección solo afecta a ESE gato);
local-only (NO mueve el modelo global → un usuario no puede envenenarlo; el global reentrena aparte
con audio donado validado); se aplica ANTES de derivar la certeza (una llamada ambigua puede pasar
a confiada, y luego se aplica la política `unknown`); **clamp [0.5, 2.0]** (los priors nunca anulan
evidencia acústica clara); arranca uniforme (no-op sin correcciones).

**Refinamientos para "influir justo lo necesario, ni más ni menos" (recomendados, decisión de producto):**
- [ ] **Base de pseudo-conteo más alta** (Dirichlet): hoy `alpha` arranca en 1, así UNA corrección
  (alpha 1→2) ya da ~1.4× y puede voltear una llamada ambigua de ese gato (demasiado reactivo a un
  toque accidental). Subir la base a ~3-4 hace la adaptación **gradual y basada en evidencia**
  (≈1.15× en la 1ª corrección; ~5-6 consistentes para acercarse al techo 2×). Es la palanca principal.
- [ ] **Peso por veredicto**: `reinforceCatPriors` admite `weight` pero siempre se llama con 1.
  Usar `incorrect`→1.0 y `partially-correct`→0.5 (el veredicto ya se captura en feedback) para que la
  influencia sea proporcional a la certeza del usuario.
- [ ] **Recencia/caducidad (opcional)**: las correcciones no expiran; si el gato cambia de conducta o
  una corrección antigua fue errónea, persiste. Decaimiento suave (p. ej. ×0.99 periódico) o tope de
  conteo efectivo. Baja prioridad.
- [ ] Tests al tocar esto: ampliar `cat-priors-clamp.test.ts` (gradualidad de la 1ª corrección, peso por veredicto).

## ⭐ Arquitectura de la IA (Fase 4) — detalle

**Un solo cerebro, dos modos.** No dos IAs separadas: un único servicio `assistant` que recibe `mode: "medical" | "meow"` y arma el contexto adecuado. Comparten: auth, rate-limit, guardarraíles, formato de respuesta, logging.

**RAG = inyección de contexto (no vector DB).** Los datos de un gato son pocas filas → traerlas y meterlas en el prompt es más barato y simple que embeddings. Pipeline por petición:
1. Verificar premium + sesión + que el `catId` es del usuario.
2. Recuperar SOLO lo necesario según el modo:
   - `medical`: perfil (nombre/raza/edad) + vacunas (estado/fechas) + últimos N informes (títulos/fechas, no el binario).
   - `meow`: perfil + resumen de las últimas N sesiones (clase, confianza, fecha) + el análisis del maullido consultado (clase + features + prosodia).
3. Construir el prompt: system (guardarraíles) + contexto inyectado + pregunta.
4. Llamar al LLM (tope de tokens), devolver respuesta + disclaimer.

**System prompt (esqueleto, ambos modos):**
> Eres un asistente informativo dentro de la app MeowDecoder. NO eres veterinario y NO das diagnósticos, tratamientos ni dosis. Usa SOLO el contexto proporcionado del gato del usuario y conocimiento general de cuidado felino. Si te preguntan por dosis/fármacos/diagnóstico o describen una urgencia, recomienda acudir a un veterinario colegiado de inmediato. Sé claro, honesto y prudente; si no sabes, dilo.

**Seguridad/coste:** API key server-only; rate-limit por usuario; máximos de tokens y de longitud de conversación; datos médicos cifrados, mínimos al prompt, nunca para entrenar.

---

## Decisiones abiertas (requieren tu input cuando toque)
- Proveedor LLM (rec: Claude Haiku) y presupuesto.
- Proveedor de billing (rec: Stripe).
- Object storage (rec: Cloudflare R2 por coste de egress).
