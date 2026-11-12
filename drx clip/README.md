# Clipo / DRIX CLIP — entrega verificada 20261112-r1

Esta entrega conserva el diseño aprobado: fondo carbón, acentos lima, fotografía de estudio, bienvenida comercial y estudio con parallax tras iniciar sesión. No contiene un rediseño alternativo.

## Abrir y comprobar

Descomprime en una carpeta nueva. `public/`, `functions/` y `package.json` están directamente en la raíz del ZIP, sin otra carpeta `clipo-main` intermedia.

Con Node.js 22 o posterior:

```sh
node scripts/verify-release.mjs
npm run dev
```

Abre http://localhost:3000/prueba-webcodecs.html para revisar ambas vistas y exportar clips manuales sin configurar servicios. Usa el selector «Bienvenida / Estudio». Esta revisión **no inicia una sesión Google real**, no transcribe automáticamente y guarda sus creaciones en ese navegador.

http://localhost:3000/ es la aplicación de producción. Su estudio se muestra al recibir una sesión válida de Supabase. El servidor local solo implementa `/api/config`; para el recorrido real de cuentas, transcripción y almacenamiento utiliza Cloudflare Pages con las variables existentes de tu proyecto.

## Archivos principales

| Archivo | Función |
|---|---|
| `public/index.html` | Aplicación de producción: bienvenida y estudio según la sesión |
| `public/style.css` | Diseño aprobado y adaptación a pantallas pequeñas |
| `public/app.js` | Acceso Google, flujo de creación, planes e historial de cuentas |
| `public/session-view.js` | Presentación de las vistas según sesión |
| `public/brand-interactions.js` | Navegación, pasos interactivos, FAQ y parallax |
| `public/lib/media-worker.js` | Preparación de audio y exportación por fotogramas |
| `public/lib/render.js` | Elección del motor rápido o de compatibilidad |
| `public/lib/render-legacy.js` | Grabador alternativo para dispositivos incompatibles |
| `public/vendor/mediabunny-1.65.2.mjs` | Biblioteca incluida y fijada a una versión |
| `public/prueba-webcodecs.html` | Revisión autónoma con editor manual funcional |
| `public/version.json` | Identificador de esta entrega y huellas de interfaz |
| `functions/` | API Cloudflare Pages conservada |
| `supabase/` | Esquemas de base de datos originales conservados |
| `MANIFEST.json`, `SHA256SUMS` | Inventario y comprobación de integridad |

El nombre «prueba-webcodecs.html» es un nombre de archivo de revisión; los detalles del motor no se muestran como mensajes comerciales.

## Funciones incluidas

- Bienvenida sin sesión: propósito, tres pasos de uso, beneficios, planes y acceso Google.
- Estudio con sesión: diseño premium, comparador visual y parallax con pausa/movimiento reducido.
- Vertical 9:16, cuadrado 1:1 y horizontal 16:9 aplicados al archivo exportado.
- Duraciones 15–30, 30–60 y 40–90 segundos; el corte automático no rebasa el máximo del rango.
- Subtítulos opcionales y cantidad según el plan, incluido máximo disponible.
- Historial de cuentas con reproducción, descarga, eliminación y retención de 24 horas.
- Preparación de audio incremental y exportación con WebCodecs cuando el dispositivo lo permite; cancelación y método de compatibilidad.

En la revisión HTML, el usuario escribe el texto de sus subtítulos y elige el tramo manualmente. En producción, el audio se envía a Groq y la selección de fragmentos usa la transcripción. El selector de vistas de revisión no existe en producción ni sustituye la autorización de la API.

## Publicar

Consulta `DEPLOYMENT.md`. Configura Cloudflare Pages con salida `public` y sin comando de compilación: los archivos públicos y la biblioteca ya están generados. Conserva las variables y la base de datos del despliegue existente. No ejecutes migraciones otra vez por este cambio de interfaz.

## Reconstruir y ejecutar pruebas

Solo si vas a modificar o comprobar el código:

```sh
npm ci
npm run vendor
npm run build:demo
npm test
npx playwright install chromium
npm run test:media
```

Las pruebas de navegador requieren FFmpeg y FFprobe en PATH. Crean archivos sintéticos de cuatro minutos y archivos dispersos grandes. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` permite usar un Chromium instalado. `CI=1` evita reutilizar un servidor ya iniciado para la comprobación.

## Alcance de la verificación

`ENTREGA-VERIFICADA.md` y `evidence/` contienen la auditoría y los resultados. La compatibilidad física con tu móvil y el archivo original de 431 MB, el acceso Google real, la transcripción con tu clave, el almacenamiento privado real y los cobros reales requieren verificar el despliegue configurado. No se incluyen secretos ni se afirma haber ejecutado esos servicios con tus credenciales.

Los tiempos medidos en Chromium de escritorio no son garantías de velocidad en móvil. Los archivos grandes de pruebas contienen relleno para comprobar el tratamiento por tamaño; no simulan la carga completa de un video 4K real. El procesamiento local necesita que el navegador siga ejecutándose.
