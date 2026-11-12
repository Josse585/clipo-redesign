// Después de que el cliente aprueba la suscripción en PayPal, la página llama aquí.
// Comprobamos DIRECTAMENTE con PayPal que la suscripción es real y está activa,
// y recién entonces activamos el plan. (El webhook se encarga de renovaciones y cancelaciones.)
import {
  getUser, setPlan, paypalBase, paypalToken, planFromPaypalPlanId, json,
} from '../_lib/shared.js';

export async function onRequestPost({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Inicia sesión para continuar.' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Solicitud inválida.' }, 400); }
  const subscriptionId = String((body && body.subscriptionId) || '');
  if (!/^[A-Za-z0-9-]{5,64}$/.test(subscriptionId)) return json({ error: 'Suscripción inválida.' }, 400);

  const token = await paypalToken(env);
  const r = await fetch(`${paypalBase(env)}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return json({ error: 'PayPal no encontró esa suscripción.' }, 404);
  const sub = await r.json();

  if (sub.custom_id !== user.id) return json({ error: 'Esta suscripción pertenece a otra cuenta.' }, 403);
  if (sub.status !== 'ACTIVE') {
    return json({ error: 'La suscripción aún no está activa. Espera unos segundos.', status: sub.status }, 409);
  }
  const planKey = planFromPaypalPlanId(env, sub.plan_id);
  if (!planKey) return json({ error: 'Ese plan de PayPal no está configurado en el servidor.' }, 400);

  await setPlan(env, user.id, planKey, subscriptionId);
  return json({ ok: true, plan: planKey });
}
