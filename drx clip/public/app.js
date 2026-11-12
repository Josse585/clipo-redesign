import { setSessionView } from './session-view.js';
import { outputDimensions, clipCountChoices, resolveClipCount } from './lib/editor-options.js';
import { pickClips, buildCaptions, fallbackWords, CLIP_LENGTHS } from './lib/clipper.js';
import { decodeToMono16k, splitIntoChunks } from './lib/audio.js';
import { ClipRenderer, canRenderVideo, extensionFor } from './lib/render.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let cfg = null;
let supabase = null;
let session = null;
let status = null;
let selectedFile = null;
let fileDuration = 0;
let busy = false;
let processingController = null;
let sourcePreviewUrl = null;

// ---------- utilidades de interfaz ----------
function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function fmtMinutes(sec) {
  return `${Math.floor(sec / 60)} min`;
}
function toast(text, ms = 4000) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
function showAlert(text, withPlansLink = false) {
  const box = $('alertBox');
  box.textContent = text;
  if (withPlansLink) {
    const a = document.createElement('a');
    a.href = '#plans';
    a.textContent = ' Ver planes';
    a.className = 'link';
    box.appendChild(a);
  }
  box.hidden = !text;
}
function setProgress(fraction, text, title) {
  $('progressCard').hidden = false;
  const percent = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
  $('progressFill').style.width = `${percent}%`;
  $('labProgress')?.setAttribute('aria-valuenow', String(percent));
  if (text !== undefined) $('progressText').textContent = text;
  if (title) $('progressTitle').textContent = title;
}

const AUTH_ERRORS = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'User already registered': 'Ese correo ya tiene cuenta. Toca "Ya tengo cuenta · Ingresar".',
  'Email not confirmed': 'Primero confirma tu correo (revisa tu bandeja y spam).',
  'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
};
function authErrorText(err) {
  const m = err && err.message ? err.message : '';
  if (/rate limit/i.test(m)) return 'Demasiados intentos. Espera unos minutos y vuelve a probar.';
  return AUTH_ERRORS[m] || m || 'Ocurrió un error. Intenta de nuevo.';
}

// ---------- llamadas al servidor ----------
async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session && data.session.access_token;
  const res = await fetch(path, {
    method,
    body,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    signal: processingController?.signal,
  });
  let payload = null;
  try { payload = await res.json(); } catch (e) { /* sin cuerpo */ }
  if (!res.ok) {
    const err = new Error((payload && payload.error) || `Error ${res.status}`);
    err.status = res.status;
    err.code = payload && payload.code;
    throw err;
  }
  return payload;
}

// ---------- arranque ----------
async function init() {
  bindEvents();
  try {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Config unavailable');
    cfg = await res.json();
    if (!cfg.plans?.free || !cfg.plans?.pro) throw new Error('Invalid config');
  } catch (e) {
    $('plansGrid').innerHTML = '<p class="muted">No pudimos cargar los planes. <a href="" class="link">Volver a intentar</a></p>';
    return fatal('No pudimos conectar con el servicio. Recarga la página para volver a intentarlo.');
  }
  document.title = 'DRIX CLIP · Tus mejores momentos, en vertical';
  if (cfg.supportEmail) {
    const support = document.createElement('a');
    support.href = `mailto:${cfg.supportEmail}`;
    support.textContent = cfg.supportEmail;
    $('supportLine').replaceChildren('¿Dudas? ', support);
  }

  buildSelects();
  renderPlans();

  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    return fatal('El acceso no está disponible en este momento. Inténtalo más tarde.');
  }
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  const { data } = await supabase.auth.getSession();
  await onSession(data.session);
  supabase.auth.onAuthStateChange((event, s) => {
    onSession(s).catch(() => showAlert('No pudimos cargar tu estudio. Vuelve a intentarlo.'));
  });
}

function fatal(text) {
  setSessionView(false);
  $('authMsg').textContent = text;
  $('authMsg').className = 'msg error';
  $('viewLanding').hidden = false;
}

function buildSelects() {
  $('clipLength').innerHTML = Object.entries(CLIP_LENGTHS)
    .map(([k, v]) => `<option value="${k}"${k === 'medium' ? ' selected' : ''}>${v.label}</option>`).join('');
  refreshClipCountOptions();
}
function refreshClipCountOptions() {
  const max = status ? status.planInfo.maxClips : cfg.plans.free.maxClips;
  const options = clipCountChoices(max);
  const current = $('clipCount').value;
  $('clipCount').innerHTML = options.map(n => `<option value="${n}">${n} ${n === 1 ? 'clip' : 'clips'}</option>`).join('') + `<option value="max">${max == null ? 'Máximo disponible' : `Máximo del plan · ${max} clips`}</option>`;
  $('clipCount').value = current === 'max' || options.includes(Number(current)) ? current : '1';
}

