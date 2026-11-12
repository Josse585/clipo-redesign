// Pruebas automáticas de la lógica (se ejecutan con: node tests/run.mjs)
// Cubren: elección de clips, subtítulos, WAV, y las funciones del servidor con servicios simulados.
import assert from 'node:assert/strict';
import { pickClips, buildCaptions, fallbackWords, scoreText } from '../public/lib/clipper.js';
import { encodeWav, splitIntoChunks, SAMPLE_RATE } from '../public/lib/audio.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log('  ok  ', name); }
  catch (e) { console.error('  FALLÓ', name, '\n', e); process.exitCode = 1; }
}

// ---------- datos de prueba ----------
const segments = [];
for (let i = 0; i < 60; i += 1) {
  const gancho = i % 12 === 3;
  segments.push({
    start: i * 5, end: i * 5 + 4.8,
    text: gancho ? '¿Sabes cuál es el secreto que nadie te cuenta? Más de 3 errores comunes.' : 'Y entonces bueno pues seguimos hablando de cosas normales del día.',
  });
}

console.log('Lógica de clips');
await test('scoreText premia preguntas y ganchos', () => {
  assert.ok(scoreText('¿Cuál es el secreto que nadie te cuenta?', 10) > scoreText('hola buenas tardes a todos', 10));
});
await test('pickClips devuelve clips sin solaparse y dentro del rango', () => {
  const clips = pickClips(segments, { count: 5, minLen: 20, maxLen: 45, videoDuration: 300 });
  assert.equal(clips.length, 5);
  for (const c of clips) { assert.ok(c.end - c.start >= 19 && c.end - c.start <= 46, `duración ${c.end - c.start}`); assert.ok(c.end <= 300); }
  const sorted = [...clips].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i += 1) assert.ok(sorted[i].start >= sorted[i - 1].end, 'se solapan');
});
await test('pickClips prefiere zonas con ganchos', () => {
  const [best] = pickClips(segments, { count: 1, minLen: 20, maxLen: 30 });
  assert.ok(/secreto/.test(best.text));
});
await test('pickClips funciona con un video muy corto', () => {
  const clips = pickClips([{ start: 0, end: 6, text: 'Hola, esto es una prueba corta.' }], { count: 3 });
  assert.equal(clips.length, 1);
  assert.equal(clips[0].start, 0);
});
await test('pickClips con lista vacía no revienta', () => assert.deepEqual(pickClips([], {}), []));

console.log('Subtítulos');
const words = fallbackWords([{ start: 10, end: 14, text: 'uno dos tres cuatro cinco seis siete' }]);
await test('fallbackWords reparte tiempos', () => {
  assert.equal(words.length, 7);
  assert.ok(Math.abs(words[6].end - 14) < 1e-9);
});
await test('buildCaptions agrupa de a 3 y ordena sin huecos negativos', () => {
  const caps = buildCaptions(words, 10, 14, 3);
  assert.equal(caps.length, 3);
  assert.equal(caps[0].words.length, 3);
  for (let i = 0; i < caps.length; i += 1) assert.ok(caps[i].end > caps[i].start);
  for (let i = 1; i < caps.length; i += 1) assert.ok(caps[i].start >= caps[i - 1].end - 1e-9);
});
await test('buildCaptions ignora palabras fuera del clip', () => {
  const caps = buildCaptions(words, 11.5, 12.6, 3);
  const all = caps.flatMap((c) => c.words.map((w) => w.text));
  assert.ok(all.length >= 1 && all.length < 7);
});

console.log('Audio');
await test('encodeWav produce un WAV válido de 16 kHz mono', async () => {
  const blob = encodeWav(new Float32Array(SAMPLE_RATE * 2));
  const view = new DataView(await blob.arrayBuffer());
  assert.equal(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)), 'RIFF');
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(blob.size, 44 + SAMPLE_RATE * 2 * 2);
});
await test('splitIntoChunks respeta el tamaño y los tiempos de inicio', () => {
  const chunks = splitIntoChunks(new Float32Array(SAMPLE_RATE * 500), 240);
  assert.deepEqual(chunks.map((c) => c.offset), [0, 240, 480]);
  assert.equal(chunks[0].blob.size, 44 + 240 * SAMPLE_RATE * 2);
});

// ---------- servidor con servicios simulados ----------
console.log('Servidor');
const shared = await import('../functions/_lib/shared.js');
const { onRequestPost: transcribe } = await import('../functions/api/transcribe.js');
const { onRequestPost: confirm } = await import('../functions/api/paypal-confirm.js');
const { onRequestPost: webhook } = await import('../functions/api/paypal-webhook.js');
const { onRequestGet: status } = await import('../functions/api/status.js');
const { onRequestGet: config } = await import('../functions/api/config.js');

