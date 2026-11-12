# Sistema de diseño

Rediseño solicitado de la web existente. Identidad DRIX CLIP conservada; apariencia reconstruida como estudio editorial de video.

- Fondo carbón #121413, superficies #1b1e1c, texto #f3f4ef y acento lima #cdf77c. El acento identifica acciones y palabras destacadas.
- Manrope alojada localmente: lectura regular y títulos en negrita. Escala de títulos fluida; ancho máximo de contenido 1240 px.
- Portada: propuesta de valor y acceso Google a la izquierda, editor interactivo a la derecha. Después: proceso, planes desde API y preguntas frecuentes.
- Sesión iniciada: interfaz de trabajo con límites, carga de video, ajustes, progreso, resultados e historial.
- Bordes discretos, radios de 6–12 px, sin efectos neón. Una entrada corta del editor, respuestas al hover y movimiento reducido respetado.
- Interacciones: controles nativos, foco visible, navegación móvil desplegable, FAQ con details, arrastrar archivo y mensajes de error recuperables.
- Imagen de estudio de Unsplash utilizada como fotografía ilustrativa, no como resultado de un cliente. Tipografía: Manrope, Google Fonts (SIL Open Font License).

## Portada premium con parallax

A petición del usuario, la apertura muestra una fotografía de una creadora grabando un podcast y una composición de recortes verticales ilustrativos. La imagen procede de Pexels (foto 6953867) y no representa una clienta ni un resultado real. El editor funcional queda en su propia sección bajo la portada.

Capas con profundidad mediante desplazamiento y puntero; sin bucle continuo. Comparador original/clips con botones accesibles. Pausa manual y desactivación automática con prefers-reduced-motion. El movimiento no altera la lectura ni el desplazamiento natural de la página.

## Preferencia confirmada del usuario

Preservar la portada premium con fotografía, parallax y composición de clips, también en los HTML de demostración. El editor debe compartir ese sistema visual. La interfaz habla de subir, elegir un fragmento, personalizar y descargar. No mostrar umbrales de tamaño, códecs, motores, benchmarks ni rutas de compatibilidad como copy de producto. Conservar detalles de ingeniería en documentación; mostrar en errores únicamente el problema y una acción de recuperación útil.

## Controles de creación preservados

Encuadre: vertical 9:16, cuadrado 1:1, horizontal 16:9. Duración: 15–30, 30–60, 40–90 segundos. Subtítulos opcionales, cantidad de clips según plan y sección Mis creaciones con descarga/eliminación. Conservar el diseño y el parallax al ampliar estas funciones.

## Bienvenida y estudio según sesión

Preferencia confirmada: el diseño oscuro premium, la composición con parallax, el editor y Mis creaciones pertenecen al usuario con sesión. La bienvenida pública mantiene una composición propia para presentar la herramienta, con titular centrado, fotografía amplia, explicación interactiva de tres pasos, beneficios y planes. Comparte con el estudio el fondo carbón, los acentos lima, Manrope, los bordes discretos, los radios y los botones. No introducir una paleta clara diferente al cerrar sesión.

El estado de sesión controla la navegación y la visibilidad; al salir se ocultan editor e historial. El selector «Bienvenida / Estudio» existe exclusivamente en el HTML de revisión, separado de la interfaz de producción; nunca equivale a iniciar sesión con Google.

Preferencia confirmada: bienvenida y estudio deben compartir estilo y colores; la sesión cambia el contenido y las funciones, no la identidad visual.