async function onSession(s) {
  const sameUser = session && s && session.user.id === s.user.id;
  session = s;
  setSessionView(Boolean(s));
  if (sameUser) return;
  if (s) {
    $('viewLanding').hidden = true;
    $('viewApp').hidden = false;
    $('userBox').hidden = false;
    $('userEmail').textContent = s.user.email || '';
    await loadStatus();
    await loadHistory();
  } else {
    processingController?.abort();
    selectedFile = null; fileDuration = 0;
    $('fileInput').value = '';
    if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl); sourcePreviewUrl = null;
    $('sourcePreview').pause(); $('sourcePreview').removeAttribute('src'); $('sourcePreview').hidden = true;
    $('labEmpty').hidden = false; $('results').replaceChildren(); $('historyResults').replaceChildren();
    status = null;
    $('viewLanding').hidden = false;
    $('viewApp').hidden = true;
    $('userBox').hidden = true;
    renderPlans();
  }
}

async function loadStatus() {
  try {
    status = await api('/api/status');
  } catch (e) {
    if (e.status === 401) { await supabase.auth.signOut(); return; }
    showAlert('No pude cargar tu plan. Recarga la página.');
    return;
  }
  const p = status.planInfo;
  $('planBadge').textContent = p.name;
  $('editorPlanName').textContent = `Plan ${p.name}`;
  $('clipCountHint').textContent = p.maxClips == null ? 'Elige cuántos clips quieres crear.' : `Hasta ${p.maxClips} clips por video con tu plan.`;
  $('exportQuality').value = String(Math.min(p.width, p.height));
  for (const option of $('exportQuality').options) option.disabled = Number(option.value) > Math.min(p.width, p.height);
  $('statusPlan').textContent = `Plan ${p.name}`;
  $('statusLimits').textContent = p.minutesPerDay == null ? `Procesamiento y clips sin límite de plan · ${p.qualityLabel}` : `${p.minutesPerDay} min de video al día · hasta ${p.maxClips} clips por video · ${p.qualityLabel}`;
  const pct = status.limitSeconds ? status.usedSeconds / status.limitSeconds : 0;
  $('usageFill').style.width = `${Math.min(100, Math.round(pct * 100))}%`;
  $('usageText').textContent = status.remainingSeconds == null ? 'Tu plan Pro no tiene límite diario de procesamiento.' : `Hoy te quedan ${fmtMinutes(status.remainingSeconds)} de ${fmtMinutes(status.limitSeconds)}. Se reinicia a medianoche (hora de Bolivia).`;
  $('upgradeLink').hidden = status.plan === 'pro';
  refreshClipCountOptions();
  updateFileInfo();
  renderPlans();
}

// ---------- ingreso exclusivo con Google ----------
async function signInWithGoogle() {
  if (!supabase) { fatal('El servicio de acceso no está disponible. Inténtalo más tarde.'); return; }
  const button = $('googleSignIn');
  const msg = $('authMsg');
  button.disabled = true;
  msg.className = 'msg';
  msg.textContent = 'Conectando con Google…';
  try {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) {
    button.disabled = false;
    msg.className = 'msg error';
    msg.textContent = authErrorText(error);
  }
  } catch (error) { button.disabled = false; msg.className = 'msg error'; msg.textContent = 'No pudimos conectar con Google. Vuelve a intentarlo.'; }
}

