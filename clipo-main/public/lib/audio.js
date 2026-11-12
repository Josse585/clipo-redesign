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

function mixToMono(audioBuffer, maxFrames) {
  const frames = Math.min(audioBuffer.length, maxFrames);
  const out = new Float32Array(frames);
  const channels = audioBuffer.numberOfChannels;
  for (let c = 0; c < channels; c += 1) {
    const data = audioBuffer.getChannelData(c);
    for (let i = 0; i < frames; i += 1) out[i] += data[i] / channels;
  }
  return out;
}

/** Devuelve las muestras de audio (16 kHz, mono) de los primeros `maxSeconds` del archivo. */
export async function decodeToMono16k(file, maxSeconds) {
  let raw;
  try {
    raw = await file.arrayBuffer();
  } catch (e) {
    throw new Error('Este archivo es demasiado pesado para tu navegador. Prueba con un video más pequeño (menos de ~1.5 GB).');
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx;
  try { ctx = new AC({ sampleRate: SAMPLE_RATE }); } catch (e) { ctx = new AC(); }

  let decoded;
  try {
    decoded = await ctx.decodeAudioData(raw);
  } catch (e) {
    throw new Error('No pude leer el audio de este archivo. Usa un video MP4, MOV o WEBM normal.');
  } finally {
    if (ctx.close) ctx.close();
  }

  if (decoded.sampleRate === SAMPLE_RATE) {
    return mixToMono(decoded, Math.floor(maxSeconds * SAMPLE_RATE));
  }
  // Si el navegador no respetó los 16 kHz, convertimos con un contexto "offline" (también baja a mono).
  const frames = Math.ceil(Math.min(decoded.duration, maxSeconds) * SAMPLE_RATE);
  const off = new OfflineAudioContext(1, frames, SAMPLE_RATE);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start(0);
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

/** Parte las muestras en trozos de `chunkSeconds`. Cada trozo es un WAV con su tiempo de inicio. */
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
