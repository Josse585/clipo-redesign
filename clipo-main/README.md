# CortaClips — guía de instalación (todo en planes gratuitos)

CortaClips es una página web donde el cliente sube un video largo y recibe clips verticales con subtítulos
para TikTok, Reels y Shorts. Tiene cuentas de usuario, un límite diario de minutos por plan y suscripciones
mensuales con PayPal.

**Cómo está armado (para que sepas qué es cada cosa)**

| Pieza | Para qué sirve | Costo |
|---|---|---|
| Cloudflare Pages | Aloja la página y las funciones del servidor. Su plan gratis permite uso comercial. | $0 |
| Supabase | Cuentas de usuario, planes y minutos usados. | $0 |
| Groq | Convierte el audio en texto (Whisper). | $0 con tope diario |
| PayPal Suscripciones | Cobra la mensualidad y avisa a la página. | Comisión por venta |
| El navegador del cliente | Saca el audio y graba los clips. Tu servidor no procesa video. | $0 |

**Límites reales que debes conocer**

- **Groq gratis permite unas 8 horas de audio por día en total, para TODOS tus usuarios juntos** (y unas 2 horas por hora). Con el plan gratis de 30 min por usuario, alcanza para ~16 usuarios gratis al día usando todo su cupo. Cuando llegues a ese tope, la página avisa "servicio saturado, intenta en unos minutos". Pasar a Groq de pago cuesta aproximadamente 0,04 USD por hora de audio, una fracción de lo que cobras, así que será lo primero que pagues con tus ingresos.
- Cloudflare Pages Functions gratis: 100 000 solicitudes por día y 10 ms de CPU por solicitud. Cada trozo de audio de 4 minutos es una solicitud. Si Cloudflare muestra errores de "CPU", baja `CHUNK_SECONDS` en `functions/_lib/shared.js` (por ejemplo a 180).
- **Vercel NO sirve para esto**: su plan gratis prohíbe proyectos comerciales. Por eso uso Cloudflare.
- Los clips se graban **en tiempo real** en el navegador del cliente (un clip de 40 s tarda unos 40 s) y la pestaña debe seguir visible. Funciona mejor en Chrome o Edge en computadora.
- El audio se sube en formato WAV sin comprimir (unos 2 MB por minuto). Un video de 30 min sube ~58 MB de audio. Es lo que mantiene el sistema simple y gratis; comprimirlo es una mejora futura.

---

## Paso 1 · Crea las cuentas gratis

1. **GitHub** — https://github.com
2. **Cloudflare** — https://dash.cloudflare.com/sign-up
3. **Supabase** — https://supabase.com
4. **Groq** — https://console.groq.com
5. Tu **PayPal** (ya lo tienes). Para cobrar suscripciones necesita ser cuenta **Business**; PayPal te deja cambiarla desde la configuración de tu cuenta.

## Paso 2 · Supabase (usuarios y planes)

1. Crea un proyecto nuevo (elige una región cercana, por ejemplo São Paulo).
2. Menú **SQL Editor → New query**. Abre el archivo `supabase/schema.sql`, copia TODO su contenido, pégalo y pulsa **Run**. Debe decir "Success".
3. Menú **Authentication → Providers → Email**: **desactiva "Confirm email"**. Supabase gratis envía muy pocos correos por hora y, si lo dejas activo, los registros se atascan.
4. Menú **Project Settings → API** (o **API Keys**). Copia estos tres datos:
   - **Project URL** → será `SUPABASE_URL`
   - **anon / publishable key** → será `SUPABASE_ANON_KEY`
   - **service_role / secret key** → será `SUPABASE_SERVICE_KEY`. **Es secreta: nunca la pegues en la página ni la compartas.**

## Paso 3 · Groq (transcripción)

En https://console.groq.com/keys crea una **API Key** y cópiala. Será `GROQ_API_KEY`.

## Paso 4 · Sube el proyecto a GitHub

1. Crea un repositorio nuevo en GitHub (privado está bien), por ejemplo `cortaclips`.
2. Entra al repositorio → **Add file → Upload files** y arrastra **el contenido** de esta carpeta (las carpetas `public`, `functions`, `supabase`, `tests` y los archivos sueltos). Pulsa **Commit changes**.
   Las carpetas `public` y `functions` deben quedar en la raíz del repositorio.

## Paso 5 · Publica con Cloudflare Pages

1. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git**, y elige tu repositorio.
2. Configuración de compilación:
   - **Framework preset:** None
   - **Build command:** (déjalo vacío)
   - **Build output directory:** `public`
3. Antes de terminar, abre **Environment variables** y agrega (en Producción). Marca como **Secret/Encrypt** las que son secretas:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | La Project URL del paso 2 |
| `SUPABASE_ANON_KEY` | La clave anon/publishable |
| `SUPABASE_SERVICE_KEY` | La clave service_role/secret (secreta) |
| `GROQ_API_KEY` | La clave de Groq (secreta) |
| `BRAND_NAME` | (opcional) El nombre de tu servicio |
| `SUPPORT_EMAIL` | (opcional) Tu correo de soporte, se muestra en el pie |

   Las variables de PayPal las agregas en el paso 7.
