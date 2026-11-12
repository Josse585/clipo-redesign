const $ = (id) => document.getElementById(id);
const menu = $('menuToggle');
menu.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  $('mobileNav').hidden = !open;
});
function closeMenu() { menu.setAttribute('aria-expanded', 'false'); menu.setAttribute('aria-label', 'Abrir menú'); $('mobileNav').hidden = true; }
$('mobileNav').addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
const canvas = $('previewCanvas');
document.querySelectorAll('[data-style]').forEach(button => {
  if (!button.matches('button')) return;
  button.addEventListener('click', () => {
    canvas.dataset.style = button.dataset.style;
    document.querySelectorAll('.style-option').forEach(option => {
      const selected = option === button;
      option.classList.toggle('selected', selected);
      option.setAttribute('aria-pressed', String(selected));
    });
  });
});
$('demoFormat').addEventListener('change', e => { canvas.dataset.format = e.target.value; });
$('demoCaptions').addEventListener('change', e => { $('sampleCaptions').hidden = !e.target.checked; });
const samples = ['Tu historia<br>merece <mark>verse.</mark>', 'Una idea.<br><mark>Muchos momentos.</mark>', 'Dale voz<br>a lo que <mark>creas.</mark>'];
const video = $('demoVideo');
const scrub = $('demoScrub');
let playing = false, frame = 0, last = 0, position = 0, localUrl = null;
const time = s => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(Math.floor(s % 60)).padStart(2,'0')}`;
function updateTime(value) {
  position = value;
  scrub.value = String(value); $('demoTime').textContent = time(value);
  $('sampleCaptions').innerHTML = samples[Math.floor(value / 4) % samples.length];
  scrub.style.setProperty('--progress', `${value / Number(scrub.max) * 100}%`);
}
function setPlaying(value) {
  playing = value;
  $('demoPlay').setAttribute('aria-label', value ? 'Pausar vista previa' : 'Reproducir vista previa');
  $('demoPlay').innerHTML = value ? '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg>';
  if (!value) { cancelAnimationFrame(frame); if (localUrl) video.pause(); }
}
function tick(now) {
  if (!playing) return;
  const next = localUrl ? video.currentTime : position + (now - last) / 1000;
  last = now; updateTime(Math.min(next, Number(scrub.max)));
  if (next >= Number(scrub.max)) { setPlaying(false); return; }
  frame = requestAnimationFrame(tick);
}
$('demoPlay').addEventListener('click', async () => {
  if (playing) { setPlaying(false); return; }
  if (Number(scrub.value) >= Number(scrub.max)) { updateTime(0); if (localUrl) video.currentTime = 0; }
  if (localUrl) { try { await video.play(); } catch { $('previewHint').textContent = 'No se puede reproducir. Prueba con un MP4.'; return; } }
  setPlaying(true); last = performance.now(); frame = requestAnimationFrame(tick);
});
scrub.addEventListener('input', () => { updateTime(Number(scrub.value)); if (localUrl) video.currentTime = Number(scrub.value); });
$('previewFile').addEventListener('change', e => {
  const file = e.target.files?.[0]; if (!file) return;
  if (!file.type.startsWith('video/')) { $('previewHint').textContent = 'Elige un archivo de video compatible.'; return; }
  setPlaying(false); if (localUrl) URL.revokeObjectURL(localUrl);
  localUrl = URL.createObjectURL(file); video.src = localUrl;
  video.onloadedmetadata = () => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) { video.onerror(); return; }
    video.hidden = false; canvas.querySelector('img').hidden = true;
    scrub.max = String(video.duration); updateTime(0);
    $('demoDuration').textContent = time(video.duration);
    $('canvasTag').textContent = 'TU VIDEO · SOLO EN TU DISPOSITIVO';
    $('previewHint').textContent = 'Subtítulos de ejemplo · Tu video no se sube.';
  };
  video.onerror = () => {
    setPlaying(false); video.hidden = true; canvas.querySelector('img').hidden = false;
    URL.revokeObjectURL(localUrl); localUrl = null; video.removeAttribute('src');
    scrub.max = '12'; updateTime(0); $('demoDuration').textContent = '00:12';
    $('canvasTag').textContent = 'EJEMPLO DE ESTILO';
    $('previewHint').textContent = 'No se pudo abrir. Prueba con otro MP4.';
  };
});
video.addEventListener('ended', () => setPlaying(false));
document.addEventListener('visibilitychange', () => { if (document.hidden) setPlaying(false); });
window.addEventListener('pagehide', () => { if (localUrl) URL.revokeObjectURL(localUrl); });
// Native details retain keyboard support; keep the FAQ easy to scan.
document.querySelectorAll('.faq-list details').forEach(detail => detail.addEventListener('toggle', () => {
  if (detail.open) document.querySelectorAll('.faq-list details').forEach(other => { if (other !== detail) other.open = false; });
}));

// Scroll and pointer parallax: one frame per input, no permanent animation loop.
const scene = $('heroScene');
if (scene) {
  const planes = [...scene.querySelectorAll('[data-depth]')];
  const motionButton = $('sceneMotion');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let motionPaused = false, sceneVisible = true, pendingFrame = 0, pointerX = 0, pointerY = 0;
  function drawScene() {
    pendingFrame = 0;
    const still = motionPaused || reducedMotion.matches || !sceneVisible || document.hidden;
    const rect = scene.getBoundingClientRect();
    const progress = Math.max(-1, Math.min(1, (innerHeight * .5 - (rect.top + rect.height * .5)) / innerHeight));
    planes.forEach(plane => {
      const depth = Number(plane.dataset.depth);
      plane.style.setProperty('--px', still ? '0px' : `${(pointerX * depth * 7).toFixed(2)}px`);
      plane.style.setProperty('--py', still ? '0px' : `${(progress * depth * -45 + pointerY * depth * 5).toFixed(2)}px`);
    });
  }
  function requestScene() { if (!pendingFrame) pendingFrame = requestAnimationFrame(drawScene); }
  window.addEventListener('scroll', () => { if (sceneVisible) requestScene(); }, {passive:true});
  window.addEventListener('resize', requestScene, {passive:true});
  scene.addEventListener('pointermove', e => {
    if (!finePointer.matches || motionPaused || reducedMotion.matches) return;
    const rect = scene.getBoundingClientRect();
    pointerX = (e.clientX - rect.left) / rect.width * 2 - 1;
    pointerY = (e.clientY - rect.top) / rect.height * 2 - 1;
    requestScene();
  }, {passive:true});
  scene.addEventListener('pointerleave', () => { pointerX = pointerY = 0; requestScene(); });
  function syncMotionButton() {
    const paused = motionPaused || reducedMotion.matches;
    motionButton.setAttribute('aria-pressed', String(paused));
    motionButton.setAttribute('aria-label', reducedMotion.matches ? 'Parallax desactivado por tu preferencia de movimiento reducido' : paused ? 'Activar el parallax' : 'Pausar el parallax');
    motionButton.disabled = reducedMotion.matches;
    motionButton.innerHTML = paused ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m9 5 9 7-9 7z"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
    requestScene();
  }
  motionButton.addEventListener('click', () => { motionPaused = !motionPaused; syncMotionButton(); });
  reducedMotion.addEventListener('change', syncMotionButton);
  document.addEventListener('visibilitychange', requestScene);
  const visibility = new IntersectionObserver(entries => { sceneVisible = entries[0].isIntersecting; requestScene(); }, {rootMargin:'80px'});
  visibility.observe(scene);
  scene.querySelectorAll('[data-scene-mode]').forEach(button => button.addEventListener('click', () => {
    scene.dataset.scene = button.dataset.sceneMode;
    scene.querySelectorAll('[data-scene-mode]').forEach(option => option.setAttribute('aria-pressed', String(option === button)));
    requestScene();
  }));
  syncMotionButton();
}
