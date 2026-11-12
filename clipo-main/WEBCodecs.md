# Exportación rápida y audio incremental

Esta versión implementa la opción 3 elegida por el usuario y mejora la preparación del audio que impedía llegar a la exportación con archivos grandes. Los cambios están preparados localmente; no se ha modificado el sitio publicado.

## Probar sin cuenta

Abre `public/prueba-webcodecs.html` en Chrome o Edge actualizado. Es un archivo HTML autocontenido, con los scripts y las fuentes incluidos. También se entrega por separado como `drix-clip-rapido.html`.

Selecciona tu video, el inicio y fin de un tramo de hasta 90 s y pulsa «Crear mi clip». La prueba prepara el audio, exporta un clip real y permite descargarlo. Puedes editar el texto de los subtítulos de ejemplo. Este HTML conserva la portada premium y ofrece un editor manual: no usa Google, no transcribe automáticamente y no envía archivos al servidor. La plataforma completa mantiene su flujo autenticado original. Los detalles del motor y las mediciones se conservan en esta documentación y no se muestran en la interfaz.

Si un navegador restringe workers desde archivos locales, sirve el proyecto con `npm run dev` y abre `http://localhost:3000/prueba-webcodecs.html`. Las APIs rápidas requieren un contexto que el navegador considere seguro: HTTPS o localhost. La compatibilidad exacta desde un archivo local depende del navegador.

## Cómo funciona

- Entrada: `BlobSource` de Mediabunny lee el archivo por partes. No se carga el video entero con `arrayBuffer`.
- Audio: un worker decodifica únicamente la pista de audio y la convierte a mono PCM de 16 kHz sin reproducir el video. La transcripción conserva sus fragmentos de cuatro minutos y su API original.
- Exportación: un worker decodifica el intervalo elegido, dibuja el encuadre, subtítulos y marca de agua, y codifica por fotogramas. No usa el reloj de reproducción para avanzar.
- Los timestamps de los subtítulos permanecen referidos al original; se compensa el inicio del recorte. Se respetan rotación y transformación del archivo de entrada.
- Salida preferida: MP4 H.264/AAC si hay codificadores compatibles. Alternativa rápida: WebM VP8/Opus. Se comprueba que ninguna pista original necesaria sea descartada.
- Si no se puede usar el motor rápido, se intenta el grabador de compatibilidad y se informa de que trabaja en tiempo real.
- El fondo difuminado se dibuja a menor resolución para reducir el coste gráfico; el primer plano mantiene la resolución elegida.

## Tamaño y memoria

Se ha eliminado la selección de método por el umbral de 200 MiB. No se ha sustituido por una promesa de tamaño ilimitado: la resolución, los códecs, la duración, la memoria del dispositivo y el tamaño de salida siguen importando.

Las pruebas de 431 MiB y 1 GiB usan un archivo de 240 s con relleno al final para aislar el manejo del tamaño. **No equivalen a procesar un archivo real 4K de 431 MB o 1 GB.** La prueba con el archivo y el móvil originales del usuario sigue pendiente.

La lectura de entrada es incremental, pero el audio PCM del tramo y cada clip codificado se conservan en memoria para enviarlos/descargarlos. Un video muy largo o una salida grande puede agotar memoria en ciertos móviles. Los límites de minutos del plan, transcripción, almacenamiento y retención siguen siendo independientes.

## Fiabilidad

El botón de cancelar termina el worker y permite iniciar otro proceso. La exportación y preparación rápida detectan 60 s sin avance y liberan el worker. La ruta de compatibilidad detecta interrupciones y errores en lugar de esperar indefinidamente; el audio termina por el conteo de muestras aunque la reproducción se haya pausado y reanudado. Los errores de permisos, códec o lectura se muestran al usuario.

Se corrigió el conteo Pro: `maxClips: null` significa sin límite del plan, no cero. La cancelación de transcripción no espera los reintentos habituales. Los clips ya guardados o descargados no se borran por cancelar una operación posterior.

El procesamiento local necesita mantener el navegador en funcionamiento. WebCodecs no garantiza continuar cuando el sistema operativo suspende o cierra la aplicación. No se ha añadido un servidor de render ni facturación nueva.

## Validación

- 25 pruebas originales de lógica y servidor: correctas.
- 8 pruebas de navegador de la nueva exportación: correctas.
- Pruebas Playwright de audio incremental con archivos de 431 MiB y 1 GiB, tono de 440 Hz, clips de 45/90 s, recorte, sonido al principio y al final, cancelación y reinicio, archivo corrupto y modos de compatibilidad.
- HTML autocontenido: exportación real y descarga, sin peticiones externas, revisado a 390 px.
- FFprobe verifica duración, resolución y pistas de audio/video.
- Navegador de pruebas: Chromium 156 sobre Linux. La versión de este equipo usa VP8/Opus en WebM; la ruta MP4 H.264/AAC depende de las capacidades del dispositivo y no se ha certificado en un iPhone/Android físico.
- No se ha ejecutado la transcripción/guardado real con sesión Google en producción: las credenciales no están incluidas.

