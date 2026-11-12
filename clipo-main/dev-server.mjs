// Local preview. Production continues to use Cloudflare Pages Functions.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { onRequestGet } from './functions/api/config.js';
const root = fileURLToPath(new URL('./public/', import.meta.url));
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf','.xml':'application/xml','.txt':'text/plain'};
http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    if (url.pathname === '/api/config') { const response = await onRequestGet({env:process.env}); res.writeHead(response.status,Object.fromEntries(response.headers)); return res.end(await response.text()); }
    if (url.pathname.startsWith('/api/')) { res.writeHead(503,{'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'Utiliza Cloudflare Pages para las funciones del servidor.'})); }
    const name = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!name.startsWith(root)) { res.writeHead(403); return res.end(); }
    const file = await readFile(name); res.writeHead(200,{'Content-Type':types[path.extname(name)] || 'application/octet-stream'}); res.end(file);
  } catch { res.writeHead(404); res.end('No encontrado'); }
}).listen(Number(process.env.PORT || 3000),'0.0.0.0',()=>console.log('DRIX CLIP: http://localhost:'+(process.env.PORT || 3000)));
