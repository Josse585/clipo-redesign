// Devuelve el plan del usuario y cuántos minutos le quedan hoy.
import { getUser, getStatus, json } from '../_lib/shared.js';

export async function onRequestGet({ request, env }) {
  const user = await getUser(request, env);
  if (!user) return json({ error: 'Inicia sesión para continuar.' }, 401);

  const s = await getStatus(env, user.id, user.email);
  return json({
    email: user.email,
    plan: s.planKey,
    planInfo: s.plan,
    usedSeconds: s.usedSeconds,
    limitSeconds: s.limitSeconds,
    remainingSeconds: s.limitSeconds == null ? null : Math.max(0, s.limitSeconds - s.usedSeconds),
  });
}
