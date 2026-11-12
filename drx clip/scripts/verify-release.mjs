import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const manifest=JSON.parse(await readFile(path.join(root,'MANIFEST.json'),'utf8'));
const required=['public/index.html','public/style.css','public/app.js','public/prueba-webcodecs.html','public/vendor/mediabunny-1.65.2.mjs','public/lib/media-worker.js','public/lib/render.js','public/lib/audio.js','functions/api/config.js','scripts/build-pages.mjs'];
const errors=[];
for(const name of required)if(!manifest.files.some(entry=>entry.path===name))errors.push(`Falta en el manifiesto: ${name}`);
for(const entry of manifest.files){
 const file=path.resolve(root,entry.path);
 if(!file.startsWith(root+path.sep)){errors.push(`Ruta inválida: ${entry.path}`);continue;}
 try{const bytes=await readFile(file);const sha=createHash('sha256').update(bytes).digest('hex');if(bytes.length!==entry.bytes||sha!==entry.sha256)errors.push(`Contenido diferente: ${entry.path}`);}catch{errors.push(`Archivo ausente: ${entry.path}`);}
}
const localReferences=[];
for(const entry of manifest.files.filter(e=>e.path.startsWith('public/'))){
 if(!/\.(html|css|js|mjs)$/.test(entry.path))continue;
 const source=await readFile(path.join(root,entry.path),'utf8');
 const patterns=entry.path.endsWith('.html')?[/\b(?:src|href)=["']([^"']+)["']/g]:entry.path.endsWith('.css')?[/url\(["']?([^"')]+)["']?\)/g]:[/\bfrom\s*["']([^"']+)["']/g,/\bimport\s*\(\s*["']([^"']+)["']/g,/new URL\(\s*["']([^"']+)["']/g];
 for(const pattern of patterns)for(const match of source.matchAll(pattern)){
  const ref=match[1];
  if(ref.startsWith('#')||ref.startsWith('/')||/^[a-z][a-z0-9+.-]*:/i.test(ref))continue;
  const clean=ref.split(/[?#]/)[0];if(!clean)continue;
  const target=path.resolve(root,path.dirname(entry.path),clean);
  if(!target.startsWith(root+path.sep)){errors.push(`Referencia fuera del proyecto: ${entry.path} → ${ref}`);continue;}
  localReferences.push([entry.path,ref,target]);
 }
}
for(const [source,ref,file]of localReferences){try{if(!(await stat(file)).isFile())errors.push(`Referencia no es archivo: ${source} → ${ref}`);}catch{errors.push(`Referencia local ausente: ${source} → ${ref}`);}}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`${manifest.release}: ${manifest.files.length} archivos íntegros; ${required.length} componentes requeridos y ${localReferences.length} referencias locales correctas.`);
