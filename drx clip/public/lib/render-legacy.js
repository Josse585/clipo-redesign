import { FramePainter } from './frame-painter.js';
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

function once(target, eventName, timeoutMs = 15000, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); target.removeEventListener(eventName, completed); target.removeEventListener('error', failed); signal?.removeEventListener('abort', aborted); };
    const finish = error => { cleanup(); error ? reject(error) : resolve(); };
    const completed = () => finish();
    const failed = () => finish(new Error('El navegador no puede leer este archivo de video.'));
    const aborted = () => finish(new DOMException('Proceso cancelado.', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('El video tardó demasiado en responder.')), timeoutMs);
    target.addEventListener(eventName, completed, { once: true }); target.addEventListener('error', failed, { once: true });
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted(); else if (target.error) failed();
  });
}
function resumeAudio(context, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); };
    const aborted = () => { cleanup(); reject(new DOMException('Proceso cancelado.', 'AbortError')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('El navegador no permitió iniciar el audio. Vuelve a pulsar Crear mis clips.')); }, 20000);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) { aborted(); return; }
    context.resume().then(() => { cleanup(); resolve(); }, error => { cleanup(); reject(error); });
  });
}
async function seekTo(video, time, signal) {
  if (Math.abs(video.currentTime - time) < .05 && video.readyState >= 2) return;
  const done = once(video, 'seeked', 15000, signal); video.currentTime = time; await done;
}

export class LegacyClipRenderer extends FramePainter {
  constructor(file) {
    super();
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

  async ready(signal) {
    if (this.video.readyState < 1) await once(this.video, 'loadedmetadata', 30000, signal);
  }

  dispose() {
    try { this.video.pause(); } catch (e) { /* nada */ }
    URL.revokeObjectURL(this.url);
    if (this.audioCtx.close) this.audioCtx.close();
  }

  /**
   * Graba un clip.
   * @returns {Promise<{blob: Blob, mime: string}>}
   */
  async render(clip, captions, { width, height, layout = 'fill', watermarkText = '', showCaptions = true, onProgress, signal } = {}) {
    signal?.throwIfAborted();
    const mime = pickMimeType();
    if (!mime) throw new Error('Tu navegador no puede exportar este video. Usa Chrome o Edge actualizado.');
    await this.ready(signal);
    signal?.throwIfAborted();
    if (this.audioCtx.state === 'suspended') await resumeAudio(this.audioCtx, signal);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    const v = this.video;
    await seekTo(v, clip.start, signal);
    signal?.throwIfAborted();
    this.drawFrame(ctx, width, height, layout, captions, clip.start, watermarkText, showCaptions);
    const stream = canvas.captureStream(30);
    this.audioDest.stream.getAudioTracks().forEach(track => stream.addTrack(track));
    const parts = [];
    let recorder, raf = 0, timer, settled = false;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.min(width, height) >= 1000 ? 8000000 : 5000000, audioBitsPerSecond: 128000 });
      await new Promise((resolve, reject) => {
        let lastTime = v.currentTime, lastAdvance = performance.now(), finishingAt = 0;
        const cleanup = () => { clearInterval(timer); cancelAnimationFrame(raf); signal?.removeEventListener('abort', aborted); v.removeEventListener('error', failed); v.removeEventListener('ended', finishRecording); };
        const fail = error => { if (settled) return; settled = true; cleanup(); reject(error); };
        const aborted = () => fail(new DOMException('Proceso cancelado.', 'AbortError'));
        const failed = () => fail(new Error('Se interrumpió la lectura del video. Vuelve a intentarlo con un MP4.'));
        const finishRecording = () => {
          if (finishingAt || settled) return;
          finishingAt = performance.now(); v.pause();
          if (recorder.state !== 'inactive') recorder.stop();
          else fail(new Error('La grabación se detuvo antes de terminar.'));
        };
        const draw = () => {
          if (settled || finishingAt) return;
          if (v.currentTime >= clip.end || v.ended) { finishRecording(); return; }
          this.drawFrame(ctx, width, height, layout, captions, v.currentTime, watermarkText, showCaptions);
          onProgress?.(Math.min(.99, (v.currentTime - clip.start) / (clip.end - clip.start)));
          raf = requestAnimationFrame(draw);
        };
        recorder.ondataavailable = event => { if (event.data.size) parts.push(event.data); };
        recorder.onerror = () => fail(new Error('El navegador no pudo grabar el clip. Inténtalo con otro formato.'));
        recorder.onstop = () => { if (settled) return; settled = true; cleanup(); resolve(); };
        signal?.addEventListener('abort', aborted, { once: true });
        v.addEventListener('error', failed, { once: true });
        v.addEventListener('ended', finishRecording, { once: true });
        timer = setInterval(() => {
          if (settled) return;
          const now = performance.now();
          if (finishingAt) { if (now - finishingAt > 20000) fail(new Error('El navegador no pudo finalizar el clip.')); return; }
          if (v.currentTime > lastTime + .01) { lastAdvance = now; lastTime = v.currentTime; }
          if (document.hidden) { fail(new Error('La exportación de compatibilidad necesita la pestaña visible. Vuelve a intentarlo sin cambiar de aplicación.')); return; }
          if (now - lastAdvance > 20000) { fail(new Error('El video dejó de avanzar. Vuelve a intentarlo sin bloquear la pantalla.')); return; }
          if (v.currentTime >= clip.end || v.ended) finishRecording();
        }, 250);
        if (signal?.aborted) { aborted(); return; }
        recorder.start(500);
        v.play().then(draw).catch(() => fail(new Error('El navegador bloqueó la reproducción. Vuelve a pulsar Crear mis clips.')));
      });
      const blob = new Blob(parts, { type: mime.split(';')[0] });
      if (!blob.size) throw new Error('La grabación no produjo un archivo.');
      onProgress?.(1);
      return { blob, mime, mode: 'compatibility' };
    } finally {
      clearInterval(timer); cancelAnimationFrame(raf); v.pause();
      if (recorder?.state !== 'inactive') { try { recorder?.stop(); } catch {} }
      stream.getVideoTracks().forEach(track => track.stop());
    }
  }
}
