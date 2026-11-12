import { decodeToMono16k } from './lib/audio.js';
import { ClipRenderer, extensionFor } from './lib/render.js';
import { CLIP_LENGTHS } from './lib/clipper.js';
import { OUTPUT_FORMATS, outputDimensions, clipCountChoices, manualClipRanges } from './lib/editor-options.js';
import { saveCreation, listCreations, removeCreation } from './lib/local-creations.js';
const $=id=>document.getElementById(id);
const plan=JSON.parse($('studioPlan').textContent);
let file=null,duration=0,controller=null,resultUrl=null,sourceUrl=null;
const records=new Map(), historyUrls=new Map();
function progress(value,text){$('labStatus').hidden=false;$('labFill').style.width=`${Math.round(value*100)}%`;$('labProgress').setAttribute('aria-valuenow',String(Math.round(value*100)));$('labProgressText').textContent=text;}
function clearResult(){if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=null;$('labVideo').pause();$('labVideo').removeAttribute('src');$('labVideo').hidden=true;$('labEmpty').hidden=false;$('labDownload').hidden=true;$('labSummary').textContent='';}
function busy(value){document.querySelectorAll('#testFile,.lab-fields input,.lab-fields select').forEach(e=>e.disabled=value);$('labQuality').value=String(Math.min(plan.width,plan.height));$('labVideo').controls=!value;$('labRun').disabled=value||!file;$('labCancel').hidden=!value;syncCaptionField();}
function displayError(error){return /codec|decoder|encoder|worker|WebCodecs|Mediabunny|Offscreen/i.test(error.message)?'No se pudo procesar este video. Prueba con otro archivo.':error.message;}
function syncCaptionField(){$('labCaptionField').hidden=!$('labShowCaption').checked;$('labCaption').disabled=Boolean(controller)||!$('labShowCaption').checked;}
function ranges(){return manualClipRanges({start:Number($('labStart').value),end:Number($('labEnd').value),duration,value:$('labCount').value,maxClips:plan.maxClips,length:CLIP_LENGTHS[$('labLength').value]});}
function updateCountHint(){let text=plan.maxClips==null?'Elige cuántos clips quieres crear.':`Hasta ${plan.maxClips} clips por video con tu plan.`;if(file){try{const count=ranges().length;text+=` Se ${count===1?'creará 1 clip':`crearán ${count} clips`}.`;}catch{}}$('labCountHint').textContent=text;}
function updateLength(){const length=CLIP_LENGTHS[$('labLength').value];$('labDurationHint').textContent=`Elige un fragmento de hasta ${length.maxLen} segundos.`;const start=Number($('labStart').value)||0;$('labEnd').value=(file?Math.min(duration,start+length.maxLen):start+length.maxLen).toFixed(1);updateCountHint();}
function updateFormat(){$('studioFormatLabel').textContent=OUTPUT_FORMATS[$('labFormat').value].label;}
$('studioPlanBadge').textContent=`Plan ${plan.name}`;
$('labCount').replaceChildren(...clipCountChoices(plan.maxClips).map(n=>new Option(`${n} ${n===1?'clip':'clips'}`,String(n))),new Option(plan.maxClips==null?'Máximo disponible':`Máximo del plan · ${plan.maxClips} clips`,'max'));
$('labCount').value='1';$('labQuality').value=String(Math.min(plan.width,plan.height));
for(const option of $('labQuality').options)option.disabled=Number(option.value)>Math.min(plan.width,plan.height);
$('labShowCaption').addEventListener('change',syncCaptionField);
$('labFormat').addEventListener('change',updateFormat);$('labLength').addEventListener('change',updateLength);
['labStart','labEnd','labCount'].forEach(id=>$(id).addEventListener('change',updateCountHint));
$('testFile').addEventListener('change',()=>{
 file=null;duration=0;clearResult();$('labError').hidden=true;$('labStatus').hidden=true;$('labRun').disabled=true;
 const chosen=$('testFile').files[0];if(!chosen)return;
 if(sourceUrl)URL.revokeObjectURL(sourceUrl);sourceUrl=URL.createObjectURL(chosen);const url=sourceUrl;
 const probe=document.createElement('video');probe.preload='metadata';probe.src=url;
 const cleanup=()=>{URL.revokeObjectURL(url);probe.removeAttribute('src');probe.load();if(sourceUrl===url)sourceUrl=null;};
 probe.onloadedmetadata=()=>{if($('testFile').files[0]!==chosen){cleanup();return;}if(!Number.isFinite(probe.duration)||probe.duration<1){probe.onerror();return;}file=chosen;duration=probe.duration;$('labProject').textContent=chosen.name;$('labFileInfo').textContent=`${Math.floor(duration/60)}:${String(Math.floor(duration%60)).padStart(2,'0')} de video`;$('labStart').value='0';updateLength();$('labRun').disabled=false;resultUrl=URL.createObjectURL(chosen);$('labVideo').src=resultUrl;$('labVideo').hidden=false;$('labEmpty').hidden=true;cleanup();};
 probe.onerror=()=>{cleanup();if($('testFile').files[0]!==chosen)return;$('labError').textContent='No se pudo abrir este video. Prueba con otro archivo.';$('labError').hidden=false;};
});
function historyCard(record){
 const card=document.createElement('article');card.className='creation-card';card.dataset.creationId=record.id;
 const video=document.createElement('video');const url=URL.createObjectURL(record.blob);historyUrls.set(record.id,url);video.src=url;video.controls=true;video.playsInline=true;video.preload='metadata';video.style.aspectRatio=`${record.width}/${record.height}`;
 const body=document.createElement('div');body.className='creation-body';
 const title=document.createElement('h3');title.textContent=record.title;
 const meta=document.createElement('p');meta.textContent=`${OUTPUT_FORMATS[record.format]?.label||'Clip'} · ${Math.round(record.end-record.start)} s${record.showCaptions?' · Con subtítulos':''}`;
 const actions=document.createElement('div');actions.className='creation-actions';
 const download=document.createElement('a');download.className='btn primary';download.href=url;download.download=record.filename;download.textContent='Descargar';
 const remove=document.createElement('button');remove.className='btn ghost';remove.type='button';remove.textContent='Eliminar';
 remove.addEventListener('click',async()=>{remove.disabled=true;try{if(record.persisted!==false)await removeCreation(record.id);records.delete(record.id);renderHistory();}catch{$('creationMessage').textContent='No pudimos eliminar este clip. Vuelve a intentarlo.';remove.disabled=false;}});
 actions.append(download,remove);body.append(title,meta,actions);card.append(video,body);return card;
}
function renderHistory(){for(const url of historyUrls.values())URL.revokeObjectURL(url);historyUrls.clear();const list=$('creationList');list.replaceChildren();const current=[...records.values()].filter(record=>record.expiresAt>Date.now()).sort((a,b)=>b.createdAt-a.createdAt);if(!current.length){const empty=document.createElement('div');empty.className='creations-empty';const heading=document.createElement('h3');heading.textContent='Aquí empieza tu colección';const text=document.createElement('p');text.textContent='Cuando crees tus clips, los encontrarás aquí.';const link=document.createElement('a');link.href='#preview';link.className='text-link';link.textContent='Crear mi primer clip ↑';empty.append(heading,text,link);list.append(empty);}else current.forEach(record=>list.append(historyCard(record)));}
async function refreshHistory(){try{const saved=await listCreations();const unsaved=[...records.values()].filter(record=>record.persisted===false);records.clear();[...saved,...unsaved].forEach(record=>records.set(record.id,record));renderHistory();}catch{if(records.size)renderHistory();$('creationMessage').textContent='No pudimos cargar tus clips guardados. Puedes volver a intentarlo.';}}
$('refreshCreations').addEventListener('click',refreshHistory);
$('labCancel').addEventListener('click',()=>controller?.abort());
$('labRun').addEventListener('click',async()=>{
 if(!file||controller)return;$('labError').hidden=true;let clips;
 try{clips=ranges();}catch(error){$('labError').textContent=error.message;$('labError').hidden=false;return;}
 $('labVideo').pause();$('labDownload').hidden=true;$('labSummary').textContent='';controller=new AbortController();busy(true);const signal=controller.signal;let renderer;let completed=0;
 try{
  $('labStage').textContent='Preparando tu video';await decodeToMono16k(file,duration,{signal,onProgress:p=>progress(p*.15,`Preparando tu video · ${Math.round(p*100)}%`)});
  signal.throwIfAborted();renderer=new ClipRenderer(file);
  const dimensions=outputDimensions($('labFormat').value,Math.min(plan.width,plan.height));
  const words=$('labCaption').value.trim().split(/\s+/).filter(Boolean),showCaptions=$('labShowCaption').checked;
  for(let index=0;index<clips.length;index++){
   signal.throwIfAborted();const clip=clips[index],span=(clip.end-clip.start)/Math.max(1,words.length);
   const captions=words.length?[{start:clip.start,end:clip.end,words:words.map((text,i)=>({text,start:clip.start+i*span,end:clip.start+(i+1)*span}))}]:[];
   $('labStage').textContent=`Creando clip ${index+1} de ${clips.length}`;
   const result=await renderer.render(clip,captions,{...dimensions,layout:$('labLayout').value,showCaptions,watermarkText:plan.watermark?'DRIX':'',signal,onProgress:p=>progress(.15+.85*(index+p)/clips.length,`Creando clip ${index+1} de ${clips.length} · ${Math.round(p*100)}%`)});
   signal.throwIfAborted();if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=URL.createObjectURL(result.blob);$('labVideo').src=resultUrl;$('labVideo').hidden=false;$('labEmpty').hidden=true;
   const record={id:crypto.randomUUID(),createdAt:Date.now(),expiresAt:Date.now()+24*60*60*1000,title:`Clip ${index+1} · ${file.name}`,filename:`drix-clip-${index+1}-${$('labFormat').value}.${extensionFor(result.mime)}`,blob:result.blob,mime:result.mime,format:$('labFormat').value,...dimensions,start:clip.start,end:clip.end,showCaptions};
   try{await saveCreation(record);}catch{record.persisted=false;$('creationMessage').textContent='Tu clip está listo, pero no pudimos guardarlo. Descárgalo para conservarlo.';}
   records.set(record.id,record);renderHistory();completed++;
   $('labDownload').href=resultUrl;$('labDownload').download=record.filename;$('labDownload').hidden=false;
  }
  $('labStage').textContent=completed===1?'Tu clip está listo':'Tus clips están listos';progress(1,'Listos para compartir');$('labSummary').textContent=completed===1?'Descárgalo o encuéntralo en Mis creaciones.':`${completed} clips listos. Los encontrarás en Mis creaciones.`;
 }catch(error){$('labError').textContent=error.name==='AbortError'?`Proceso cancelado.${completed?' Los clips que ya creaste están en Mis creaciones.':' Puedes volver a intentarlo cuando quieras.'}`:displayError(error);$('labError').hidden=false;$('labStatus').hidden=true;}
 finally{renderer?.dispose();controller=null;busy(false);}
});
updateLength();updateFormat();syncCaptionField();refreshHistory();
window.addEventListener('pagehide',()=>{controller?.abort();if(resultUrl)URL.revokeObjectURL(resultUrl);if(sourceUrl)URL.revokeObjectURL(sourceUrl);for(const url of historyUrls.values())URL.revokeObjectURL(url);});
