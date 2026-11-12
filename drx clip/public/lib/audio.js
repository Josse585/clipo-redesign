// Saca el audio del video EN EL NAVEGADOR del cliente (no gasta tu servidor),
// lo pasa a 16 kHz mono y lo parte en trozos WAV listos para transcribir.

export const SAMPLE_RATE = 16000;

export function encodeWav(samples, rate = SAMPLE_RATE) {
  const n = samples.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i += 1) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);       // tamaño del bloque fmt
  view.setUint16(20, 1, true);        // PCM
  view.setUint16(22, 1, true);        // 1 canal
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // bytes por segundo
  view.setUint16(32, 2, true);        // bytes por muestra
  view.setUint16(34, 16, true);       // bits
  writeStr(36, 'data');
  view.setUint32(40, n * 2, true);
  let off = 44;
  for (let i = 0; i < n; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}


async function decodeStreaming(file, maxSeconds, { signal, onProgress } = {}) {
  signal?.throwIfAborted();
  const video = document.createElement('video');
  const url = URL.createObjectURL(file);
  video.src = url; video.preload = 'auto'; video.playsInline = true;
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx, source, processor, gain, timer;
  let total = 0;
  const blocks = [];
  const maxSamples = Math.max(1, Math.floor(maxSeconds * SAMPLE_RATE));
  try {
    if (!AC) throw new Error('Tu navegador no permite extraer el audio. Prueba con Chrome o Edge actualizado.');
    ctx = new AC(); source = ctx.createMediaElementSource(video);
    processor = ctx.createScriptProcessor(4096, 2, 1); gain = ctx.createGain(); gain.gain.value = 0;
    source.connect(processor); processor.connect(gain); gain.connect(ctx.destination);
    await new Promise((resolve, reject) => {
      let done = false, lastSamples = 0, lastAdvance = performance.now();
      const cleanup = () => { clearInterval(timer); signal?.removeEventListener('abort', aborted); video.removeEventListener('ended', ended); video.removeEventListener('error', failed); };
      const finish = error => { if (done) return; done = true; cleanup(); video.pause(); error ? reject(error) : resolve(); };
      const ended = () => finish();
      const failed = () => finish(new Error('No se pudo leer el audio. Prueba con un MP4 H.264 con audio AAC.'));
      const aborted = () => finish(new DOMException('Proceso cancelado.', 'AbortError'));
      processor.onaudioprocess = event => {
        if (done || total >= maxSamples) return;
        const input = event.inputBuffer;
        const left = input.getChannelData(0), right = input.numberOfChannels > 1 ? input.getChannelData(1) : left;
        const count = Math.min(Math.ceil(input.length * SAMPLE_RATE / input.sampleRate), maxSamples - total);
        const block = new Float32Array(count);
        for (let i = 0; i < count; i++) {
          const pos = i * input.sampleRate / SAMPLE_RATE, a = Math.min(input.length - 1, Math.floor(pos)), b = Math.min(input.length - 1, a + 1), f = pos - a;
          block[i] = (left[a] + (left[b] - left[a]) * f + right[a] + (right[b] - right[a]) * f) * .5;
        }
        blocks.push(block); total += count;
        if (total >= maxSamples) finish();
      };
      video.addEventListener('ended', ended, { once: true }); video.addEventListener('error', failed, { once: true });
      signal?.addEventListener('abort', aborted, { once: true });
      timer = setInterval(() => {
        if (total > lastSamples) { lastSamples = total; lastAdvance = performance.now(); }
        onProgress?.(Math.min(.99, total / maxSamples));
        if (performance.now() - lastAdvance > 20000) finish(new Error('La lectura de audio dejó de avanzar. Mantén la pantalla activa y vuelve a intentarlo.'));
      }, 250);
      if (signal?.aborted) { aborted(); return; }
      Promise.resolve(ctx.resume()).then(() => { if (!done) return video.play(); }).catch(() => finish(new Error('No se pudo iniciar el audio. Vuelve a pulsar Crear mis clips.')));
    });
    if (!total) throw new Error('Este video no tiene audio utilizable.');
    const samples = new Float32Array(total);
    let offset = 0; for (const block of blocks) { samples.set(block, offset); offset += block.length; }
    onProgress?.(1); return samples;
  } finally {
    clearInterval(timer); video.pause();
    if (processor) { processor.onaudioprocess = null; processor.disconnect(); }
    source?.disconnect(); gain?.disconnect();
    await ctx?.close().catch(() => {});
    video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url);
  }
}

// File size never selects a slower path: try incremental audio decoding first.
export async function decodeToMono16k(file, maxSeconds, options = {}) {
  if (!Number.isFinite(maxSeconds) || maxSeconds <= 0) throw new Error('La duración de audio no es válida.');
  options.signal?.throwIfAborted();
  if (typeof Worker !== 'undefined') {
    try {
      const { runMediaTask } = await import('./media-task.js');
      const samples = await runMediaTask('audio', { file, maxSeconds }, options);
      options.onProgress?.(1); return samples;
    } catch (error) {
      if (error.name === 'AbortError' || options.signal?.aborted) throw error;
      if (error.code !== 'unsupported') throw error;
    }
  }
  options.onMode?.('compatibility');
  return decodeStreaming(file, maxSeconds, options);
}

export function splitIntoChunks(samples, chunkSeconds) {
  const size = Math.floor(chunkSeconds * SAMPLE_RATE);
  const chunks = [];
  for (let start = 0; start < samples.length; start += size) {
    const slice = samples.subarray(start, Math.min(samples.length, start + size));
    if (slice.length < SAMPLE_RATE * 0.5) continue; // ignora restos de menos de medio segundo
    chunks.push({ offset: start / SAMPLE_RATE, blob: encodeWav(slice) });
  }
  return chunks;
}