const env = {
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'SERVICE_SECRET_VALUE', SUPABASE_ANON_KEY: 'anon',
  GROQ_API_KEY: 'GROQ_SECRET_VALUE', PAYPAL_CLIENT_ID: 'cid', PAYPAL_SECRET: 'PAYPAL_SECRET_VALUE', PAYPAL_WEBHOOK_ID: 'wh',
  PAYPAL_PLAN_PRO: 'P-PRO', ADMIN_EMAIL: 'alemaniadinero@gmail.com',
};

// base de datos y servicios falsos
let db;
const calls = [];
function resetDb() { db = { plan: 'free', used: 0, subId: null, usageAdded: 0 }; calls.length = 0; }
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  calls.push({ url, init });
  const j = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.endsWith('/auth/v1/user')) {
    return init.headers.Authorization === 'Bearer good-token' ? j({ id: 'user-1', email: 'a@b.com' }) : init.headers.Authorization === 'Bearer admin-token' ? j({ id: 'admin-1', email: 'alemaniadinero@gmail.com' }) : j({}, 401);
  }
  if (url.includes('/rpc/user_status')) return j([{ plan: db.plan, seconds_today: db.used }]);
  if (url.includes('/rpc/add_usage')) { const b = JSON.parse(init.body); db.used += b.p_seconds; db.usageAdded += b.p_seconds; return j(db.used); }
  if (url.includes('/rest/v1/profiles') && init.method === 'POST') { const b = JSON.parse(init.body); db.plan = b.plan; db.subId = b.paypal_subscription_id; return new Response(null, { status: 201 }); }
  if (url.includes('/rest/v1/profiles') && init.method === 'PATCH') { db.plan = JSON.parse(init.body).plan; return new Response(null, { status: 204 }); }
  if (url.includes('api.groq.com')) {
    assert.ok(init.body instanceof FormData);
    assert.equal(init.body.get('model'), 'whisper-large-v3-turbo');
    assert.equal(init.headers.Authorization, 'Bearer GROQ_SECRET_VALUE');
    return globalThis.__groq ? globalThis.__groq() : j({ duration: 4, segments: [{ start: 0, end: 4, text: 'hola' }], words: [{ word: 'hola', start: 0, end: 1 }] });
  }
  if (url.endsWith('/v1/oauth2/token')) return j({ access_token: 'pp-token' });
  if (url.includes('/v1/billing/subscriptions/')) return j(globalThis.__sub);
  if (url.endsWith('/v1/notifications/verify-webhook-signature')) return j({ verification_status: globalThis.__verify || 'SUCCESS' });
  throw new Error(`fetch inesperado: ${url}`);
};

