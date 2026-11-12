// Utilidades compartidas por todas las funciones del servidor (Cloudflare Pages Functions).
// Aquí viven los PLANES: es la ÚNICA fuente de verdad de límites y precios.
// Si cambias un número aquí, la página lo muestra automáticamente.

export const PLANS = {
  free: {
    name: 'Gratis', priceUSD: 0,
    minutesPerDay: 30,
    maxVideoMinutes: 30,
    maxClips: 3,
    watermark: true,
    width: 720, height: 1280,
    qualityLabel: '720p con marca de agua',
  },
  pro: {
    name: 'Pro', priceUSD: 28,
    // null significa sin límite comercial del plan; siguen aplicando límites técnicos del servicio.
    minutesPerDay: null, maxVideoMinutes: null, maxClips: null,
    watermark: false, width: 1080, height: 1920,
    qualityLabel: '1080p sin marca de agua',
  },
};

// El audio se envía en trozos de este tamaño (segundos). 240 s = unos 7.7 MB en WAV 16 kHz mono.
// Si Cloudflare se queja de "CPU time exceeded", baja este número (ej. 180).
export const CHUNK_SECONDS = 240;
export const MAX_UPLOAD_BYTES = 24 * 1024 * 1024; // Groq gratis admite hasta 25 MB por archivo
export const WAV_BYTES_PER_SECOND = 32000;        // 16 kHz * 2 bytes * 1 canal
export const WAV_HEADER_BYTES = 44;

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function serviceHeaders(env, extra = {}) {
  const key = env.SUPABASE_SERVICE_KEY || '';
  const headers = { apikey: key, 'Content-Type': 'application/json', ...extra };
  // Las claves antiguas (service_role) son JWT y van también en Authorization.
  // Las claves nuevas de Supabase ("sb_secret_...") solo van en el encabezado apikey.
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

// Devuelve el usuario dueño del token de sesión, o null.
export async function getUser(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const user = await r.json();
  return user && user.id ? user : null;
}

export async function rpc(env, fn, args) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: serviceHeaders(env),
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`Supabase rpc ${fn} falló (${r.status})`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

// Plan actual + segundos usados hoy (el día se reinicia a medianoche de Bolivia, ver schema.sql).
export async function getStatus(env, userId, userEmail = '') {
  const rows = await rpc(env, 'user_status', { p_user: userId });
  const row = Array.isArray(rows) ? rows[0] : rows;
  // Acceso Pro permanente para la cuenta administradora configurada en Cloudflare.
  // Se valida en el servidor con el correo devuelto por Supabase Auth, nunca desde el navegador.
  const adminEmail = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  const isAdmin = Boolean(adminEmail && String(userEmail || '').trim().toLowerCase() === adminEmail);
  const planKey = isAdmin ? 'pro' : (row && PLANS[row.plan] ? row.plan : 'free');
  const plan = PLANS[planKey];
  return {
    planKey,
    plan,
    usedSeconds: (row && row.seconds_today) || 0,
    limitSeconds: plan.minutesPerDay == null ? null : plan.minutesPerDay * 60,
  };
}

export async function setPlan(env, userId, planKey, subscriptionId) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
    method: 'POST',
    headers: serviceHeaders(env, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ id: userId, plan: planKey, paypal_subscription_id: subscriptionId || null }),
  });
  if (!r.ok) throw new Error(`No se pudo guardar el plan (${r.status})`);
}

export async function downgradeBySubscription(env, subscriptionId) {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profiles?paypal_subscription_id=eq.${encodeURIComponent(subscriptionId)}`,
    {
      method: 'PATCH',
      headers: serviceHeaders(env, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ plan: 'free' }),
    }
  );
  if (!r.ok) throw new Error(`No se pudo bajar el plan (${r.status})`);
}

// ---------- PayPal ----------
export function paypalBase(env) {
  return env.PAYPAL_ENV === 'sandbox' ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
}

export async function paypalToken(env) {
  const r = await fetch(`${paypalBase(env)}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!r.ok) throw new Error(`PayPal rechazó las credenciales (${r.status})`);
  return (await r.json()).access_token;
}

export function planFromPaypalPlanId(env, paypalPlanId) {
  if (!paypalPlanId) return null;
  if (paypalPlanId === env.PAYPAL_PLAN_PRO) return 'pro';
  return null;
}
