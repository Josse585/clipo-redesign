# DRIX CLIP

Herramienta web en español para convertir videos largos en clips verticales para Reels, TikTok y Shorts. Audiencia: creadores con podcasts, entrevistas, tutoriales y contenido hablado.

Funciones existentes: acceso exclusivo con Google mediante Supabase, transcripción de audio con Groq, selección de fragmentos por análisis de texto, generación local de video con subtítulos mediante WebCodecs y un grabador de compatibilidad, historial privado de 24 horas y suscripciones PayPal. El navegador debe permanecer abierto durante la generación. No se promete viralidad.

Los precios y límites se obtienen de `functions/_lib/shared.js` mediante `/api/config`. Cloudflare Pages sirve `public` y ejecuta `functions`. Credenciales según README.md; no se incluyen secretos.

La vista previa pública es independiente: formatos visuales, tres estilos de subtítulos ilustrativos, reproducción y video local. Sus ajustes no cambian el renderizador de producción. Ningún archivo de la vista previa se envía a un servidor.

La preparación de audio utiliza lectura incremental y un worker, sin cambiar a reproducción por superar 200 MiB. La exportación rápida codifica por fotogramas en un worker. La compatibilidad se decide por las capacidades de códec; el procesamiento local no garantiza continuidad al suspender el navegador. Detalles y pruebas en WEBCodecs.md.

Usuarios sin sesión: bienvenida comercial con propósito, funcionamiento, beneficios, planes y acceso Google. Usuarios con sesión: diseño premium del estudio, controles completos, límites del plan e historial privado. La vista previa HTML permite revisar ambos diseños sin crear una sesión real; la producción conserva Supabase Google OAuth y las verificaciones de usuario de la API.