function bindEvents() {
  $('googleSignIn').addEventListener('click', signInWithGoogle);

  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(name => drop.addEventListener(name, e => { e.preventDefault(); drop.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach(name => drop.addEventListener(name, e => { e.preventDefault(); drop.classList.remove('dragging'); }));
  drop.addEventListener('drop', e => {
    if (busy) return;
    const files = e.dataTransfer.files;
    if (files.length) onFileChosen({ target: { files } });
  });
  $('logoutBtn').addEventListener('click', async () => {
    if (busy && !window.confirm('Hay clips en proceso. ¿Salir de todos modos?')) return;
    await supabase.auth.signOut();
  });

  $('fileInput').addEventListener('change', onFileChosen);
  $('outputFormat').addEventListener('change', () => { $('studioFormatLabel').textContent = $('outputFormat').selectedOptions[0].textContent; });
  $('refreshHistory').addEventListener('click', loadHistory);
  $('consent').addEventListener('change', updateStartButton);
  $('startBtn').addEventListener('click', processVideo);
  $('cancelBtn').addEventListener('click', () => processingController?.abort());
  window.addEventListener('beforeunload', (e) => { if (busy) { e.preventDefault(); e.returnValue = ''; } });
}

// ---------- archivo elegido ----------
function onFileChosen(ev) {
  if (busy) return;
  const file = ev.target.files && ev.target.files[0];
  $('dropTitle').textContent = 'Tu próximo proyecto';
  if (sourcePreviewUrl) URL.revokeObjectURL(sourcePreviewUrl); sourcePreviewUrl = null;
  $('sourcePreview').pause(); $('sourcePreview').removeAttribute('src'); $('sourcePreview').hidden = true; $('labEmpty').hidden = false;
  selectedFile = null;
  fileDuration = 0;
  showAlert('');
  if (!file) { updateFileInfo(); return; }
  if (!file.type.startsWith('video/')) { showAlert('Elige un archivo de video MP4, MOV o WEBM.'); updateFileInfo(); return; }

  const probe = document.createElement('video');
  probe.preload = 'metadata';
  const url = URL.createObjectURL(file);
  probe.src = url;
  probe.onloadedmetadata = () => {
    fileDuration = probe.duration;
    URL.revokeObjectURL(url);
    if (!Number.isFinite(fileDuration) || fileDuration < 3) {
      showAlert('No pude leer la duración de este video. Prueba con otro archivo (MP4 o MOV).');
      updateFileInfo();
      return;
    }
    selectedFile = file;
    sourcePreviewUrl = URL.createObjectURL(file); $('sourcePreview').src = sourcePreviewUrl; $('sourcePreview').hidden = false; $('labEmpty').hidden = true;
    $('dropTitle').textContent = file.name;
    updateFileInfo();
  };
  probe.onerror = () => {
    URL.revokeObjectURL(url);
    showAlert('Tu navegador no puede abrir este archivo. Prueba con un MP4 o MOV normal.');
    updateFileInfo();
  };
}

function allowedSeconds() {
  if (!status || !selectedFile) return 0;
  const byPlan = status.planInfo.maxVideoMinutes == null ? Infinity : status.planInfo.maxVideoMinutes * 60;
  const byDay = status.remainingSeconds == null ? Infinity : Math.max(0, status.remainingSeconds - 10); // pequeño margen por redondeos
  return Math.floor(Math.min(fileDuration, byPlan, byDay));
}

function updateFileInfo() {
  const info = $('fileInfo');
  if (!selectedFile || !status) { info.hidden = true; updateStartButton(); return; }
  const allowed = allowedSeconds();
  let text = `Duración: ${fmtTime(fileDuration)}.`;
  if (allowed < 5) {
    text += ' Hoy ya no te quedan minutos para procesar este video.';
  } else if (allowed < Math.floor(fileDuration)) {
    text += ` Tu plan permite procesar hoy ${fmtTime(allowed)} de este video: se analizarán esos primeros minutos.`;
  } else {
    text += ' Se procesará completo.';
  }
  info.textContent = text;
  if (allowed < Math.floor(fileDuration)) {
    const a = document.createElement('a');
    a.href = '#plans';
    a.className = 'link';
    a.textContent = ' Mejorar plan';
    info.appendChild(a);
  }
  info.hidden = false;
  updateStartButton();
}

function updateStartButton() {
  for (const id of ['fileInput','outputFormat','clipLength','clipCount','layout','exportQuality','showCaptions','lang','consent']) $(id).disabled = busy;
  $('startBtn').disabled = busy || !selectedFile || !status || allowedSeconds() < 5 || !$('consent').checked;
}

// ---------- el proceso completo ----------
async function transcribeChunk(chunk, lang, label) {
  const url = `/api/transcribe${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`;
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await api(url, { method: 'POST', body: chunk.blob, headers: { 'Content-Type': 'audio/wav' } });
    } catch (e) {
      lastError = e;
      if (e.name === 'AbortError' || processingController?.signal.aborted) throw e;
      if (e.code === 'limit' || e.status === 401 || e.status === 413) throw e;
      if (attempt < 2) {
        setProgress(label.fraction, e.code === 'busy'
          ? 'El servicio de transcripción está ocupado, reintentando en unos segundos…'
          : 'Reintentando…');
        await sleep(e.code === 'busy' ? 20000 : 4000);
      }
    }
  }
  throw lastError;
}

async function processVideo() {
  if (busy || !selectedFile || !status) return;
  busy = true;
  processingController = new AbortController();
  const signal = processingController.signal;
  $('cancelBtn').hidden = false;
  updateStartButton();
  showAlert('');
  $('results').innerHTML = '';
  $('startBtn').textContent = 'Procesando…';

  const plan = status.planInfo;
  const maxSeconds = allowedSeconds();
  let renderer = null;
  let wakeLock = null;
  try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* opcional */ }

  try {
    if (!canRenderVideo()) throw new Error('Tu navegador no puede grabar video. Usa Chrome o Edge actualizado en una computadora o Android.');

    // 1) audio
    setProgress(0.02, 'Preparando tu video…', 'Preparando tu video');
    const samples = await decodeToMono16k(selectedFile, maxSeconds, {
      signal,
      onProgress: progress => setProgress(.02 + .06 * progress, `Preparando tu video · ${Math.round(progress * 100)}%`),
    });
    signal.throwIfAborted();
    const chunks = splitIntoChunks(samples, cfg.chunkSeconds);
    if (!chunks.length) throw new Error('Este video no tiene audio utilizable.');

    // 2) transcripción
    const lang = $('lang').value;
    const segments = [];
    let words = [];
    for (let k = 0; k < chunks.length; k += 1) {
      const frac = 0.08 + 0.42 * (k / chunks.length);
      setProgress(frac, `Transcribiendo parte ${k + 1} de ${chunks.length}…`);
      const data = await transcribeChunk(chunks[k], lang, { fraction: frac });
      const off = chunks[k].offset;
      (data.segments || []).forEach((s) => segments.push({ start: s.start + off, end: s.end + off, text: (s.text || '').trim() }));
      (data.words || []).forEach((w) => words.push({ word: w.word, start: w.start + off, end: w.end + off }));
    }
    const totalText = segments.map((s) => s.text).join(' ').trim();
    if (totalText.length < 20) throw new Error('No detecté voz en este video. Prueba con uno donde se hable con claridad.');
    if (!words.length) words = fallbackWords(segments);

    // 3) mejores momentos
    setProgress(0.52, 'Buscando los mejores momentos…');
    const len = CLIP_LENGTHS[$('clipLength').value] || CLIP_LENGTHS.medium;
    const count = resolveClipCount($('clipCount').value, plan.maxClips, Math.min(fileDuration, maxSeconds), len.minLen);
    const clips = pickClips(segments, {
      count, minLen: len.minLen, maxLen: len.maxLen, videoDuration: Math.min(fileDuration, maxSeconds),
    });
    if (!clips.length) throw new Error('No encontré momentos adecuados para clips en este video.');

    // 4) crear cada clip
    renderer = new ClipRenderer(selectedFile);
    await renderer.ready();
    const layout = $('layout').value;
    const dimensions = outputDimensions($('outputFormat').value, Math.min(Number($('exportQuality').value), plan.width, plan.height));
    const showCaptions = $('showCaptions').checked;
    for (let i = 0; i < clips.length; i += 1) {
      const clip = clips[i];
      const captions = buildCaptions(words, clip.start, clip.end);
      const base = 0.55 + 0.45 * (i / clips.length);
      const span = 0.45 / clips.length;
      signal.throwIfAborted();
      setProgress(base, `Preparando clip ${i + 1} de ${clips.length}…`, 'Exportando clips');
      const { blob, mime } = await renderer.render(clip, captions, {
        signal,
        onMode: () => setProgress(base, `Creando clip ${i + 1} de ${clips.length}…`),
        width: dimensions.width,
        height: dimensions.height,
        layout,
        showCaptions,
        watermarkText: plan.watermark ? 'DRIX' : '',
        onProgress: (p) => setProgress(base + span * p),
      });
      signal.throwIfAborted();
      addResultCard(i + 1, clip, blob, extensionFor(mime));
      await saveClip(i + 1, clip, blob, mime);
    }

    setProgress(1, '¡Listo! Tus clips están abajo. Descárgalos y súbelos a tus redes.', 'Terminado');
    toast('¡Tus clips están listos!');
  } catch (e) {
    $('progressCard').hidden = true;
    showAlert(e.name === 'AbortError' ? 'Proceso cancelado. Los clips que ya descargaste se conservan.' : (/codec|decoder|encoder|worker|WebCodecs|Mediabunny|Offscreen/i.test(e.message || '') ? 'No se pudo procesar este video. Prueba con otro archivo.' : e.message || 'Algo salió mal. Intenta de nuevo.'), e.code === 'limit');
  } finally {
    if (renderer) renderer.dispose();
    if (wakeLock && wakeLock.release) wakeLock.release().catch(() => {});
    busy = false;
    processingController = null;
    $('cancelBtn').hidden = true;
    $('startBtn').textContent = 'Crear mis clips';
    updateStartButton();
    if (session) loadStatus();
  }
}

