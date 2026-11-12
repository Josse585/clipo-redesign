// Lógica pura (sin navegador): elegir los mejores momentos y preparar los subtítulos.
// No usa IA de pago: puntúa cada fragmento con señales simples (preguntas, frases gancho,
// cifras, ritmo al hablar). Se puede mejorar después sin tocar el resto de la app.

const HOOK_WORDS = new Set([
  // español
  'secreto', 'error', 'errores', 'nadie', 'nunca', 'siempre', 'verdad', 'mentira', 'increíble', 'increible',
  'importante', 'clave', 'problema', 'solución', 'solucion', 'dinero', 'gratis', 'cuidado', 'peligro',
  'miedo', 'cambió', 'cambio', 'descubrí', 'descubri', 'aprendí', 'aprendi', 'imagina', 'imagínate',
  'resultado', 'resultados', 'consejo', 'truco', 'razón', 'razon', 'historia', 'ejemplo', 'primero',
  // inglés
  'secret', 'mistake', 'mistakes', 'nobody', 'never', 'always', 'truth', 'lie', 'incredible', 'important',
  'key', 'problem', 'solution', 'money', 'free', 'careful', 'danger', 'fear', 'changed', 'discovered',
  'learned', 'imagine', 'result', 'results', 'tip', 'trick', 'reason', 'story', 'example', 'first',
]);

const HOOK_PHRASES = [
  'lo que nadie', 'el secreto', 'la verdad', 'te voy a contar', 'por qué', 'por que', 'cómo ', 'como lograr',
  'lo más importante', 'lo mas importante', 'el error', 'what nobody', 'the secret', 'the truth',
  'here\'s why', 'the biggest', 'how to',
];

const SENTENCE_END = /[.!?…]["')\]]?\s*$/;

function countMatches(text, regex) {
  const m = text.match(regex);
  return m ? m.length : 0;
}

export function scoreText(text, duration) {
  const t = text.toLowerCase();
  const tokens = t.match(/[\p{L}\p{N}']+/gu) || [];
  let score = 0;
  score += 2 * countMatches(t, /\?/g);
  score += 1 * countMatches(t, /!/g);
  let hooks = 0;
  for (const w of tokens) if (HOOK_WORDS.has(w)) hooks += 1;
  for (const p of HOOK_PHRASES) if (t.includes(p)) hooks += 1.5;
  score += 1.2 * hooks;
  score += 0.5 * countMatches(t, /\d+/g);
  const density = tokens.length / Math.max(duration, 1); // palabras por segundo
  score += Math.min(density, 4) * 1.5;
  const firstWords = tokens.slice(0, 12).join(' ');
  if (/\?/.test(t.slice(0, 120)) || HOOK_PHRASES.some((p) => firstWords.includes(p))) score += 3; // empieza con gancho
  return score / Math.sqrt(Math.max(duration, 1));
}

function buildCandidates(segments, minLen, maxLen) {
  const out = [];
  for (let i = 0; i < segments.length; i += 1) {
    let text = '';
    for (let j = i; j < segments.length; j += 1) {
      const start = segments[i].start;
      const end = segments[j].end;
      const dur = end - start;
      if (dur > maxLen) break;
      text += ` ${segments[j].text || ''}`;
      if (dur < minLen) continue;
      let score = scoreText(text, dur);
      const startsClean = i === 0 || SENTENCE_END.test(segments[i - 1].text || '');
      const endsClean = SENTENCE_END.test(segments[j].text || '');
      if (startsClean) score += 0.4;
      if (endsClean) score += 0.4;
      out.push({ i, j, start, end, dur, score, text: text.trim() });
    }
  }
  return out;
}

/**
 * Elige los mejores clips que no se pisen entre sí.
 * @param segments  [{start,end,text}] en segundos del video completo
 * @param opts      {count, minLen, maxLen, videoDuration}
 */
export function pickClips(segments, opts = {}) {
  const { count = 5, minLen = 20, maxLen = 45, videoDuration = Infinity } = opts;
  const segs = (segments || []).filter((s) => s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start);
  if (!segs.length) return [];

  let cands = buildCandidates(segs, minLen, maxLen);
  if (!cands.length) cands = buildCandidates(segs, Math.min(minLen, 8), Math.max(maxLen, 30)); // video corto
  if (!cands.length) {
    const start = segs[0].start;
    const end = segs[segs.length - 1].end;
    cands = [{ start, end, dur: end - start, score: 0, text: segs.map((s) => s.text).join(' ').trim() }];
  }

  cands.sort((a, b) => b.score - a.score);
  const chosen = [];
  for (const c of cands) {
    if (chosen.length >= count) break;
    const overlaps = chosen.some((k) => c.start < k.end + 2 && c.end > k.start - 2);
    if (!overlaps) chosen.push(c);
  }

  return chosen.map((c, idx) => {
    const start = Math.max(0, c.start - 0.15);
    return {
      rank: idx + 1,
      start,
      end: Math.min(videoDuration, c.end + 0.25, start + maxLen),
      score: Math.round(c.score * 100) / 100,
      text: c.text,
    };
  });
}

/** Si Whisper no devolvió palabras sueltas, las reparte uniformemente dentro de cada segmento. */
export function fallbackWords(segments) {
  const words = [];
  for (const s of segments) {
    const toks = String(s.text || '').trim().split(/\s+/).filter(Boolean);
    if (!toks.length) continue;
    const step = (s.end - s.start) / toks.length;
    toks.forEach((w, k) => words.push({ word: w, start: s.start + k * step, end: s.start + (k + 1) * step }));
  }
  return words;
}

/**
 * Agrupa las palabras del clip en subtítulos cortos de 2-3 palabras.
 * Devuelve [{start,end,words:[{text,start,end}]}] con tiempos del video original.
 */
export function buildCaptions(words, clipStart, clipEnd, perChunk = 3) {
  const inClip = (words || [])
    .filter((w) => w && String(w.word || '').trim() && w.start >= clipStart - 0.05 && w.end <= clipEnd + 0.05)
    .map((w) => ({ text: String(w.word).trim(), start: w.start, end: w.end }));

  const chunks = [];
  let cur = [];
  const flush = () => {
    if (cur.length) chunks.push({ start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
    cur = [];
  };
  for (const w of inClip) {
    const prev = cur[cur.length - 1];
    if (prev && w.start - prev.end > 0.8) flush(); // pausa larga: nuevo subtítulo
    cur.push(w);
    const endsSentence = /[.!?,;:…]$/.test(w.text);
    if (cur.length >= perChunk || (endsSentence && cur.length >= 2)) flush();
  }
  flush();

  // que cada subtítulo se quede hasta que empiece el siguiente (máximo 0.4 s tras su última palabra)
  for (let k = 0; k < chunks.length; k += 1) {
    const nextStart = k + 1 < chunks.length ? chunks[k + 1].start : Infinity;
    chunks[k].end = Math.min(chunks[k].end + 0.4, nextStart);
  }
  return chunks;
}

export const CLIP_LENGTHS = {
  short: { minLen: 15, maxLen: 30, label: 'Cortos (15–30 s)' },
  medium: { minLen: 30, maxLen: 60, label: 'Medios (30–60 s)' },
  long: { minLen: 40, maxLen: 90, label: 'Largos (40–90 s)' },
};
