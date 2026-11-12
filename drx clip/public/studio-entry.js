import './brand-interactions.js';
import './export-test.js';
import {setSessionView} from './session-view.js';
function reviewView(member,scroll=true){
 if(!member&&!document.getElementById('labCancel').hidden)document.getElementById('labCancel').click();
 setSessionView(member);
 document.querySelectorAll('[data-preview-view]').forEach(button=>button.setAttribute('aria-pressed',String((button.dataset.previewView==='studio')===member)));
 document.getElementById('previewFreePlan').href=member?'#preview':'#googleSignIn';
 document.getElementById('authMsg').textContent='';
 if(scroll)window.scrollTo({top:0,behavior:'instant'});
}
document.querySelectorAll('[data-preview-view]').forEach(button=>button.addEventListener('click',()=>reviewView(button.dataset.previewView==='studio')));
document.getElementById('logoutBtn').addEventListener('click',()=>reviewView(false));
document.getElementById('googleSignIn').addEventListener('click',()=>{document.getElementById('authMsg').textContent='Esta es una vista previa del diseño. Puedes revisar el estudio con el selector de vistas.';});
document.querySelectorAll('a[href="#proDetails"]').forEach(link=>link.addEventListener('click',()=>{document.getElementById('proDetails').open=true;}));
reviewView(new URLSearchParams(location.search).get('vista')==='estudio',false);
