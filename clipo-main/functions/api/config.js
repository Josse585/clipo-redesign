// Entrega a la página los datos PÚBLICOS de configuración (nunca secretos).
import { PLANS, CHUNK_SECONDS, json } from '../_lib/shared.js';

export async function onRequestGet({ env }) {
  return json({
    brand: env.BRAND_NAME || 'CortaClips',
    supportEmail: env.SUPPORT_EMAIL || '',
    supabaseUrl: env.SUPABASE_URL || '',
    supabaseAnonKey: env.SUPABASE_ANON_KEY || '',
    paypalClientId: env.PAYPAL_CLIENT_ID || '',
    paypalPlanIds: { pro: env.PAYPAL_PLAN_PRO || '' },
    plans: PLANS,
    chunkSeconds: CHUNK_SECONDS,
  });
}