function wavRequest(seconds, token = 'good-token', query = '?lang=es') {
  const bytes = 44 + seconds * 32000;
  return new Request(`https://site.test/api/transcribe${query}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'audio/wav' }, body: new Uint8Array(bytes),
  });
}

await test('config no filtra secretos', async () => {
  const body = await (await config({ env })).text();
  for (const secret of ['SERVICE_SECRET_VALUE', 'GROQ_SECRET_VALUE', 'PAYPAL_SECRET_VALUE']) assert.ok(!body.includes(secret), secret);
  assert.ok(body.includes('P-PRO') && body.includes('anon'));
  assert.ok(!body.includes('basic'));
  assert.ok(body.includes('720p'));
  assert.ok(body.includes('28')); 
});
await test('transcribe rechaza sin sesión', async () => {
  resetDb();
  const r = await transcribe({ request: wavRequest(10, 'malo'), env });
  assert.equal(r.status, 401);
  assert.equal(db.usageAdded, 0);
});
await test('transcribe funciona y descuenta los segundos exactos', async () => {
  resetDb();
  const r = await transcribe({ request: wavRequest(240), env });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).segments[0].text, 'hola');
  assert.equal(db.usageAdded, 240);
});
await test('transcribe bloquea al pasar el límite diario del plan gratis (30 min)', async () => {
  resetDb(); db.used = 1700;
  const r = await transcribe({ request: wavRequest(240), env });
  assert.equal(r.status, 429);
  assert.equal((await r.json()).code, 'limit');
  assert.equal(db.usageAdded, 0);
});
await test('Pro no tiene límite diario comercial de transcripción', async () => {
  resetDb(); db.plan = 'pro'; db.used = 999999;
  const r = await transcribe({ request: wavRequest(240), env });
  assert.equal(r.status, 200);
});
await test('transcribe no cobra si Groq está saturado', async () => {
  resetDb();
  globalThis.__groq = () => new Response('{}', { status: 429 });
  const r = await transcribe({ request: wavRequest(60), env });
  globalThis.__groq = null;
  assert.equal(r.status, 429);
  assert.equal((await r.json()).code, 'busy');
  assert.equal(db.usageAdded, 0);
});
await test('transcribe rechaza archivos gigantes', async () => {
  resetDb();
  const r = await transcribe({ request: wavRequest(900), env });
  assert.equal(r.status, 413);
});
await test('status informa minutos restantes', async () => {
  resetDb(); db.used = 600;
  const req = new Request('https://site.test/api/status', { headers: { Authorization: 'Bearer good-token' } });
  const body = await (await status({ request: req, env })).json();
  assert.equal(body.remainingSeconds, 1200);
  assert.equal(body.plan, 'free');
});
await test('la cuenta ADMIN_EMAIL recibe Pro permanente aunque la base indique gratis', async () => {
  resetDb();
  const req = new Request('https://site.test/api/status', { headers: { Authorization: 'Bearer admin-token' } });
  const body = await (await status({ request: req, env })).json();
  assert.equal(body.plan, 'pro');
  assert.equal(body.planInfo.maxClips, null);
  assert.equal(body.planInfo.width, 1080);
  assert.equal(body.limitSeconds, null);
});
await test('otros usuarios no reciben Pro por la configuración de administrador', async () => {
  resetDb();
  const req = new Request('https://site.test/api/status', { headers: { Authorization: 'Bearer good-token' } });
  const body = await (await status({ request: req, env })).json();
  assert.equal(body.plan, 'free');
});
await test('paypal-confirm activa el plan si PayPal confirma la suscripción', async () => {
  resetDb();
  globalThis.__sub = { status: 'ACTIVE', custom_id: 'user-1', plan_id: 'P-PRO' };
  const req = new Request('https://site.test/api/paypal-confirm', { method: 'POST', headers: { Authorization: 'Bearer good-token' }, body: JSON.stringify({ subscriptionId: 'I-ABC12345' }) });
  const r = await confirm({ request: req, env });
  assert.equal(r.status, 200);
  assert.equal(db.plan, 'pro');
  assert.equal(db.subId, 'I-ABC12345');
});
await test('paypal-confirm rechaza suscripciones de otro usuario', async () => {
  resetDb();
  globalThis.__sub = { status: 'ACTIVE', custom_id: 'otro', plan_id: 'P-PRO' };
  const req = new Request('https://site.test/api/paypal-confirm', { method: 'POST', headers: { Authorization: 'Bearer good-token' }, body: JSON.stringify({ subscriptionId: 'I-ABC12345' }) });
  assert.equal((await confirm({ request: req, env })).status, 403);
  assert.equal(db.plan, 'free');
});
await test('paypal-confirm pide esperar si aún no está activa', async () => {
  resetDb();
  globalThis.__sub = { status: 'APPROVAL_PENDING', custom_id: 'user-1', plan_id: 'P-PRO' };
  const req = new Request('https://site.test/api/paypal-confirm', { method: 'POST', headers: { Authorization: 'Bearer good-token' }, body: JSON.stringify({ subscriptionId: 'I-ABC12345' }) });
  assert.equal((await confirm({ request: req, env })).status, 409);
});
function hook(eventType, resource) {
  return new Request('https://site.test/api/paypal-webhook', {
    method: 'POST',
    headers: { 'paypal-auth-algo': 'a', 'paypal-cert-url': 'c', 'paypal-transmission-id': 'i', 'paypal-transmission-sig': 's', 'paypal-transmission-time': 't' },
    body: JSON.stringify({ event_type: eventType, resource }),
  });
}
await test('webhook activa y cancela Pro', async () => {
  resetDb();
  assert.equal((await webhook({ request: hook('BILLING.SUBSCRIPTION.ACTIVATED', { id: 'I-1', custom_id: 'user-1', plan_id: 'P-PRO' }), env })).status, 200);
  assert.equal(db.plan, 'pro');
  assert.equal((await webhook({ request: hook('BILLING.SUBSCRIPTION.CANCELLED', { id: 'I-1' }), env })).status, 200);
  assert.equal(db.plan, 'free');
});
await test('webhook con firma inválida se rechaza y no cambia nada', async () => {
  resetDb(); globalThis.__verify = 'FAILURE';
  const r = await webhook({ request: hook('BILLING.SUBSCRIPTION.ACTIVATED', { id: 'I-1', custom_id: 'user-1', plan_id: 'P-PRO' }), env });
  globalThis.__verify = null;
  assert.equal(r.status, 400);
  assert.equal(db.plan, 'free');
});

globalThis.fetch = realFetch;
console.log(`\n${passed} pruebas correctas${process.exitCode ? ' (hay fallos arriba)' : ''}`);
