# Producto incluido

Clipo / DRIX CLIP convierte contenido hablado de videos largos en clips para redes. En producción conserva Supabase Google OAuth, transcripción Groq, selección heurística de fragmentos basada en texto, generación en el navegador, historial privado de 24 horas y suscripciones PayPal.

La fuente de límites y precios es `functions/_lib/shared.js`, expuesta mediante `/api/config`. Gratis incluye hasta 3 clips por video y salida 720p con marca; Pro usa sus límites y calidad configurados en esa fuente. No se prometen viralidad, rapidez uniforme ni tamaño de entrada ilimitado.

El HTML autónomo es una revisión del diseño con exportación manual local: permite elegir ambas vistas, escribir el texto y exportar fragmentos. No transcribe ni crea sesiones reales. La aplicación de producción vive en `public/index.html` y mantiene el recorrido autenticado.

La entrada de audio se lee incrementalmente y los intervalos de video se exportan con WebCodecs si hay soporte de códec. Existe una ruta de compatibilidad. El dispositivo conserva restricciones de memoria, duración y suspensión del navegador; los servicios externos conservan sus cuotas. Detalles verificables en `WEBCodecs.md`, `ENTREGA-VERIFICADA.md` y `evidence/`.
