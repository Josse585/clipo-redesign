import {readFile,writeFile} from 'node:fs/promises';
import {PLANS} from '../functions/_lib/shared.js';
const root=new URL('../',import.meta.url);
export async function studioPage(){
 let html=await readFile(new URL('public/index.html',root),'utf8');
 let hero=await readFile(new URL('scripts/templates/member-premium-hero.html',root),'utf8');
 hero=hero.replaceAll('#studioEditor','#preview').replaceAll('#history','#myCreations');
 const studio=await readFile(new URL('scripts/studio-markup.html',root),'utf8');
 const a=html.indexOf('<section id="viewApp"'),b=html.indexOf('<section id="plans"',a);
 html=html.slice(0,a)+`<section id="viewApp" hidden>${hero}<script type="application/json" id="studioPlan">${JSON.stringify(PLANS.free)}</script>${studio}</section>`+html.slice(b);
 html=html.replaceAll('#studioEditor','#preview').replaceAll('#history','#myCreations');
 html=html.replace('href="/" id="brand"','href="#main" id="brand"');
 const plans=Object.entries(PLANS).map(([key,p])=>`<article class="plan${key==='pro'?' featured':''}"><h3>${p.name}</h3><div class="price">${p.priceUSD?'$'+p.priceUSD:'Gratis'}${p.priceUSD?' <small>/ mes</small>':''}</div><ul><li>${p.minutesPerDay==null?'Procesamiento sin límite de plan':p.minutesPerDay+' min de video al día'}</li><li>${p.maxVideoMinutes==null?'Videos sin límite de duración por plan':'Videos de hasta '+p.maxVideoMinutes+' min'}</li><li>${p.maxClips==null?'Clips sin límite':'Hasta '+p.maxClips+' clips por video'}</li><li>${p.qualityLabel}</li></ul><div class="plan-action"><a class="btn ${key==='pro'?'primary':'ghost'}" ${key==='free'?'id="previewFreePlan"':''} style="width:100%" href="${key==='pro'?'#proDetails':'#googleSignIn'}">${key==='pro'?'Conocer el plan Pro':'Empezar gratis'}</a></div></article>`).join('');
 html=html.replace('<p class="muted">Cargando planes…</p>',plans);
 html=html.replace('<div class="faq-list">','<div class="faq-list"><details id="proDetails"><summary>¿Qué incluye el plan Pro?</summary><p>El plan Pro cuesta 28 USD al mes e incluye clips en 1080p sin marca de agua y sin límite de minutos o cantidad de clips del plan. Puedes cancelar la suscripción desde PayPal.</p></details>');
 html=html.replace('<script type="module" src="brand-interactions.js"></script><script type="module" src="app.js"></script>','<script type="module" src="studio-entry.js"></script>');
 const controls='<aside class="preview-views" aria-label="Vistas del diseño"><span>Vista previa</span><div role="group" aria-label="Elegir vista"><button type="button" data-preview-view="welcome" aria-pressed="true">Bienvenida</button><button type="button" data-preview-view="studio" aria-pressed="false">Estudio</button></div></aside>';
 html=html.replace('</body>',controls+'</body>');
 return html;
}
if(process.argv[1]===new URL(import.meta.url).pathname)await writeFile(new URL('public/prueba-exportacion.html',root),await studioPage());
