export const OUTPUT_FORMATS = {
  vertical: { label: 'Vertical · 9:16', ratio: 9 / 16 },
  square: { label: 'Cuadrado · 1:1', ratio: 1 },
  horizontal: { label: 'Horizontal · 16:9', ratio: 16 / 9 },
};
export function outputDimensions(format = 'vertical', shortSide = 720) {
  if (!OUTPUT_FORMATS[format] || ![720,1080].includes(shortSide)) throw new Error('Elige un formato y una calidad válidos.');
  const longSide = shortSide === 1080 ? 1920 : 1280;
  return format === 'square' ? { width: shortSide, height: shortSide } : format === 'horizontal' ? { width: longSide, height: shortSide } : { width: shortSide, height: longSide };
}
export function clipCountChoices(maxClips) {
  const values = maxClips == null ? [1,2,3,5,8,10,15,20,30,50,100] : [1,2,3,5,8,10,15,20,30,50,100].filter(n=>n<=maxClips);
  if (maxClips != null && !values.includes(maxClips) && maxClips > 0) values.push(maxClips);
  return values.sort((a,b)=>a-b);
}
export function resolveClipCount(value, maxClips, duration, minLength) {
  const available = Math.max(1, Math.floor(duration / minLength));
  const requested = value === 'max' ? available : Number(value);
  if (!Number.isInteger(requested) || requested < 1) throw new Error('Elige cuántos clips quieres crear.');
  return Math.min(requested, maxClips ?? Infinity, available);
}
export function manualClipRanges({ start, end, duration, value, maxClips, length }) {
  if (![start,end,duration].every(Number.isFinite) || start < 0 || end <= start || end > duration + .05 || end-start > length.maxLen+.05) throw new Error(`Elige un fragmento de hasta ${length.maxLen} segundos dentro del video.`);
  const available = duration-start, wantedSpan = Math.min(end-start,length.maxLen);
  const count = resolveClipCount(value,maxClips,available,Math.min(length.minLen,wantedSpan));
  const span = Math.min(wantedSpan,available/count);
  return Array.from({length:count},(_,i)=>({start:start+i*span,end:Math.min(duration,start+(i+1)*span)}));
}
