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

// Accessible explainer tabs: users choose a step; no timed carousel.
const welcomeSteps=[...document.querySelectorAll('[data-welcome-step]')];
function selectWelcomeStep(button,focus=false){
 welcomeSteps.forEach(item=>{const selected=item===button;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;document.getElementById(item.getAttribute('aria-controls')).hidden=!selected;});
 if(focus)button.focus();
}
welcomeSteps.forEach((button,index)=>{
 button.addEventListener('click',()=>selectWelcomeStep(button));
 button.addEventListener('keydown',event=>{let next;if(event.key==='ArrowDown'||event.key==='ArrowRight')next=(index+1)%welcomeSteps.length;else if(event.key==='ArrowUp'||event.key==='ArrowLeft')next=(index-1+welcomeSteps.length)%welcomeSteps.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=welcomeSteps.length-1;if(next!==undefined){event.preventDefault();selectWelcomeStep(welcomeSteps[next],true);}});
});
