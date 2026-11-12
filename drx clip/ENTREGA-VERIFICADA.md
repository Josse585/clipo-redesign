# Informe de revisión de la entrega — clipo-20261112-r1

Fecha: 12 de noviembre de 2026. Proyecto Clipo / DRIX CLIP.

## Respuesta a la incidencia

La entrega anterior no contó con una identificación verificable: se reutilizó el mismo nombre/enlace para varias revisiones y no se acompañó de un inventario de integridad. Además, la documentación acumulaba instrucciones desactualizadas. Ese procedimiento no permitía al usuario comprobar con claridad qué versión estaba integrando. Fue un fallo de entrega y documentación; sentimos el tiempo perdido.

Se ha comparado el archivo original adjuntado por el usuario con los ZIP conservados en este entorno. Los tres ZIP conservados (`drix-clip-actualizado.zip`, `drix-clip-webcodecs.zip` y `drix-clip-redisenado.zip`) son íntegros y contienen los mismos archivos actualizados. Los tres archivos principales sí difieren del original y están presentes el directorio `public/vendor` y `public/prueba-webcodecs.html`.

Esto describe los archivos conservados aquí. No permite determinar qué bytes recibió el usuario, qué se integró en su repositorio ni qué sirvió el despliegue. No se atribuye la incidencia a caché, a un error del usuario ni a otra causa sin evidencia. La causa exacta de la discrepancia del archivo recibido no está demostrada. Las deficiencias confirmadas son la falta de trazabilidad y la documentación incoherente.

## Comparación con el original

| Archivo | Original, bytes | Versión incluida, bytes | Comparación SHA-256 |
|---|---:|---:|---|
| `public/index.html` | 7,163 | 21,434 | Diferente |
| `public/style.css` | 10,180 | 50,963 | Diferente |
| `public/app.js` | 22,905 | 27,109 | Diferente |

Las huellas completas del ZIP original, ZIP conservado y archivos están en `evidence/comparison-original.json`. Cada archivo de esta entrega tiene su tamaño y SHA-256 en `MANIFEST.json`; `SHA256SUMS` permite una comprobación independiente. El manifiesto y la lista de huellas no se incluyen a sí mismos para evitar referencias circulares. La huella del ZIP final se suministra en un archivo externo `.zip.sha256`.

## Corrección concreta

Se ha creado una entrega con identificador y nombre nuevos: `clipo-entrega-verificada-20261112-r1.zip`. Los enlaces anteriores no se sobrescriben.

El contenido público existente se recuperó del ZIP conservado más reciente. Se instaló desde su lockfile y se regeneró el HTML de revisión y las páginas: ningún archivo público existente cambió su SHA-256. Se conserva, por tanto, la última implementación del diseño aprobado disponible en este entorno, sin una nueva reinterpretación. Se añadió únicamente `public/version.json` para identificar el despliegue.

El paquete incluye portada pública, estudio con sesión, fotografía, parallax, editor, tres encuadres, tres rangos de duración, subtítulos opcionales, cantidad por plan, Mis creaciones, funciones de servidor, biblioteca versionada, worker de exportación y HTML autónomo. La raíz del ZIP contiene directamente `public/`, `functions/` y los archivos de proyecto. Se evita la carpeta intermedia `clipo-main/` presente en los ZIP anteriores.

Se reescribieron README, despliegue, producto y documentación de diseño/motor para ajustarlos al código. Se corrigieron las instrucciones antiguas de acceso por correo: el código usa Google OAuth mediante Supabase. Se explicita la diferencia entre la aplicación real y el HTML de revisión, y se retiran afirmaciones obsoletas sobre estilos y pruebas.

## Verificación realizada

En una carpeta nueva extraída del ZIP conservado se ejecutaron `npm ci`, `npm run build:demo`, `npm test` y la suite Playwright completa con servidor nuevo de esa carpeta.

- 29 pruebas de lógica y API correctas, con escenarios controlados de autorización, planes, transcripción, pagos y límites.
- 17 pruebas de navegador correctas: preparación incremental, exportación de 45 y 90 segundos con sonido, recorte, cancelación, archivo corrupto y modos alternativos; exportación autónoma, tres formatos, cantidad del plan, persistencia y eliminación; comprobación visual de subtítulos sobre el archivo descargado; bienvenida, estudio y anchuras de pantalla.
- Se comprobó la transición visual del estudio de producción mediante su función de presentación. Esa comprobación no equivale a iniciar sesión realmente con Google ni valida por sí sola la autorización del servidor.
- La reconstrucción no cambió la interfaz aprobada: los archivos públicos existentes conservaron sus huellas.

Los resultados, mediciones y capturas están en `evidence/`. El ZIP final se comprueba de nuevo al extraerlo, ejecutando `scripts/verify-release.mjs`, las 29 pruebas de lógica/API y una comprobación de carga en navegador; los resultados de esa comprobación final se adjuntan externamente para no modificar los bytes ya empaquetados.

## Alcance y límites

Se prepararon 240 segundos de audio desde archivos sintéticos de 431 MiB y 1 GiB. Son copias con relleno: demuestran el manejo del tamaño sin rechazarlo por un umbral de 200 MB; no representan la complejidad de un video real de alto bitrate ni garantizan memoria o rendimiento ilimitados. La exportación medida usa WebCodecs y produjo WebM en este Chromium; el contenedor depende de los códecs disponibles.

No se ha usado el archivo real del usuario, un móvil físico ni sus credenciales de Google/Supabase/Groq/PayPal. Los ensayos de API utilizan respuestas controladas. Inicio de sesión, transcripción, almacenamiento y cobros reales requieren la comprobación del despliegue configurado indicada en `DEPLOYMENT.md`. No se ha publicado esta versión sobre el dominio existente ni se han modificado sus datos o credenciales.

## Comprobar la recepción

1. Comprueba la huella externa del ZIP y extráelo en una carpeta nueva.
2. Ejecuta `node scripts/verify-release.mjs`: detecta archivos ausentes o distintos del inventario.
3. Usa `npm run dev` y abre `/prueba-webcodecs.html` para revisar bienvenida/estudio y exportación manual local.
4. Para publicar la aplicación real, sigue `DEPLOYMENT.md`; la salida es `public`, sin compilación obligatoria. Comprueba `/version.json` después de publicar.
