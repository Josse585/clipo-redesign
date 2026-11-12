# Motor incluido y alcance

`public/lib/audio.js` inicia un trabajo de audio en `media-worker.js`; este usa `BlobSource` de Mediabunny para leer la pista por partes, convertirla a mono PCM de 16 kHz y devolver las muestras. No se elige una ruta lenta por superar 200 MiB. La transcripción de producción sigue enviando fragmentos WAV a su API original.

`public/lib/render.js` inicia un trabajo de exportación por fotogramas, con recorte, subtítulos y marca. El worker comprueba decodificación/codificación. Produce MP4 H.264/AAC cuando el dispositivo puede codificar ambas pistas; en caso compatible alternativo, WebM VP8/Opus. Si falla la ruta rápida se intenta el grabador `render-legacy.js`, que trabaja en tiempo real. No se garantiza MP4 en cualquier navegador ni continuidad al suspender la aplicación.

`media-task.js` controla cancelación y falta de progreso. El modo de compatibilidad incluye vigilancia de bloqueos. El audio completo y el clip codificado del tramo ocupan memoria: lectura incremental no significa memoria ilimitada ni soporte garantizado de cualquier archivo.

Los formatos 9:16, 1:1 y 16:9 se aplican a la resolución real. Los rangos son 15–30, 30–60 y 40–90 s. La opción de subtítulos modifica los fotogramas, no solo la vista previa. Los límites y calidades dependen del plan. Las pruebas verifican archivos descargados, sonido, proporción, duración y presencia/ausencia de texto.

Mediabunny 1.65.2 está incluido en `public/vendor` con licencia MPL-2.0. Se puede regenerar con `npm ci && npm run vendor`. El HTML de revisión incluye su propio bundle y no sustituye los servicios autenticados de producción.

Las mediciones verificadas de esta entrega están en `evidence/`. Se obtuvieron en Chromium de escritorio con medios sintéticos. Los casos de 431 MiB y 1 GiB usan relleno del archivo para aislar el manejo por tamaño. No demuestran el rendimiento de un video real 4K de ese peso ni certifican un móvil físico.
