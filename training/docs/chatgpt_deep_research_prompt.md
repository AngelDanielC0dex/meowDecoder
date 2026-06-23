PROMPT PARA CHATGPT CON DEEP RESEARCH ACTIVADO
================================================

Estoy entrenando un clasificador de vocalizaciones felinas con 11 estados 
emocionales usando YAMNet + cabeza densa con validación Leave-One-Cat-Out.
Mi modelo necesita datasets de audio REAL (no sintético) de gatos para 
las 4 clases donde tengo <300 muestras y <20 gatos distintos. Necesito 
que me busques datasets públicos, descargables, con enlaces directos 
(DOI, Zenodo, HuggingFace, Kaggle, Google Drive oficial) y que me 
proporciones para cada uno:

1) Nombre oficial del dataset
2) Enlace de descarga directa (sin registro si es posible)
3) Número de gatos distintos (cat_ids únicos) — ESTE ES EL DATO CLAVE
4) Número total de clips de audio
5) Etiquetas disponibles (qué clases cubre de las mías)
6) Formato de los archivos (WAV, MP3, sample rate, mono/stereo)
7) Cómo extraer el cat_id de cada clip (nombre de archivo, metadatos CSV, etc.)
8) Licencia (CC0, CC-BY, CC-BY-NC)

Las 4 clases que necesito cubrir, con queries acústicas para que sepas qué buscar:

1. TRINOS (trill/chirp):
   - Sonido: chirrido corto (0.2-0.8s), f0 modulado ascendente, voiced
   - Busca: "cat trill", "cat chirp", "cat greeting", "feline trill"
   - Ideal: 20+ gatos distintos, 200+ clips

2. PELEA (cat fight):
   - Sonido: chillidos de alta intensidad, múltiples harmónicos, transitorios
   - Busca: "cat fight", "cats fighting", "cat screech", "feline aggression"
   - Ideal: 15+ gatos distintos, 200+ clips

3. LLAMADA DE LA MADRE (mother cat call):
   - Sonido: maullido melódico descendente, 0.5-2s, voiced
   - Busca: "mother cat calling", "cat calling kittens", "cat isolation call"
   - Ideal: 15+ gatos distintos, 150+ clips

4. CAZA (hunting chatter):
   - Sonido: clics rítmicos rápidos (0.05-0.3s), mixed voiced/unvoiced
   - Busca: "cat chatter", "cat chirping at birds", "feline hunting call"
   - Ideal: 15+ gatos distintos, 150+ clips

DATASETS QUE YA TENGO (NO los busques):
- CatMeows (Ludovico et al., Zenodo 4008297): 21 gatos, 3 contextos (B/F/I)
- VGGSound (cat/dog subset de Kaggle): ~1700 YouTube Links, solo 5 clases
- Pandeya Cat Sound Classification V2: sintético, 1 cat_id por clase
- Meow-10K (smgjch/meow-10k en HuggingFace): etiquetas de comportamiento, no vocal
- Freesound API (ya tengo script de descarga)

FORMATO DE RESPUESTA QUE NECESITO:
Para cada dataset que encuentres, dame una ficha técnica con los 8 puntos 
de arriba. Prioriza datasets académicos (de papers de bioacústica felina) 
sobre compilaciones amateur. Si un dataset tiene MUCHOS gatos (>50) aunque 
pocos clips, también me interesa porque LOCO se beneficia más de diversidad 
de emisores que de volumen bruto.

Si encuentras datasets que cubran VARIAS de mis 4 clases a la vez, mejor.
Dame también estimaciones realistas de cuántos clips/gatos aporta cada
clase (no el total del dataset, sino lo que realmente sirve para mis 4 
huecos).
