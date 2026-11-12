# Publicar esta entrega

## Proyecto existente

1. Extrae el ZIP en una carpeta nueva y ejecuta `node scripts/verify-release.mjs`.
2. Copia su contenido al repositorio conectado a tu proyecto de Cloudflare Pages. `public/` y `functions/` deben estar en la raíz del repositorio.
3. Usa directorio de salida `public`, sin comando de compilación.
4. Conserva las variables de producción y la base de datos existentes. Esta entrega no exige una migración de tablas.
5. Despliega y comprueba `/version.json`: debe indicar `clipo-20261112-r1`.
6. Revisa `/` como visitante y luego el acceso Google y el estudio con tu cuenta. El editor y el historial no aparecen para visitantes.

`public/prueba-webcodecs.html` es la revisión manual local del diseño y motor, no la página de producción ni un sustituto de las cuentas. `/` utiliza `public/index.html`.

## Variables usadas por el código

| Variable | Uso |
|---|---|
| `SUPABASE_URL` | Proyecto Supabase |
| `SUPABASE_ANON_KEY` | Clave pública para el cliente |
| `SUPABASE_SERVICE_KEY` | Clave privada, exclusivamente en las funciones |
| `GROQ_API_KEY` | Clave privada de transcripción |
| `PAYPAL_CLIENT_ID` | Identificador del cliente PayPal |
| `PAYPAL_SECRET` | Secreto privado de PayPal |
| `PAYPAL_PLAN_PRO` | Plan de suscripción Pro |
| `PAYPAL_WEBHOOK_ID` | Verificación del webhook |
| `PAYPAL_ENV` | `sandbox` para probar o `live` para el entorno real |
| `ADMIN_EMAIL` | Opcional: acceso Pro administrativo según el código existente |
| `SUPPORT_EMAIL` | Opcional: contacto visible |
| `BRAND_NAME` | Opcional: configuración pública de marca; la identidad visual de esta entrega es DRIX CLIP |

Introduce secretos en los ajustes de Cloudflare; no los copies a `public/`, al HTML, al repositorio ni al chat.

## Configuración de servicios

Si Google ya funciona en tu despliegue, conserva esa configuración. En un proyecto nuevo debes habilitar el proveedor Google en Supabase y configurar las URL de sitio/redirección para el dominio publicado. El callback autorizado de Google es el callback del proyecto Supabase (`https://TU-PROYECTO.supabase.co/auth/v1/callback`). El código utiliza Google OAuth, no un formulario de correo y contraseña.

Los esquemas originales están en `supabase/schema.sql` y `supabase/clips.sql`. Para una instalación nueva, crea los recursos y las tareas de retención que esos archivos definen. El historial usa el bucket privado `clipo-videos`; conserva su privacidad y verifica los límites de almacenamiento/tamaño configurados en tu cuenta. No se han cambiado estos servicios ni sus cuotas.

La transcripción requiere Groq y los cobros requieren un plan PayPal válido. El webhook sigue en `/api/paypal-webhook`. Configura estos servicios en sus entornos correspondientes; la prueba de exportación HTML no los consume.

## Comprobación posterior al despliegue

Confirma la versión en `/version.json`; la bienvenida y el estudio comparten los colores aprobados. Comprueba acceso/salida, límites del plan, un video con voz, formatos de descarga, subtítulos y guardado/eliminación del historial. Verifica los pagos en el entorno de pruebas de PayPal antes de habilitarlos para clientes. Estas comprobaciones con credenciales reales no se sustituyen por las pruebas locales de esta entrega.
