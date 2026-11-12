import { test, expect } from '@playwright/test';
import { mkdirSync, copyFileSync, truncateSync, existsSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
const dir = path.join(os.tmpdir(), 'drix-media-fixtures');
const source = process.env.DRIX_MEDIA_FIXTURE || path.join(dir, 'four-minutes.mp4');
const large = path.join(dir, 'four-minutes-431MiB.mp4');
const huge = path.join(dir, 'four-minutes-1GiB.mp4');
const measurements = [];
function probe(file) { return JSON.parse(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration:stream=codec_type,codec_name,width,height','-of','json',file], { encoding: 'utf8' })); }
test.beforeAll(() => {
  mkdirSync(dir, { recursive: true });
  if (!existsSync(source)) execFileSync('ffmpeg', ['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=640x360:rate=15:duration=240','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=240','-c:v','libx264','-preset','ultrafast','-crf','30','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',source]);
  // Padding isolates file-size handling. It is not a high-bitrate 4K stress test.
  for (const [file, size] of [[large,431*1024**2],[huge,1024**3]]) { copyFileSync(source, file); truncateSync(file, size); }
});
test.afterAll(async ({}, info) => { writeFileSync(path.join(info.project.outputDir, 'measurements.json'), JSON.stringify(measurements, null, 2)); });
test.beforeEach(async ({ page }) => { await page.goto('/'); });
async function upload(page,file) { await page.locator('#fileInput').setInputFiles(file); }

test('extracts all four minutes incrementally at 431 MiB and 1 GiB', async ({ page }) => {
  for (const file of [large,huge]) {
    await upload(page,file);
    const value = await page.evaluate(async () => {
      const { decodeToMono16k } = await import('/lib/audio.js');
      const began = performance.now(); let mode;
      const data = await decodeToMono16k(document.getElementById('fileInput').files[0],240,{onMode:value=>mode=value});
      let energy=0, crossings=0;
      for(let i=1;i<data.length;i++){energy+=data[i]*data[i];if(data[i-1]<0&&data[i]>=0)crossings++;}
      return { mode, seconds:data.length/16000, rms:Math.sqrt(energy/data.length), frequency:crossings/(data.length/16000), elapsedMs:performance.now()-began };
    });
    expect(value.mode).toBe('incremental'); expect(value.seconds).toBeCloseTo(240,1);
    expect(value.rms).toBeGreaterThan(.03); expect(value.frequency).toBeGreaterThan(435); expect(value.frequency).toBeLessThan(445);
    measurements.push({test:'audio',file:path.basename(file),...value});
  }
});
for (const clip of [{start:0,end:45,layout:'fill'},{start:150,end:240,layout:'fit'}]) {
  test(`exports ${clip.end-clip.start}s with sound, precise trimming and ${clip.layout}`,async({page},info)=>{
    await upload(page,large);
    const downloadPromise=page.waitForEvent('download');
    const result=await page.evaluate(async clip=>{
      const {ClipRenderer}=await import('/lib/render.js');
      const renderer=new ClipRenderer(document.getElementById('fileInput').files[0]);
      let mode; const began=performance.now();
      try {
        const result=await renderer.render(clip,[{start:clip.start,end:clip.end,words:[{text:'PRUEBA',start:clip.start,end:clip.end}]}],{width:720,height:1280,layout:clip.layout,showCaptions:true,watermarkText:'DRIX',onMode:value=>mode=value});
        const link=document.createElement('a');link.href=URL.createObjectURL(result.blob);link.download='clip.'+(result.mime.startsWith('video/mp4')?'mp4':'webm');link.click();
        return {mode,mime:result.mime,bytes:result.blob.size,elapsedMs:performance.now()-began};
      } finally {renderer.dispose();}
    },clip);
    const download=await downloadPromise;const output=info.outputPath(download.suggestedFilename());await download.saveAs(output);
    expect(result.mode).toBe('webcodecs');const media=probe(output);
    expect(Number(media.format.duration)).toBeCloseTo(clip.end-clip.start,0);
    const video=media.streams.find(s=>s.codec_type==='video');expect(video.width).toBe(720);expect(video.height).toBe(1280);
    expect(media.streams.some(s=>s.codec_type==='audio')).toBe(true);
    // Check that the audio is present at both ends, not just that a track exists.
    const audio=execFileSync('ffmpeg',['-v','error','-i',output,'-map','0:a:0','-ac','1','-ar','16000','-f','f32le','pipe:1'],{maxBuffer:20*1024**2});
    for(const start of [16000,Math.floor((clip.end-clip.start-2)*16000)]){let energy=0;for(let i=start;i<start+8000;i++)energy+=audio.readFloatLE(i*4)**2;expect(Math.sqrt(energy/8000)).toBeGreaterThan(.03);}
    measurements.push({test:'render',duration:clip.end-clip.start,layout:clip.layout,...result});
  });
}
test('cancels decoding and export and permits a fresh job afterwards',async({page})=>{
  await upload(page,large);
  const result=await page.evaluate(async()=>{
    const {runMediaTask}=await import('/lib/media-task.js'); const outcomes=[];
    for(const task of ['audio','render']){
      const controller=new AbortController();
      try { await runMediaTask(task,{file:document.getElementById('fileInput').files[0],maxSeconds:240,clip:{start:0,end:90},captions:[],options:{width:720,height:1280}},{signal:controller.signal,onProgress:p=>{if(p>.03)controller.abort();}});outcomes.push('unexpected success'); }
      catch(e){outcomes.push(e.name);}
    }
    const samples=await runMediaTask('audio',{file:document.getElementById('fileInput').files[0],maxSeconds:2});
    return {outcomes,seconds:samples.length/16000};
  });
  expect(result.outcomes).toEqual(['AbortError','AbortError']);expect(result.seconds).toBeCloseTo(2,1);
});
test('reports a corrupt file instead of leaving preparation pending',async({page})=>{
  const message=await page.evaluate(async()=>{const{decodeToMono16k}=await import('/lib/audio.js');try{await decodeToMono16k(new File(['invalid data'],'bad.mp4',{type:'video/mp4'}),240);return null;}catch(e){return e.message;}});
  expect(message).toBeTruthy();
});
test('compatibility recorder exports when a worker cannot be created',async({page},info)=>{
  await upload(page,source);
  const downloadPromise=page.waitForEvent('download');
  const result=await page.evaluate(async()=>{
    const {ClipRenderer}=await import('/lib/render.js');const worker=window.Worker;
    const renderer=new ClipRenderer(document.getElementById('fileInput').files[0]);
    try{window.Worker=undefined;const output=await renderer.render({start:0,end:2},[],{width:360,height:640,showCaptions:false});const a=document.createElement('a');a.href=URL.createObjectURL(output.blob);a.download='compatible.'+(output.mime.startsWith('video/mp4')?'mp4':'webm');a.click();return{mode:output.mode};}
    finally{window.Worker=worker;renderer.dispose();}
  });
  const download=await downloadPromise;const output=info.outputPath(download.suggestedFilename());await download.saveAs(output);
  expect(result.mode).toBe('compatibility');expect(Number(probe(output).format.duration)).toBeCloseTo(2,0);
});
test('standalone HTML exports a local clip and works at mobile width',async({page},info)=>{
  const external=[];page.on('request',r=>{if(/^https?:/.test(r.url())&&!r.url().startsWith('http://127.0.0.1:4173'))external.push(r.url());});
  await page.goto('/prueba-webcodecs.html?vista=estudio');
  await page.locator('#testFile').setInputFiles(large);
  await expect(page.locator('#labRun')).toBeEnabled();
  await page.locator('#labStart').fill('150');await page.locator('#labEnd').fill('153');
  await page.getByRole('button',{name:'Crear mis clips'}).click();
  await expect(page.locator('#labStage')).toHaveText('Tu clip está listo',{timeout:120000});
  await expect(page.locator('#labSummary')).toContainText('Descárgalo');
  await expect(page.locator('body')).not.toContainText(/200\s?MB|WebCodecs|compatibilidad|códecs|fotogramas|lectura incremental/i);
  const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Descargar clip'}).click();const download=await downloadPromise;
  const output=info.outputPath(download.suggestedFilename());await download.saveAs(output);expect(Number(probe(output).format.duration)).toBeCloseTo(3,0);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.screenshot({path:info.outputPath('mobile.png'),fullPage:true});expect(external).toEqual([]);
});
test('audio falls back with progress when module workers are unavailable',async({page})=>{
  await upload(page,source);
  const result=await page.evaluate(async()=>{
    const {decodeToMono16k}=await import('/lib/audio.js');const worker=window.Worker;let mode,last=0;
    try{window.Worker=class{constructor(){throw new Error('Module workers unsupported');}};const samples=await decodeToMono16k(document.getElementById('fileInput').files[0],1.5,{onMode:value=>mode=value,onProgress:value=>last=value});return{mode,last,seconds:samples.length/16000};}
    finally{window.Worker=worker;}
  });
  expect(result.mode).toBe('compatibility');expect(result.last).toBe(1);expect(result.seconds).toBeCloseTo(1.5,1);
});
test('premium page keeps the approved hero, parallax and clean product copy',async({page},info)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});await page.goto('/prueba-webcodecs.html?vista=estudio');
  await expect(page.getByRole('heading',{level:1,name:/Un gran video/})).toBeVisible();
  await expect(page.locator('#heroScene')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/200\s?MB|WebCodecs|compatibilidad|códecs|fotogramas|lectura incremental|MB de archivo/i);
  await page.screenshot({path:info.outputPath('premium-opening.png')});
  await page.getByRole('button',{name:'El original',exact:true}).click();await expect(page.locator('#heroScene')).toHaveAttribute('data-scene','original');
  await page.getByRole('button',{name:/Los clips/}).click();await expect(page.locator('#heroScene')).toHaveAttribute('data-scene','clips');
  await page.locator('#viewApp').getByRole('link',{name:'Crear mis clips',exact:true}).click();await expect(page.locator('#labRun')).toBeVisible();
  await page.locator('#preview').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('premium-editor.png')});
  await page.getByRole('link',{name:'Conocer el plan Pro'}).click();await expect(page.locator('#proDetails')).toHaveAttribute('open','');
  for(const width of [768,390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);}
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('premium-mobile-opening.png')});
  await page.getByRole('button',{name:'Abrir menú'}).click();await expect(page.locator('#mobileNav')).toBeVisible();
  await page.locator('#mobileNav').getByRole('link',{name:'Crear clips',exact:true}).click();await expect(page.locator('#mobileNav')).toBeHidden();
  expect(errors).toEqual([]);
});
test('editor cancellation restores its controls without technical messages',async({page})=>{
  await page.goto('/prueba-webcodecs.html?vista=estudio');await page.locator('#testFile').setInputFiles(large);await expect(page.locator('#labRun')).toBeEnabled();
  await page.locator('#labLength').selectOption('long');await page.locator('#labEnd').fill('90');await page.getByRole('button',{name:'Crear mis clips'}).click();await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await expect(page.locator('#labError')).toContainText('Proceso cancelado');await expect(page.locator('#labRun')).toBeEnabled();await expect(page.locator('#labDownload')).toBeHidden();
  await expect(page.locator('body')).not.toContainText(/200\s?MB|WebCodecs|compatibilidad|códecs|fotogramas|lectura incremental/i);
});
for(const [format,width,height] of [['vertical',720,1280],['square',720,720],['horizontal',1280,720]]) {
 test(`studio exports ${format}, offers durations and keeps a reloadable creation`,async({page},info)=>{
  await page.goto('/prueba-webcodecs.html?vista=estudio');
  await expect(page.locator('#labLength')).toContainText('15–30');await expect(page.locator('#labLength')).toContainText('30–60');await expect(page.locator('#labLength')).toContainText('40–90');
  expect(await page.locator('#labCount option').evaluateAll(options=>options.filter(o=>o.value!=='max').map(o=>Number(o.value)))).toEqual([1,2,3]);
  await page.locator('#testFile').setInputFiles(large);await expect(page.locator('#labRun')).toBeEnabled();
  await page.locator('#labFormat').selectOption(format);await page.locator('#labShowCaption').uncheck();await expect(page.locator('#labCaptionField')).toBeHidden();
  await page.locator('#labStart').fill('0');await page.locator('#labEnd').fill('2');
  await page.getByRole('button',{name:'Crear mis clips'}).click();await expect(page.locator('#labStage')).toHaveText('Tu clip está listo',{timeout:120000});
  const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Descargar clip',exact:true}).click();const download=await downloadPromise;
  const output=info.outputPath(download.suggestedFilename());await download.saveAs(output);const video=probe(output).streams.find(s=>s.codec_type==='video');expect(video.width).toBe(width);expect(video.height).toBe(height);
  await expect(page.locator('.creation-card')).toHaveCount(1);await expect(page.locator('.creation-body')).toContainText(format==='vertical'?'9:16':format==='square'?'1:1':'16:9');
  await expect(page.locator('#creationMessage')).toBeEmpty();
  await page.reload();await expect(page.locator('.creation-card')).toHaveCount(1);
  await page.locator('.creation-card').getByRole('button',{name:'Eliminar'}).click();await expect(page.locator('.creation-card')).toHaveCount(0);await page.reload();await expect(page.locator('.creation-card')).toHaveCount(0);
 });
}
test('maximum plan selection creates three real downloadable clips with optional captions',async({page},info)=>{
 await page.goto('/prueba-webcodecs.html?vista=estudio');await page.locator('#testFile').setInputFiles(large);await expect(page.locator('#labRun')).toBeEnabled();
 await page.locator('#labLength').selectOption('short');await expect(page.locator('#labEnd')).toHaveValue('30.0');await page.locator('#labLength').selectOption('long');await expect(page.locator('#labEnd')).toHaveValue('90.0');
 await page.locator('#labEnd').fill('2');await page.locator('#labCount').selectOption('max');await expect(page.locator('#labCountHint')).toContainText('3 clips');
 await page.locator('#labFormat').selectOption('square');await page.locator('#labShowCaption').check();await page.locator('#labCaption').fill('Mi siguiente clip');
 await page.getByRole('button',{name:'Crear mis clips'}).click();await expect(page.locator('#labStage')).toHaveText('Tus clips están listos',{timeout:120000});
 await expect(page.locator('.creation-card')).toHaveCount(3);await expect(page.locator('#labSummary')).toContainText('3 clips listos');
 for(const card of await page.locator('.creation-card').all())await expect(card).toContainText('Con subtítulos');
 await page.reload();await expect(page.locator('.creation-card')).toHaveCount(3);
 const downloadPromise=page.waitForEvent('download');await page.locator('.creation-card').first().getByRole('link',{name:'Descargar',exact:true}).click();const download=await downloadPromise;const output=info.outputPath(download.suggestedFilename());await download.saveAs(output);expect(probe(output).streams.some(s=>s.codec_type==='audio')).toBe(true);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);await page.locator('#myCreations').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('creations-mobile.png')});
 await page.setViewportSize({width:1440,height:1000});await page.locator('#preview').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('complete-editor.png')});
});
test('downloaded video actually includes or omits subtitles as selected',async({page},info)=>{
 const black=path.join(dir,'black-with-audio.mp4');
 if(!existsSync(black))execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=320x240:r=15:d=4','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=4','-c:v','libx264','-preset','ultrafast','-c:a','aac','-shortest','-movflags','+faststart',black]);
 await page.goto('/prueba-webcodecs.html?vista=estudio');await page.locator('#testFile').setInputFiles(black);await expect(page.locator('#labRun')).toBeEnabled();await page.locator('#labEnd').fill('2');await page.locator('#labFormat').selectOption('square');
 const counts=[];
 for(const captions of [false,true]){
  await page.locator('#labShowCaption').setChecked(captions);await page.getByRole('button',{name:'Crear mis clips'}).click();await expect(page.locator('#labStage')).toHaveText('Tu clip está listo',{timeout:120000});await expect(page.locator('#labRun')).toBeEnabled();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('link',{name:'Descargar clip',exact:true}).click();const download=await downloadPromise;const output=info.outputPath(`${captions?'with':'without'}-${download.suggestedFilename()}`);await download.saveAs(output);
  const frame=execFileSync('ffmpeg',['-v','error','-ss','1','-i',output,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{maxBuffer:8*1024**2});
  let yellow=0;for(let i=0;i<frame.length;i+=3)if(frame[i]>180&&frame[i+1]>120&&frame[i+1]<240&&frame[i+2]<80)yellow++;
  counts.push(yellow);
 }
 expect(counts[0]).toBeLessThan(10);expect(counts[1]).toBeGreaterThan(200);
});
test('welcome explains the product, benefits and plans without exposing the studio',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:1440,height:1000});await page.goto('/prueba-webcodecs.html');
 await expect(page.getByRole('heading',{level:1,name:/Ya tienes el video/})).toBeVisible();
 await expect(page.locator('#viewApp')).toBeHidden();await expect(page.locator('#heroScene')).toBeHidden();await expect(page.locator('#testFile')).toBeHidden();await expect(page.locator('#myCreations')).toBeHidden();
 await expect(page.getByRole('button',{name:'Continuar con Google',exact:true})).toBeVisible();
 await expect(page.locator('#why')).toContainText('Aprovecha lo que ya grabaste');await expect(page.locator('#how')).toContainText('Descarga y comparte');await expect(page.locator('#plansGrid')).toContainText('$28');
 await page.screenshot({path:info.outputPath('welcome-desktop.png')});
 await page.getByRole('tab',{name:/Dale tu estilo/}).click();await expect(page.locator('#panelStyle')).toBeVisible();await expect(page.locator('#panelUpload')).toBeHidden();
 await page.getByRole('tab',{name:/Dale tu estilo/}).press('ArrowDown');await expect(page.locator('#panelShare')).toBeVisible();
 await page.getByRole('button',{name:'Continuar con Google',exact:true}).click();await expect(page.locator('#viewApp')).toBeHidden();
 await page.getByRole('button',{name:'Estudio',exact:true}).click();await expect(page.locator('#viewLanding')).toBeHidden();await expect(page.locator('#heroScene')).toBeVisible();await expect(page.locator('#myCreations')).toBeVisible();
 await expect(page.locator('#labFormat')).toHaveValue('vertical');await expect(page.locator('#labCount')).toHaveValue('1');
 await page.getByRole('button',{name:'Bienvenida',exact:true}).click();await expect(page.locator('#viewApp')).toBeHidden();
 for(const width of [1024,768,390,320]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);}
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:info.outputPath('welcome-mobile.png'),fullPage:true});
 expect(errors).toEqual([]);
});
test('production shell stays private until session-driven view changes and returns to welcome',async({page},info)=>{
 await page.goto('/');await expect(page.locator('#viewLanding')).toBeVisible();await expect(page.locator('#viewApp')).toBeHidden();
 await expect(page.locator('#fileInput')).toBeHidden();await expect(page.locator('#history')).toBeHidden();
 expect(await page.locator('.preview-views').count()).toBe(0);
 const ids=await page.locator('[id]').evaluateAll(els=>els.map(el=>el.id));expect(new Set(ids).size).toBe(ids.length);
 // Check the rendering transition only; this is not a simulated Google login or an API authorization test.
 await page.evaluate(async()=>{const{setSessionView}=await import('/session-view.js');setSessionView(true);});
 await expect(page.locator('#heroScene')).toBeVisible();await expect(page.locator('#viewLanding')).toBeHidden();
 await expect(page.locator('#outputFormat')).toBeVisible();await expect(page.locator('#clipLength')).toBeVisible();await expect(page.locator('#showCaptions')).toBeVisible();await expect(page.locator('#history')).toBeVisible();
 await page.setViewportSize({width:1440,height:1000});await page.locator('#studioEditor').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('production-studio.png')});
 await page.evaluate(async()=>{const{setSessionView}=await import('/session-view.js');setSessionView(false);});await expect(page.locator('#history')).toBeHidden();await expect(page.locator('#viewLanding')).toBeVisible();
});
