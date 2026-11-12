// Historial de clips del usuario. Los videos viven en un bucket privado de Supabase.
import { getUser, json } from '../_lib/shared.js';

function headers(env, extra = {}) {
  const key = env.SUPABASE_SERVICE_KEY || '';
  const h = { apikey: key, 'Content-Type': 'application/json', ...extra };
  if (!key.startsWith('sb_')) h.Authorization = `Bearer ${key}`;
  return h;
}
async function supabase(env, path, options = {}) {
  const r = await fetch(`${env.SUPABASE_URL}${path}`, { ...options, headers: headers(env, options.headers) });
  const body = await r.text();
  if (!r.ok) throw new Error(`Supabase respondió ${r.status}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Inicia sesión para ver tus creaciones.' }, 401);
  try {
    const rows = await supabase(env, `/rest/v1/clips?user_id=eq.${user.id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,title,snippet,storage_path,created_at,expires_at&order=created_at.desc`);
    const clips = await Promise.all(rows.map(async (clip) => {
      const signed = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/clipo-videos/${clip.storage_path.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST', headers: headers(env), body: JSON.stringify({ expiresIn: 3600 }),
      });
      if (!signed.ok) throw new Error('No se pudo crear el enlace privado del video.');
      const data = await signed.json();
      return { ...clip, url: `${env.SUPABASE_URL}/storage/v1${data.signedURL}` };
    }));
    return json({ clips });
  } catch (e) {
    return json({ error: 'No pude cargar tu historial de creaciones.' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Inicia sesión para guardar tus clips.' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Datos inválidos.' }, 400); }
  const path = String(body.storagePath || '');
  if (!path.startsWith(`${user.id}/`) || path.includes('..') || path.length > 500) return json({ error: 'Ruta de almacenamiento inválida.' }, 400);
  if (!/^[-\w/]+\.(mp4|webm|mov)$/i.test(path)) return json({ error: 'Formato de video no permitido.' }, 400);
  try {
    const rows = await supabase(env, '/rest/v1/clips', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify([{
        user_id: user.id,
        title: String(body.title || 'Mi clip').slice(0, 180),
        snippet: String(body.snippet || '').slice(0, 500),
        storage_path: path,
      }]),
    });
    return json({ clip: rows[0] }, 201);
  } catch (e) {
    return json({ error: 'El video se subió, pero no pude añadirlo al historial.' }, 500);
  }
}
