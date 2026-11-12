// PayPal avisa aquí cuando una suscripción se activa, se cancela, vence o se suspende por falta de pago.
// Verificamos la firma con PayPal para que nadie pueda inventar avisos falsos.
import {
  setPlan, downgradeBySubscription, paypalBase, paypalToken, planFromPaypalPlanId, json,
} from '../_lib/shared.js';

export async function onRequestPost({ request, env }) {
  let event;
  try { event = JSON.parse(await request.text()); } catch { return json({ error: 'JSON inválido.' }, 400); }

  const h = request.headers;
  const token = await paypalToken(env);
  const verify = await fetch(`${paypalBase(env)}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo: h.get('paypal-auth-algo'),
      cert_url: h.get('paypal-cert-url'),
      transmission_id: h.get('paypal-transmission-id'),
      transmission_sig: h.get('paypal-transmission-sig'),
      transmission_time: h.get('paypal-transmission-time'),
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: event,
    }),
  });
  const verdict = verify.ok ? await verify.json() : null;
  if (!verdict || verdict.verification_status !== 'SUCCESS') return json({ error: 'Firma inválida.' }, 400);

  const sub = event.resource || {};
  switch (event.event_type) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
    case 'BILLING.SUBSCRIPTION.RE-ACTIVATED': {
      const planKey = planFromPaypalPlanId(env, sub.plan_id);
      if (planKey && sub.custom_id) await setPlan(env, sub.custom_id, planKey, sub.id);
      break;
    }
    case 'BILLING.SUBSCRIPTION.CANCELLED':
    case 'BILLING.SUBSCRIPTION.EXPIRED':
    case 'BILLING.SUBSCRIPTION.SUSPENDED':
      if (sub.id) await downgradeBySubscription(env, sub.id);
      break;
    default:
      break; // otros eventos no nos interesan
  }
  return json({ ok: true });
}