Los resultados y las mediciones finales se guardan en `artifacts/webcodecs-measurements.json`. Son mediciones del equipo de pruebas, no garantías de tiempo en móvil. El benchmark original: audio progresivo de 240 s tardó 240,27 s y un clip de 45 s tardó 45,07 s. Los nuevos resultados usan audio real de prueba sintético, no voz transcrita. Los fondos y subtítulos hacen variar el coste de render.

## Publicar

Sustituye los archivos del proyecto por los de esta versión y vuelve a desplegar en tu proyecto de Cloudflare Pages, conservando las variables de entorno existentes.

- Directorio de salida: `public`.
- No necesita comando de compilación: el bundle de Mediabunny está incluido en `public/vendor`.
- Se conservan las funciones y la base de datos. No hace falta migrar tablas por este cambio.
- Comprueba acceso Google, transcripción, guardado y descarga en tu despliegue con el archivo real de 431 MB.
- El HTML autocontenido es la prueba local del motor; no sustituye la plataforma con cuentas y transcripción.

## Desarrollo y pruebas reproducibles

Requiere Node.js 22+. Para modificar o regenerar bundles:

```sh
npm ci
npm run vendor
npm run build:demo
npm test
```

Las pruebas de video requieren FFmpeg/FFprobe y Chromium:

```sh
npx playwright install chromium
npm run test:media
```

Opcionalmente usa un Chromium instalado con `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` y un MP4 sintético de 240 s con `DRIX_MEDIA_FIXTURE`. Sin esa variable, la prueba genera su archivo mediante FFmpeg en el directorio temporal del sistema. Las pruebas crean archivos dispersos grandes para comprobar la lectura por tamaño; no los suben.

Mediabunny 1.65.2 está fijado en package-lock.json y distribuido sin modificaciones bajo MPL-2.0. Aviso y licencia en `public/vendor`.

## Mediciones de la última ejecución

| Caso | Tiempo medido |
|---|---|
| Audio de 240 s, archivo de prueba four-minutes-431MiB.mp4 | 1.22 s |
| Audio de 240 s, archivo de prueba four-minutes-1GiB.mp4 | 0.82 s |
| Exportación de 45 s, encuadre fill | 7.67 s |
| Exportación de 90 s, encuadre fit | 18.41 s |

## Editor completo

El editor conserva el diseño premium y ahora permite vertical 9:16, cuadrado 1:1 y horizontal 16:9. La calidad base del plan se aplica al lado corto: 720p produce 720×1280, 720×720 o 1280×720; Pro a 1080p produce 1080×1920, 1080×1080 o 1920×1080.

Duraciones: cortos 15–30 s, medios 30–60 s y largos 40–90 s. El margen de corte del selector automático se limita para no superar el máximo. El editor manual permite ajustar el tramo y crear lotes sin rebasar el video.

El selector de cantidad respeta el máximo del plan (Gratis: hasta 3) e incluye máximo disponible. La plataforma autenticada obtiene los límites del servidor. El HTML autónomo muestra el plan Gratis, sin fingir una suscripción Pro. Los subtítulos se pueden activar o desactivar, y su estado afecta al archivo exportado.

Mis creaciones permite reproducir, descargar y eliminar. En la plataforma autenticada se mantiene el historial privado existente; en el HTML autónomo se guardan los clips en ese navegador durante 24 horas. Si el navegador no permite guardarlos o falta espacio, se informa y se conserva la descarga de la sesión. Las pruebas comprueban persistencia tras recarga y eliminación real.

Validación de esta actualización: proporciones verificadas con FFprobe en archivos descargados de los tres formatos, lote real de tres clips según el plan, historial tras recarga, cancelación y análisis de fotogramas para verificar la presencia y ausencia de subtítulos.

## Diseño según sesión

La página de producción (`public/index.html`) muestra primero la bienvenida pública y espera la sesión de Supabase para mostrar el estudio premium. Al cerrar sesión se cancela el trabajo activo, se limpia el archivo seleccionado y los resultados visibles, y se regresa a la bienvenida. La API conserva sus verificaciones de usuario.

El HTML de revisión permite elegir Bienvenida o Estudio mediante un selector de vistas exclusivamente para revisar el diseño. No realiza un acceso Google simulado ni concede acceso a datos de cuentas. Las exportaciones de la revisión siguen siendo locales. La validación de cambio de vistas no equivale a una prueba completa de OAuth o de los servicios con credenciales reales.

Fuentes de diseño: `scripts/templates/welcome.html`, `scripts/templates/member-hero.html`, `scripts/studio-markup.html` y `scripts/build-pages.mjs`. `npm run build:pages` regenera la página de producción. `npm run build:demo` también regenera el HTML de revisión. El bundle de producción no incluye los controles de revisión.
