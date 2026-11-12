// Elimina un clip propio del historial y del almacenamiento privado.
import { getUser, json } from '../../_lib/shared.js';

function headers(env, extra = {}) {
  const key = env.SUPABASE_SERVICE_KEY || '';
  const h = { apikey: key, 'Content-Type': 'application/json', ...extra };
  if (!key.startsWith('sb_')) h.Authorization = `Bearer ${key}`;
  return h;
}
export async function onRequestDelete({ request, env, params }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Inicia sesión.' }, 401);
  const id = String(params.id || '');
  const query = `/rest/v1/clips?id=eq.${encodeURIComponent(id)}&user_id=eq.${user.id}&select=storage_path`;
  const found = await fetch(env.SUPABASE_URL + query, { headers: headers(env) });
  if (!found.ok) return json({ error: 'No pude localizar el clip.' }, 500);
  const rows = await found.json();
  if (!rows.length) return json({ error: 'El clip ya no existe.' }, 404);
  const path = rows[0].storage_path.split('/').map(encodeURIComponent).join('/');
  const removed = await fetch(`${env.SUPABASE_URL}/storage/v1/object/clipo-videos/${path}`, { method: 'DELETE', headers: headers(env) });
  if (!removed.ok) return json({ error: 'No pude borrar el archivo de video.' }, 502);
  const deleted = await fetch(env.SUPABASE_URL + query.replace('&select=storage_path', ''), { method: 'DELETE', headers: headers(env) });
  if (!deleted.ok) return json({ error: 'El video se borró, pero no pude actualizar el historial.' }, 500);
  return json({ success: true });
}