4. Pulsa **Save and Deploy**. En un par de minutos tendrás una dirección tipo `https://cortaclips.pages.dev`.
   Si cambias variables después, haz un nuevo despliegue (**Deployments → Retry deployment**) para que se apliquen.

## Paso 6 · Pruébalo gratis

1. Abre tu dirección `.pages.dev`, crea una cuenta y sube un video corto (2–5 minutos) donde se hable claro.
2. Elige "Crear mis clips". Verás: preparación del audio → transcripción → creación de cada clip.
3. Descarga los clips y míralos en tu celular.

Si algo falla, el mensaje en pantalla dice el motivo. Prueba primero en **Chrome en computadora**.

## Paso 7 · Cobros con PayPal (suscripción mensual)

1. En PayPal Business crea **dos planes de suscripción** mensuales en USD: **Pro (28 USD)**.
   Busca la sección de **Suscripciones / Productos y planes** de tu cuenta Business, o créalos desde https://developer.paypal.com. Cada plan tiene un ID que empieza con `P-`. Si no ves la opción de Suscripciones en tu cuenta, PayPal aún no la habilitó para ella: en ese caso avísame y pensamos otra vía de cobro.
2. En https://developer.paypal.com → **Apps & Credentials → Live → Create App**. Copia el **Client ID** y el **Secret**.
3. En esa misma app, sección **Webhooks → Add Webhook**:
   - **URL:** `https://TU-DIRECCION.pages.dev/api/paypal-webhook`
   - **Eventos:** `Billing subscription activated`, `re-activated`, `cancelled`, `expired` y `suspended`.
   - Copia el **Webhook ID** que te muestra.
4. En Cloudflare agrega estas variables y vuelve a desplegar:

| Variable | Valor |
|---|---|
| `PAYPAL_ENV` | `live` (o `sandbox` para probar con dinero falso) |
| `PAYPAL_CLIENT_ID` | Client ID de PayPal |
| `PAYPAL_SECRET` | Secret de PayPal (secreta) |
| `PAYPAL_WEBHOOK_ID` | El Webhook ID |
| `PAYPAL_PLAN_PRO` | ID del plan Pro (`P-...`) |

5. **Prueba antes de abrir al público:** usa `sandbox` con credenciales y planes de prueba, o suscríbete tú mismo al plan Pro y cancélalo enseguida. Comprueba que el plan cambia a Pro al pagar y vuelve a Gratis al cancelar.

**Cómo se comporta:** al pagar, la página confirma la suscripción directamente con PayPal y activa el plan. Si el cliente cancela o PayPal no logra cobrar, el webhook lo regresa al plan Gratis (inmediatamente, sin esperar al fin del período pagado). Solo se ofrece Free y Pro; el cliente puede cancelar desde PayPal.

## Paso 8 · Antes de cobrar a otras personas

- **Tu cuenta de PayPal** se creó con datos de Chile. PayPal puede pedir verificaciones o limitar cuentas cuando algo no cuadra con la identidad o el país real del titular. Retira tus ingresos con regularidad y ten un plan B de cobro.
- **Términos y privacidad:** agrega una página simple de términos de uso y política de privacidad (el cliente sube sus videos y su correo). Ya existe el aviso de "solo videos propios o con permiso", pero conviene tenerlo por escrito.
- **Cuentas repetidas:** el plan gratis se puede repetir creando varias cuentas. Es un riesgo aceptable al inicio. Si se vuelve un problema, se limita por dispositivo o se pide inicio con Google.

## Cambiar precios y límites

Todo está en un solo lugar: `functions/_lib/shared.js`, el bloque `PLANS` (minutos por día, clips, calidad, precio mostrado). Si cambias el precio, cambia también el precio del plan en PayPal: el número de la página es solo informativo.

## Probar la lógica en tu computadora (opcional, requiere Node.js 18+)

```
node tests/run.mjs
```

Ejecuta 23 pruebas de la elección de clips, subtítulos, audio, límites diarios y pagos con servicios simulados.

## Estado de esta primera versión (honestidad técnica)

- Las partes de **servidor, límites, pagos y selección de clips** tienen pruebas automáticas (con servicios simulados).
- La parte que corre **en el navegador** (leer el audio, grabar clips sobre el canvas, botones de PayPal) no se pudo probar en un navegador real durante la construcción. Es normal que el primer despliegue necesite uno o dos ajustes; prueba con un video corto y, si algo falla, copia el mensaje exacto que aparece.
- La elección de "mejores momentos" usa reglas simples (preguntas, frases gancho, cifras, ritmo al hablar). Funciona, pero no es tan inteligente como Opus Clip. Una mejora natural es pedirle a un modelo de lenguaje que puntúe los fragmentos.


## Acceso Pro permanente para la cuenta administradora

En Cloudflare Pages, configura `ADMIN_EMAIL` como variable de entorno de **Production** con el correo exacto de la cuenta administradora. El backend compara ese valor con el correo autenticado que devuelve Supabase Auth y aplica los límites Pro en `/api/status` y en la comprobación de uso de `/api/transcribe`. No se debe incluir el correo en el código del navegador. Tras añadir o cambiar la variable, crea un nuevo despliegue.
