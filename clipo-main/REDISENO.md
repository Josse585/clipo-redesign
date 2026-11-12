# Rediseño de DRIX CLIP

## Abrir localmente

Requiere Node.js 22 o posterior. No necesita instalar dependencias:

```sh
npm run dev
```

Abre http://localhost:3000. La vista previa funciona sin credenciales: estilos, formatos, reproducción de subtítulos de ejemplo y reproducción de tu archivo local. Tu video de prueba no se sube y sus subtítulos son ilustrativos.

El servidor local ofrece la configuración pública real desde `functions/api/config.js`. No simula cuentas, generación ni pagos. Para utilizar las funciones completas, despliega en Cloudflare Pages con las variables indicadas en README.md. Conserva las variables de tu despliegue actual; este ZIP no las incluye. Si faltan credenciales o falla el servicio, la portada sigue siendo accesible.

## Publicar los cambios

En tu proyecto de Cloudflare existente, sustituye los archivos por esta versión y vuelve a desplegar. Directorio de salida: `public`. No requiere comando de compilación. Se conserva la estructura original de `functions` y `supabase`; no hace falta migrar la base de datos por este rediseño.

## Cambios

- Nueva portada, navegación, tipografía local, fotografía de estudio y diseño adaptable.
- Editor público con tres estilos, tres formatos, visibilidad de subtítulos, línea de tiempo y prueba con video local.
- Planes conservados desde su fuente original y preguntas frecuentes accesibles.
- Interfaz de usuario autenticado renovada; carga por arrastre añadida.
- Mejor gestión de fallos de configuración y acceso Google, sin ocultar la portada.
- Se mantiene el procesamiento original de audio, clips, subtítulos, historial y pagos.
- `drix-theme.css` se conserva por compatibilidad documental pero ya no se carga: el sistema visual completo está en `style.css`.

## Validación

`npm test`: las 25 pruebas originales pasan. Revisión en Chromium a 1440, 1024, 768, 390 y 320 px. Sin desbordamiento horizontal. Pruebas de interacción del editor y estados autenticados con servicios simulados exclusivamente en el navegador de pruebas. Las credenciales reales no están incluidas; acceso Google, transcripción, almacenamiento y pagos reales deben verificarse en el despliegue configurado.

## Versión premium

La portada incluye fotografía ilustrativa, comparación del original y los clips, y parallax con pausa y respeto a movimiento reducido. El editor de muestra conserva sus controles en una sección propia.

Para regenerar el HTML autónomo sin conexión: `node build-preview.mjs`. El archivo se crea en la carpeta superior como `drix-clip-demo.html`; incluye fuentes, imágenes, estilos y scripts. Esta versión HTML es una demostración del diseño, no se conecta a cuentas ni realiza pagos o generación de clips reales.

## Exportación rápida

Esta entrega incorpora WebCodecs, lectura incremental de audio, progreso y cancelación. Consulta WEBCodecs.md. Prueba el motor sin cuenta en `public/prueba-webcodecs.html`; el HTML permite exportar un tramo real con subtítulos de prueba y no realiza transcripción ni guardado en nube.

## Corrección del diseño y de los textos de producto

Se restauró la portada premium y se integró el editor funcional dentro del mismo diseño. El HTML autónomo conserva la fotografía, la comparación de formatos y el parallax. Se retiraron los mensajes de diagnóstico de la interfaz, incluido el umbral por tamaño, los nombres de motores/códecs y los benchmarks. El usuario ve acciones y estados del clip. Se comprobaron creación/descarga, cancelación, menú móvil, comparación visual y ausencia de textos técnicos.

## Encuadre, duración e historial

Se completó el editor con los tres formatos de salida, duraciones 15–30/30–60/40–90 s, subtítulos opcionales, cantidad según plan y Mis creaciones. El historial del HTML se conserva en el mismo navegador; el historial de cuentas continúa usando el servicio privado existente.

## Bienvenida pública y estudio privado

La bienvenida presenta la herramienta, los tres pasos, las ventajas y los planes. Tras entrar con Google se muestra la composición premium con parallax y el editor completo. El historial se oculta al cerrar sesión.

El HTML de revisión empieza en Bienvenida; su selector de vistas permite revisar Estudio sin simular un acceso real con Google. El selector no está en la página de producción.

La bienvenida utiliza la misma paleta carbón y lima, tipografía y componentes que el estudio. Se mantiene la separación de contenido según la sesión.
