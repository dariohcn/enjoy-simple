/* Shared visual hierarchy; operational data and permissions remain unchanged. */
function applyEnjoyBrand(){
 document.body.classList.add('enjoy-brand');
 if(document.body.classList.contains('logged-out')){
 const message=document.querySelector('.auth-message');if(message){message.querySelector('.eyebrow').textContent='GESTIÓN PARA TALLERES';message.querySelector('h1').innerHTML='<span>Su taller conectado.</span><span>Su trabajo bajo control.</span>';message.querySelector('p').textContent='Organice sus citas, siga cada reparación y conserve el historial de sus clientes.';message.querySelector('.auth-feature-line').innerHTML='<span>Citas</span><span>Órdenes de trabajo</span><span>Historial</span>';}
 const mark=document.querySelector('.auth-form-heading>span:last-child');if(mark)mark.textContent='ACCESO A LA PLATAFORMA';
 return;
 }
 if(session?.role==='owner'&&['overview','calendar'].includes(view)){
 const main=document.querySelector('#contenido'),heading=main.querySelector('.operation-heading,.page-head,.agenda-top,.live-title'),receive=heading?.querySelector('[data-enjoy-receive]');
 if(receive){receive.classList.remove('secondary');receive.classList.add('enjoy-primary-action');heading.querySelectorAll('[data-action="appointment"]').forEach(b=>b.classList.add('secondary'));}
 }
}
const loginBeforeBrand=loginPage;loginPage=function(){loginBeforeBrand();applyEnjoyBrand();};
const renderBeforeBrand=render;render=function(){renderBeforeBrand();applyEnjoyBrand();};
applyEnjoyBrand();
