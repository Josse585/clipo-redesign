// Recibe un trozo de audio (WAV 16 kHz mono), comprueba el límite diario del usuario,
// lo transcribe con Groq (Whisper) y descuenta los minutos usados.
// La clave de Groq vive solo aquí, en el servidor: el navegador nunca la ve.
import {
  getUser, getStatus, rpc, json,
  MAX_UPLOAD_BYTES, WAV_BYTES_PER_SECOND, WAV_HEADER_BYTES,
} from '../_lib/shared.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_MODEL = 'whisper-large-v3-turbo';

function secondsFromBytes(bytes) {
  return Math.max(1, Math.ceil((bytes - WAV_HEADER_BYTES) / WAV_BYTES_PER_SECOND));
}

export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Inicia sesión para continuar.' }, 401);
  if (!env.GROQ_API_KEY) return json({ error: 'El servidor no tiene configurada la clave de transcripción.' }, 500);

  const tooBig = () => json({ error: 'El fragmento de audio es demasiado grande.' }, 413);
  const overLimit = () => json({
    error: 'Llegaste al límite diario de tu plan. Vuelve mañana o mejora tu plan.',
    code: 'limit',
  }, 429);

  // Primer filtro barato: si el navegador declara el tamaño, rechazamos antes de leer nada.
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_UPLOAD_BYTES) return tooBig();

  const status = await getStatus(env, user.id, user.email);
  if (status.limitSeconds != null && declared && status.usedSeconds + secondsFromBytes(declared) > status.limitSeconds + 2) return overLimit();

  const audio = await request.arrayBuffer();
  if (!audio.byteLength) return json({ error: 'Falta el audio.' }, 400);
  if (audio.byteLength > MAX_UPLOAD_BYTES) return tooBig();

  // Segundos reales según el tamaño leído (un WAV 16 kHz mono mide exactamente 32 000 bytes por segundo).
  const seconds = secondsFromBytes(audio.byteLength);
  if (status.limitSeconds != null && status.usedSeconds + seconds > status.limitSeconds + 2) return overLimit();

  const lang = new URL(request.url).searchParams.get('lang') || '';
  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', GROQ_MODEL);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');
  form.append('temperature', '0');
  if (/^[a-z]{2}$/.test(lang)) form.append('language', lang);

  let groq;
  try {
    groq = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` },
      body: form,
    });
  } catch (e) {
    return json({ error: 'No pude conectar con el servicio de transcripción. Intenta de nuevo.' }, 502);
  }

  if (!groq.ok) {
    if (groq.status === 429) {
      return json({
        error: 'El servicio de transcripción está saturado ahora mismo. Espera unos minutos e inténtalo otra vez.',
        code: 'busy',
      }, 429);
    }
    return json({ error: `La transcripción falló (${groq.status}). Intenta con otro video.` }, 502);
  }

  const body = await groq.text(); // se devuelve tal cual: no hace falta procesarlo en el servidor
  await rpc(env, 'add_usage', { p_user: user.id, p_seconds: seconds });

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
