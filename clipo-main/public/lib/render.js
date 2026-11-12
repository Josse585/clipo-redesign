// Crea cada clip vertical (9:16) con subtítulos animados, todo en el navegador.
// Reproduce el fragmento sobre un <canvas> y lo graba con MediaRecorder,
// así no hace falta instalar nada ni pagar servidores de video.
// Importante: la grabación va en tiempo real (un clip de 40 s tarda ~40 s) y la pestaña debe seguir visible.

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) || null;
}

export function extensionFor(mime) {
  return mime && mime.startsWith('video/mp4') ? 'mp4' : 'webm';
}

function once(target, eventName, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { target.removeEventListener(eventName, onEvent); reject(new Error('El video tardó demasiado en responder.')); }, timeoutMs);
    function onEvent() { clearTimeout(timer); resolve(); }
    target.addEventListener(eventName, onEvent, { once: true });
  });
}

async function seekTo(video, time) {
  if (Math.abs(video.currentTime - time) < 0.05 && video.readyState >= 2) return;
  const done = once(video, 'seeked');
  video.currentTime = time;
  await done;
}

export class ClipRenderer {
  constructor(file) {
    this.url = URL.createObjectURL(file);
    this.video = document.createElement('video');
    this.video.src = this.url;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.setAttribute('playsinline', '');

    const AC = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = new AC();
    this.audioDest = this.audioCtx.createMediaStreamDestination();
    this.audioSource = this.audioCtx.createMediaElementSource(this.video); // solo va a la grabadora, no a los parlantes
    this.audioSource.connect(this.audioDest);
  }

  async ready() {
    if (this.video.readyState < 1) await once(this.video, 'loadedmetadata', 30000);
  }

  dispose() {
    try { this.video.pause(); } catch (e) { /* nada */ }
    URL.revokeObjectURL(this.url);
    if (this.audioCtx.close) this.audioCtx.close();
  }

  drawFrame(ctx, w, h, layout, captions, t, watermarkText) {
    const v = this.video;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const target = w / h;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // recorte central que llena toda la pantalla vertical
    let sw; let sh; let sx; let sy;
    if (vw / vh > target) { sh = vh; sw = vh * target; sx = (vw - sw) / 2; sy = 0; }
    else { sw = vw; sh = vw / target; sx = 0; sy = (vh - sh) / 2; }

    if (layout === 'fit' && vw / vh > target) {
      // video completo al centro con fondo difuminado
      ctx.save();
      ctx.filter = 'blur(24px) brightness(0.6)';
      ctx.drawImage(v, sx, sy, sw, sh, -40, -40, w + 80, h + 80);
      ctx.restore();
      const dh = w * (vh / vw);
      ctx.drawImage(v, 0, 0, vw, vh, 0, (h - dh) / 2, w, dh);
    } else {
      ctx.drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
    }

    this.drawCaption(ctx, w, h, captions, t);
    if (watermarkText) this.drawWatermark(ctx, w, h, watermarkText);
  }

  drawCaption(ctx, w, h, captions, t) {
    const chunk = captions.find((c) => t >= c.start && t < c.end);
    if (!chunk) return;
    const words = chunk.words.map((x) => x.text.toUpperCase());
    let size = Math.round(w * 0.085);
    const family = '"Arial Black", Impact, "Helvetica Neue", Arial, sans-serif';
    const maxWidth = w * 0.9;
    let total;
    do {
      ctx.font = `900 ${size}px ${family}`;
      total = ctx.measureText(words.join(' ')).width;
      if (total > maxWidth) size -= 2;
    } while (total > maxWidth && size > 20);

    const space = ctx.measureText(' ').width;
    let x = (w - total) / 2;
    const y = h * 0.68;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, size * 0.2);
    ctx.strokeStyle = '#000';
    words.forEach((word, k) => {
      const active = t >= chunk.words[k].start && t < chunk.words[k].end + 0.05;
      ctx.strokeText(word, x, y);
      ctx.fillStyle = active ? '#FFD400' : '#FFFFFF';
      ctx.fillText(word, x, y);
      x += ctx.measureText(word).width + space;
    });
  }

  drawWatermark(ctx, w, h, text) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.font = `700 ${Math.round(w * 0.04)}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText(text, w / 2, h * 0.06);
    ctx.fillText(text, w / 2, h * 0.06);
    ctx.restore();
  }

  /**
   * Graba un clip.
   * @returns {Promise<{blob: Blob, mime: string}>}
   */
  async render(clip, captions, { width, height, layout = 'fill', watermarkText = '', onProgress } = {}) {
    const mime = pickMimeType();
    if (!mime) throw new Error('Tu navegador no puede grabar video. Usa Chrome o Edge actualizado.');
    await this.ready();
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume();

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const v = this.video;

    await seekTo(v, clip.start);
    this.drawFrame(ctx, width, height, layout, captions, clip.start, watermarkText);

    const stream = canvas.captureStream(30);
    const videoTrack = stream.getVideoTracks()[0];
    this.audioDest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));

    const bitrate = width >= 1000 ? 8_000_000 : width >= 700 ? 5_000_000 : 3_000_000;
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 128_000 });
    const parts = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    const stopped = new Promise((resolve) => { recorder.onstop = resolve; });

    recorder.start(500);
    await v.play();

    await new Promise((resolve) => {
      const loop = () => {
        const t = v.currentTime;
        if (t >= clip.end || v.ended) { resolve(); return; }
        this.drawFrame(ctx, width, height, layout, captions, t, watermarkText);
        if (onProgress) onProgress(Math.min(1, (t - clip.start) / (clip.end - clip.start)));
        requestAnimationFrame(loop);
      };
      loop();
    });

    v.pause();
    recorder.stop();
    await stopped;
    if (videoTrack) videoTrack.stop(); // el audio NO se detiene: se reutiliza en el siguiente clip

    return { blob: new Blob(parts, { type: mime.split(';')[0] }), mime };
  }
}
