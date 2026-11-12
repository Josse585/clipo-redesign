// View changes are driven by Supabase in production; preview controls only review layouts.
export function setSessionView(member) {
 document.body.classList.remove('session-pending');
 document.body.classList.toggle('is-authenticated',member);
 document.getElementById('viewLanding').hidden=member;
 document.getElementById('viewApp').hidden=!member;
 const loading=document.getElementById('sessionLoading');if(loading)loading.hidden=true;
 document.getElementById('userBox').hidden=!member;
 document.getElementById('headerCta').hidden=member;
 document.querySelectorAll('[data-visitor-nav],[data-visitor-link]').forEach(el=>el.hidden=member);
 document.querySelectorAll('[data-member-nav],[data-member-link]').forEach(el=>el.hidden=!member);
 document.getElementById('mobileNav').hidden=true;
 const menu=document.getElementById('menuToggle');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Abrir menú');
 document.title=member?'DRIX CLIP · Tu estudio':'DRIX CLIP · Dale más vida a tus videos';
}