async function saveClip(n, clip, blob, mime) {
  const ext = extensionFor(mime);
  const id = crypto.randomUUID();
  const path = `${session.user.id}/${id}.${ext}`;
  const { error } = await supabase.storage.from('clipo-videos').upload(path, blob, {
    contentType: mime, upsert: false, cacheControl: '3600',
  });
  if (error) throw new Error(`No se pudo guardar el clip ${n}: ${error.message}`);
  try {
    await api('/api/clips', {
      method: 'POST',
      body: JSON.stringify({ storagePath: path, title: `Clip ${n} · ${fmtTime(clip.start)}–${fmtTime(clip.end)}`, snippet: clip.text }),
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    await supabase.storage.from('clipo-videos').remove([path]);
    throw e;
  }
  toast(`Clip ${n} guardado por 24 horas.`);
  await loadHistory();
}

async function loadHistory() {
  if (!session) return;
  const list = $('historyResults');
  list.innerHTML = '<p class="small muted">Cargando tus creaciones…</p>';
  try {
    const data = await api('/api/clips');
    list.innerHTML = '';
    if (!data.clips.length) {
      list.innerHTML = '<p class="small muted">Todavía no tienes clips guardados. Cuando termines de crear uno, aparecerá aquí durante 24 horas.</p>';
      return;
    }
    data.clips.forEach((clip) => {
      const card = document.createElement('article');
      card.className = 'clip';
      const video = document.createElement('video');
      video.src = clip.url;
      video.controls = true;
      video.playsInline = true;
      const meta = document.createElement('div');
      meta.className = 'meta';
      const title = document.createElement('strong');
      title.textContent = clip.title;
      const snippet = document.createElement('p');
      snippet.className = 'snippet';
      snippet.textContent = clip.snippet;
      const expiry = document.createElement('p');
      expiry.className = 'small muted';
      expiry.textContent = `Disponible hasta ${new Date(clip.expires_at).toLocaleString()}`;
      const dl = document.createElement('a');
      dl.className = 'btn primary';
      dl.textContent = 'Descargar';
      dl.href = clip.url;
      dl.download = `${clip.title.replace(/[^\p{L}\p{N}-]+/gu, '-')}.${clip.storage_path.split('.').pop()}`;
      const remove = document.createElement('button');
      remove.className = 'btn ghost';
      remove.type = 'button';
      remove.textContent = 'Eliminar';
      remove.addEventListener('click', async () => {
        remove.disabled = true;
        try { await api(`/api/clips/${encodeURIComponent(clip.id)}`, { method: 'DELETE' }); card.remove(); }
        catch (e) { toast(e.message || 'No se pudo eliminar el clip.'); remove.disabled = false; }
      });
      meta.append(title, snippet, expiry, dl, remove);
      card.append(video, meta);
      list.appendChild(card);
    });
  } catch (e) {
    list.innerHTML = '<p class="small muted">No pude cargar el historial. Intenta actualizarlo.</p>';
  }
}

function addResultCard(n, clip, blob, ext) {
  const url = URL.createObjectURL(blob);
  const card = document.createElement('article');
  card.className = 'clip';
  const video = document.createElement('video');
  video.src = url;
  video.controls = true;
  video.playsInline = true;
  const meta = document.createElement('div');
  meta.className = 'meta';
  const title = document.createElement('strong');
  title.textContent = `Clip ${n} · ${fmtTime(clip.start)}–${fmtTime(clip.end)} (${Math.round(clip.end - clip.start)} s)`;
  const snippet = document.createElement('p');
  snippet.className = 'snippet';
  snippet.textContent = clip.text;
  const dl = document.createElement('a');
  dl.className = 'btn primary';
  dl.textContent = 'Descargar';
  dl.href = url;
  dl.download = `clip-${n}.${ext}`;
  meta.append(title, snippet, dl);
  card.append(video, meta);
  $('results').appendChild(card);
}

// ---------- planes y pagos ----------
function renderPlans() {
  if (!cfg) return;
  const grid = $('plansGrid');
  const current = status ? status.plan : null;
  const keys = ['free', 'pro'];
  grid.innerHTML = '';
  keys.forEach((key) => {
    const p = cfg.plans[key];
    const el = document.createElement('div');
    el.className = `plan${key === 'pro' ? ' featured' : ''}`;
    el.innerHTML = `
      <h3>${p.name}</h3>
      <div class="price">${p.priceUSD ? `$${p.priceUSD}` : 'Gratis'}${p.priceUSD ? ' <small>/ mes</small>' : ''}</div>
      <ul>
        <li>${p.minutesPerDay == null ? 'Procesamiento sin límite de plan' : `${p.minutesPerDay} min de video al día`}</li>
        <li>${p.maxVideoMinutes == null ? 'Videos sin límite de duración por plan' : `Videos de hasta ${p.maxVideoMinutes} min`}</li>
        <li>${p.maxClips == null ? 'Clips sin límite' : `Hasta ${p.maxClips} clips por video`}</li>
        <li>${p.qualityLabel}</li>
      </ul>
      <div class="plan-action" id="action-${key}"></div>`;
    grid.appendChild(el);

    const action = el.querySelector('.plan-action');
    if (current === key) {
      action.innerHTML = '<div class="current">Tu plan actual</div>';
    } else if (key === 'free') {
      action.innerHTML = current ? '' : '<a class="btn ghost" style="width:100%" href="#googleSignIn">Empezar gratis</a>';
    } else if (!current) {
      action.innerHTML = '<a class="btn primary" style="width:100%" href="#googleSignIn">Crea tu cuenta para suscribirte</a>';
    } else if (current !== 'free') {
      action.innerHTML = '<p class="small muted">Para cambiar de plan, cancela primero tu suscripción actual en PayPal (Pagos automáticos) y luego elige el nuevo plan.</p>';
    } else if (!cfg.paypalClientId || !cfg.paypalPlanIds[key]) {
      action.innerHTML = '<p class="small muted">Pagos disponibles muy pronto.</p>';
    } else {
      action.innerHTML = `<div id="pp-${key}"></div>`;
    }
  });
  $('plansNote').textContent = 'Pagas con PayPal y puedes cancelar cuando quieras.';
  if (status && status.plan === 'free' && cfg.paypalClientId) mountPayPalButtons();
}

let paypalPromise = null;
function loadPayPal() {
  if (paypalPromise) return paypalPromise;
  paypalPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(cfg.paypalClientId)}&vault=true&intent=subscription&currency=USD`;
    s.onload = () => resolve(window.paypal);
    s.onerror = () => { paypalPromise = null; reject(new Error('No se pudo cargar PayPal.')); };
    document.head.appendChild(s);
  });
  return paypalPromise;
}

async function mountPayPalButtons() {
  let paypal;
  try { paypal = await loadPayPal(); } catch (e) { $('plansNote').textContent = e.message; return; }
  ['pro'].forEach((key) => {
    const box = document.getElementById(`pp-${key}`);
    const planId = cfg.paypalPlanIds[key];
    if (!box || !planId || box.dataset.mounted) return;
    box.dataset.mounted = '1';
    paypal.Buttons({
      style: { shape: 'rect', color: 'gold', layout: 'vertical', label: 'subscribe' },
      createSubscription: (data, actions) => actions.subscription.create({ plan_id: planId, custom_id: session.user.id }),
      onApprove: async (data) => {
        try {
          toast('Activando tu plan…', 6000);
          await confirmSubscription(data.subscriptionID);
        } catch (e) {
          showAlert(e.message);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      },
      onError: () => toast('PayPal no pudo completar el pago. Intenta de nuevo.', 6000),
    }).render(box);
  });
}

async function confirmSubscription(subscriptionId) {
  for (let i = 0; i < 6; i += 1) {
    try {
      const r = await api('/api/paypal-confirm', {
        method: 'POST',
        body: JSON.stringify({ subscriptionId }),
        headers: { 'Content-Type': 'application/json' },
      });
      await loadStatus();
      toast(`¡Plan ${cfg.plans[r.plan].name} activado!`, 6000);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    } catch (e) {
      if (e.status === 409) { await sleep(3000); continue; }
      throw e;
    }
  }
  throw new Error('PayPal todavía no confirma el pago. Recarga la página en un minuto; si ya pagaste y no se activa, escríbenos.');
}

init().catch(() => fatal('No pudimos iniciar el acceso. Recarga la página para volver a intentarlo.'));
