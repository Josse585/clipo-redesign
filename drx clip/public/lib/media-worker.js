import { Input, BlobSource, ALL_FORMATS, Output, BufferTarget, Mp4OutputFormat, WebMOutputFormat, WavOutputFormat, Conversion, canEncodeVideo, canEncodeAudio } from '../vendor/mediabunny-1.65.2.mjs';
import { FramePainter } from './frame-painter.js';
let lastProgress = -1;
function progress(value) {
  value = Math.max(0, Math.min(.99, value));
  if (value - lastProgress >= .005) { lastProgress = value; postMessage({ type: 'progress', value }); }
}
function unsupported(message) { const error = new Error(message); error.code = 'unsupported'; return error; }
function parseMonoWav(buffer) {
  const view = new DataView(buffer);
  let offset = 12, dataOffset = 0, dataSize = 0, channels = 0, rate = 0, bits = 0, format = 0;
  while (offset + 8 <= view.byteLength) {
    const type = String.fromCharCode(...new Uint8Array(buffer, offset, 4));
    const size = view.getUint32(offset + 4, true);
    if (type === 'fmt ') { format = view.getUint16(offset + 8, true); channels = view.getUint16(offset + 10, true); rate = view.getUint32(offset + 12, true); bits = view.getUint16(offset + 22, true); }
    if (type === 'data') { dataOffset = offset + 8; dataSize = Math.min(size, view.byteLength - dataOffset); break; }
    offset += 8 + size + size % 2;
  }
  if (!dataOffset || format !== 1 || channels !== 1 || rate !== 16000 || bits !== 16) throw new Error('El audio convertido no tiene el formato esperado.');
  const samples = new Float32Array(Math.floor(dataSize / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(dataOffset + i * 2, true) / 32768;
  if (!samples.length) throw new Error('Este video no tiene audio utilizable.');
  return samples;
}
async function extract(input, maxSeconds) {
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error('Este video no tiene pista de audio.');
  if (!(await track.canDecode())) throw unsupported('El navegador no admite el audio de este archivo.');
  const target = new BufferTarget();
  const output = new Output({ format: new WavOutputFormat(), target });
  const conversion = await Conversion.init({ input, output, tracks: 'primary', trim: { start: 0, end: maxSeconds }, video: { discard: true }, audio: { codec: 'pcm-s16', sampleRate: 16000, numberOfChannels: 1, forceTranscode: true }, showWarnings: false });
  if (!conversion.isValid || !conversion.utilizedTracks.includes(track)) throw unsupported('No se pudo decodificar la pista de audio.');
  conversion.onProgress = progress;
  postMessage({ type: 'mode', value: 'incremental' });
  await conversion.execute();
  const samples = parseMonoWav(target.buffer);
  postMessage({ type: 'done', result: samples }, [samples.buffer]);
}
async function render(input, clip, captions, options) {
  if (typeof OffscreenCanvas === 'undefined' || typeof VideoEncoder === 'undefined') throw unsupported('La exportación rápida no está disponible en este navegador.');
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  if (!video || !(await video.canDecode()) || (audio && !(await audio.canDecode()))) throw unsupported('El navegador no admite la decodificación de este archivo.');
  const { width, height, layout = 'fill', watermarkText = '', showCaptions = true } = options;
  const bitrate = Math.min(width, height) >= 1000 ? 8000000 : Math.min(width, height) >= 700 ? 5000000 : 3000000;
  let format, videoCodec, audioCodec, mime;
  if (await canEncodeVideo('avc', { width, height, bitrate }) && (!audio || await canEncodeAudio('aac', { sampleRate: 48000, numberOfChannels: 2 }))) {
    format = new Mp4OutputFormat({ fastStart: 'in-memory' }); videoCodec = 'avc'; audioCodec = 'aac'; mime = 'video/mp4';
  } else if (await canEncodeVideo('vp8', { width, height, bitrate }) && (!audio || await canEncodeAudio('opus', { sampleRate: 48000, numberOfChannels: 2 }))) {
    format = new WebMOutputFormat(); videoCodec = 'vp8'; audioCodec = 'opus'; mime = 'video/webm';
  } else { throw unsupported('No hay un codificador rápido compatible en este navegador.'); }
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false });
  const painter = new FramePainter();
  const target = new BufferTarget();
  const output = new Output({ format, target });
  const conversion = await Conversion.init({ input, output, tracks: 'primary', trim: { start: clip.start, end: clip.end },
    video: { codec: videoCodec, bitrate, forceTranscode: true, allowTransformationMetadata: false, processedWidth: width, processedHeight: height,
      process: sample => { painter.drawSample(ctx, sample, width, height, layout, captions, clip.start + sample.timestamp, watermarkText, showCaptions); return canvas; } },
    audio: { codec: audioCodec, bitrate: 128000, sampleRate: 48000, numberOfChannels: 2 }, showWarnings: false });
  if (!conversion.isValid || !conversion.utilizedTracks.includes(video) || (audio && !conversion.utilizedTracks.includes(audio))) throw unsupported('No se pueden exportar todas las pistas de este archivo.');
  conversion.onProgress = progress;
  postMessage({ type: 'mode', value: 'webcodecs' });
  await conversion.execute();
  postMessage({ type: 'done', result: { blob: new Blob([target.buffer], { type: mime }), mime, mode: 'webcodecs' } });
}
self.onmessage = async ({ data }) => {
  let input;
  try {
    input = new Input({ source: new BlobSource(data.file), formats: ALL_FORMATS });
    if (data.task === 'audio') await extract(input, data.maxSeconds);
    else if (data.task === 'render') await render(input, data.clip, data.captions, data.options);
    else throw new Error('Operación de video desconocida.');
  } catch (error) { postMessage({ type: 'error', message: error.message || 'No se pudo procesar el archivo.', code: error.code }); }
  finally { input?.dispose(); }
};
