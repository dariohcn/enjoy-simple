
/* Native maintenance planner. Reference data is served by this GitHub Pages site. */
(() => {
'use strict';
let workshopName='';
let source=null,pending=null,failure='',filters={year:'',brand:'',model:'',code:'',km:'',plan:'',type:'',search:''};
const text=x=>String(x??''),safe=x=>text(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd=n=>new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'}).format(n||0);
const num=x=>Number(text(x).replace(',','.'))||0,round=x=>Math.round((x+Number.EPSILON)*100)/100;
const unique=(rows,i)=>[...new Set(rows.map(x=>text(x[i])))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
const currencySum=rows=>round(rows.reduce((sum,r)=>sum+num(r[12]),0));
function modelYear(code){
 const years=[...new Set(text(code).match(/\b(?:19|20)\d{2}\b/g)||[])];
 return years.length===1?years[0]:'Sin año indicado';
}
function narrow(rows,key,index){return rows.filter(r=>text(r[index])===filters[key]);}
function pick(rows,key,index){const vals=unique(rows,index);if(!vals.includes(filters[key]))filters[key]=vals[0]||'';return narrow(rows,key,index);}
function selection(){let rows=source?.rows||[],choices={};choices.year=[...new Set(rows.map(r=>modelYear(r[2])))].sort((a,b)=>b.localeCompare(a,'es',{numeric:true}));if(!choices.year.includes(filters.year))filters.year=choices.year.find(y=>y!=='Sin año indicado')||choices.year[0]||'';rows=rows.filter(r=>modelYear(r[2])===filters.year);for(const [key,i] of [['brand',0],['model',1],['code',2],['km',4],['plan',13]]){choices[key]=unique(rows,i);rows=pick(rows,key,i);}if(source?.plans)rows=rows.flatMap(h=>source.plans[h[14]][6].map(index=>{const l=source.items[index];return [h[0],h[1],h[2],h[3],h[4],l[0],l[1],l[2],l[3],l[4],l[5],l[6],l[7],h[13],null,l[8]];}));return {rows,choices};}
function visibleRows(rows){const q=filters.search.toLocaleLowerCase('es');return rows.filter(r=>(!filters.type||(filters.type==='labor'?num(r[8])===1:num(r[8])!==1))&&(!q||[r[5],r[6]].join(' ').toLocaleLowerCase('es').includes(q)));}
function totals(rows){const labor=currencySum(rows.filter(r=>num(r[8])===1)),subtotal=currencySum(rows),parts=round(subtotal-labor);return {labor,parts,subtotal,total:round(subtotal*1.15),extra:round(subtotal*.15),rate:Math.max(0,...rows.filter(r=>num(r[8])===1).map(r=>num(r[10])))};}
function option(key,values,label,format=x=>x){return '<label>'+label+'<select class="form-select" data-nm-filter="'+key+'" '+(!values.length?'disabled':'')+'>'+values.map(v=>'<option value="'+safe(v)+'" '+(v===filters[key]?'selected':'')+'>'+safe(format(v))+'</option>').join('')+'</select></label>';}
function stat(label,value,tone,detail){return '<article class="nm-stat '+tone+'"><span>'+label+'</span><strong>'+usd(value)+'</strong><small>'+detail+'</small></article>';}
function body(){
 if(!source)return '<div class="nm-state" role="status">'+(failure?'<strong>No se pudo cargar el tarifario.</strong><p>'+safe(failure)+'</p><button class="btn secondary" data-nm-retry>Reintentar</button>':'<span class="nm-loading"></span><strong>Cargando planes de mantenimiento…</strong>')+'</div>';
 const {rows:planRows,choices}=selection(),rows=visibleRows(planRows),t=totals(rows),part=planRows[0],pct=t.subtotal?Math.round(t.labor/t.subtotal*100):0;
 const plans=choices.plan.map(id=>[id,source.rows.find(r=>text(r[13])===id&&text(r[2])===filters.code)?.[3]||id]);
 return '<div class="nm-filterbar">'+option('year',choices.year,'Año')+option('brand',choices.brand,'Marca')+option('model',choices.model,'Modelo')+option('code',choices.code,'Versión')+option('km',choices.km,'Kilometraje',v=>v?Number(v).toLocaleString('es-EC')+' km':'Sin intervalo')+'<button class="btn secondary" data-nm-reset>Restablecer</button></div>'+
 '<div class="nm-context"><div><span class="nm-eyebrow">PLAN SELECCIONADO</span><h2>'+safe(part?.[3]||'Sin partidas')+'</h2><p>'+safe(filters.brand)+' · '+safe(filters.model)+' · '+safe(filters.code)+'</p></div>'+(plans.length>1?option('plan',plans.map(x=>x[0]),'Variante de plan',id=>plans.find(x=>x[0]===id)[1]):'<span class="nm-tag">'+planRows.length+' partidas en el plan</span>')+'</div>'+
 '<div class="nm-layout"><div class="nm-drawer"><button class="btn secondary nm-drawer-tab" type="button" data-nm-totals aria-controls="nm-totals">Totales</button><aside id="nm-totals" class="nm-stats" aria-label="Totales de las partidas visibles">'+stat('Valor hora máximo',t.rate,'nm-slate','Tarifa de mano de obra')+stat('Mano de obra',t.labor,'nm-blue',rows.filter(r=>num(r[8])===1).length+' operaciones')+stat('Repuestos e insumos',t.parts,'nm-teal',rows.filter(r=>num(r[8])!==1).length+' partidas')+stat('Subtotal',t.subtotal,'nm-slate','Suma de las partidas visibles')+stat('Total de referencia',t.total,'nm-total','Incluye 15% del informe de origen')+'</aside></div>'+
 '<section class="nm-detail"><div class="nm-tablebar"><div><h2>Detalle del mantenimiento</h2><p><span id="nm-count">'+rows.length+'</span> partidas · USD · MO = Mano de obra · R = Repuestos e insumos</p></div><div class="nm-actions"><button class="btn" type="button" data-nm-proforma>Generar proforma</button><button class="btn secondary" data-nm-export '+(!rows.length?'disabled':'')+'>Descargar CSV</button></div></div><div class="nm-searchbar"><label>Buscar partida<input class="form-control" id="nm-search" value="'+safe(filters.search)+'" placeholder="Código o descripción"></label><label>Tipo<select class="form-select" data-nm-filter="type"><option value="">Todas las partidas</option><option value="labor" '+(filters.type==='labor'?'selected':'')+'>Mano de obra</option><option value="parts" '+(filters.type==='parts'?'selected':'')+'>Repuestos e insumos</option></select></label></div>'+
 '<div class="nm-table-scroll" tabindex="0" role="region" aria-label="Detalle del mantenimiento; desplace horizontalmente en pantallas pequeñas"><table class="nm-table"><thead><tr><th scope="col">Ítem / código</th><th scope="col">Descripción</th><th scope="col">Tipo</th><th scope="col" class="nm-number">Cantidad / horas</th><th scope="col" class="nm-number">Subtotal</th></tr></thead><tbody>'+[1,0].map(kind=>{const group=rows.filter(r=>num(r[8])===kind);return group.length?'<tr class="nm-group"><th colspan="5" scope="row">'+(kind?'Mano de obra (MO)':'Repuestos e insumos (R)')+'</th></tr>'+group.map(r=>'<tr><td>'+safe(r[5])+'</td><td>'+safe(r[6])+'</td><td><span class="nm-kind '+(num(r[8])===1?'labor':'parts')+'">'+(num(r[8])===1?'MO':'R')+'</span></td><td class="nm-number">'+safe(r[7]??r[15])+'</td><td class="nm-number">'+usd(num(r[12]))+'</td></tr>').join(''):'';}).join('')+(!rows.length?'<tr><td colspan="5" class="nm-empty">No hay partidas que coincidan con la búsqueda.</td></tr>':'')+'</tbody><tfoot><tr><th colspan="4" scope="row">Subtotal de partidas visibles</th><td class="nm-number">'+usd(t.subtotal)+'</td></tr></tfoot></table></div><div class="nm-breakdown"><div><span>Composición del costo</span><div class="nm-bar" role="img" aria-label="Mano de obra '+pct+' por ciento; repuestos '+(100-pct)+' por ciento"><span style="width:'+pct+'%"></span></div><p><i class="labor"></i> Mano de obra '+pct+'% <i class="parts"></i> Repuestos '+(100-pct)+'%</p></div><div class="nm-tax"><span>Adicional del informe · 15%</span><strong>'+usd(t.extra)+'</strong></div></div></section></div>'+
 '<p class="nm-footnote">Tarifario de referencia del informe proporcionado · última actualización de origen: 26/11/2025. Se consulta una sola versión y un solo plan para evitar sumar vehículos distintos. El total conserva el 15% de la referencia; confirme condiciones e impuestos antes de emitir una proforma.</p>';
}

function openProforma(){
 const rows=selection().rows;
 if(!rows.length)return;
 const initialRows=rows;
 const dialog=document.createElement('dialog');
 dialog.className='nm-proforma-dialog';
 dialog.setAttribute('aria-label','Datos de la proforma');
 dialog.innerHTML=`<form method="dialog">
  <h2>Generar proforma</h2>
  <p>Editá las partidas de esta proforma antes de imprimir.</p>
  <label>Cliente<input class="form-control" name="customer" required maxlength="120"></label>
  <label>Chasis<input class="form-control" name="chassis" maxlength="40"></label>
  <label>Placa<input class="form-control" name="plate" maxlength="20"></label>
  <label>Elaborado por<input class="form-control" name="prepared" maxlength="100"></label>
  <div class="nm-quote-lines"></div><output class="nm-quote-total" aria-live="polite"></output>
  <div class="nm-actions"><button type="button" class="btn secondary" data-close>Cancelar</button><button class="btn">Imprimir / guardar PDF</button></div>
 </form>`;

 const editor=dialog.querySelector('.nm-quote-lines');
 function readRows(){
  return [...editor.querySelectorAll('.nm-quote-row')].map(row=>{
   const description=row.querySelector('[data-description]').value.trim();
   const quantity=row.querySelector('[data-quantity]').valueAsNumber;
   const price=row.querySelector('[data-price]').valueAsNumber;
   const result=[];
   result[6]=description;
   result[7]=quantity;
   result[8]=Number(row.closest('fieldset').dataset.kind);
   result[9]=price;
   result[12]=round(quantity*price);
   return result;
  });
 }
 function refreshTotal(){
  const valid=readRows().filter(r=>Number.isFinite(r[12]));
  dialog.querySelector('output').textContent='Subtotal '+usd(totals(valid).subtotal)+' · Total de referencia '+usd(totals(valid).total);
 }
 function addLine(fieldset,description='',quantity=1,price=0){
  const row=document.createElement('div');
  row.className='nm-quote-row';
  row.innerHTML=`<label>Descripción<input class="form-control" data-description required maxlength="240" value="${safe(description)}"></label>
   <label>${fieldset.dataset.kind==='1'?'Horas':'Cantidad'}<input class="form-control" type="number" min="0.000001" step="any" data-quantity required value="${safe(quantity)}"></label>
   <label>Valor unitario USD<input class="form-control" type="number" min="0" step="any" data-price required value="${safe(price)}"></label>
   <button type="button" class="btn secondary" data-remove>Quitar</button>`;
  row.querySelector('[data-remove]').onclick=()=>{row.remove();refreshTotal();};
  fieldset.insertBefore(row,fieldset.querySelector('[data-add]'));
  return row;
 }
 for(const [kind,label] of [[1,'Mano de obra (MO)'],[0,'Repuestos e insumos (R)']]){
  const fieldset=document.createElement('fieldset');
  fieldset.dataset.kind=kind;
  fieldset.innerHTML=`<legend>${label}</legend><button type="button" class="btn secondary" data-add>Agregar partida</button>`;
  editor.append(fieldset);
  for(const item of initialRows.filter(r=>num(r[8])===kind)){
   const quantity=num(item[7]??item[15])||1;
   addLine(fieldset,item[6],quantity,Number((num(item[12])/quantity).toFixed(8)));
  }
  fieldset.querySelector('[data-add]').onclick=()=>{addLine(fieldset).querySelector('[data-description]').focus();refreshTotal();};
 }
 editor.addEventListener('input',refreshTotal);
 refreshTotal();
 dialog.querySelector('[data-close]').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 dialog.querySelector('form').onsubmit=event=>{
  event.preventDefault();
  const rows=readRows();
  if(!rows.length||rows.some(r=>!r[6]||!Number.isFinite(r[12]))){
   dialog.querySelector('output').textContent='Agregá al menos una partida y completá su descripción, cantidad y valor.';
   return;
  }
  const summary=totals(rows);
  const fields=Object.fromEntries(new FormData(event.currentTarget));
  const vehicle=[filters.year==='Sin año indicado'?'':filters.year,filters.brand,filters.model,filters.code,filters.km?filters.km+' km':''].filter(Boolean).join(' · ');
  const lines=(items)=>items.map((r,index)=>{
   const quantity=r[7]??r[15], amount=num(r[12]);
   return `<tr><td>${index+1}</td><td>${safe(r[6])}</td><td>${safe(quantity)}</td><td>${num(quantity)?usd(r[9]):'—'}</td><td>${usd(amount)}</td></tr>`;
  }).join('');
  const section=(title,items)=>`<table><thead><tr><th colspan="5">${title}</th></tr><tr><th>Ítem</th><th>Descripción</th><th>Cantidad</th><th>Valor unitario</th><th>Valor total</th></tr></thead><tbody>${lines(items)||'<tr><td colspan="5">Sin partidas</td></tr>'}</tbody></table>`;
  const page=document.createElement('section');
  page.id='integration-print';
  page.className='nm-printed';
  page.innerHTML=`<table class="nm-print-header"><tbody>
   <tr><th colspan="4">${safe(workshopName||'Taller de mecánica')}</th></tr>
   <tr><th colspan="4">PROFORMA DE REPUESTOS Y MANO DE OBRA PARA MANTENIMIENTO</th></tr>
   <tr><th>Vehículo</th><td colspan="3">${safe(vehicle)}</td></tr>
   <tr><th>Cliente</th><td colspan="3">${safe(fields.customer)}</td></tr>
   <tr><th>Chasis</th><td>${safe(fields.chassis||'—')}</td><th>Placa</th><td>${safe(fields.plate||'—')}</td></tr>
  </tbody></table>
  ${section('REPUESTOS',rows.filter(r=>num(r[8])!==1))}
  ${section('MANO DE OBRA',rows.filter(r=>num(r[8])===1))}
  <table class="nm-print-totals"><tbody>
   <tr><th>Total repuestos (sin IVA)</th><td>${usd(summary.parts)}</td></tr>
   <tr><th>Total mano de obra (sin IVA)</th><td>${usd(summary.labor)}</td></tr>
   <tr><th>Subtotal (REP + MO)</th><td>${usd(summary.subtotal)}</td></tr>
   <tr><th>Total incluido IVA de referencia (15%)</th><td>${usd(summary.total)}</td></tr>
  </tbody></table>
  <p><strong>NOTA</strong><br>Las piezas y trabajos adicionales que se identifiquen durante el mantenimiento se cotizarán por separado. Valores de referencia sujetos a confirmación.</p>
  <p class="nm-print-prepared"><strong>ELABORADO POR</strong><br>${safe(fields.prepared||'________________________')}</p>`;
  document.getElementById(page.id)?.remove();
  document.body.append(page);
  dialog.close();
  window.print();
 };
 document.body.append(dialog);
 dialog.showModal();
}

function paint(){const el=document.querySelector('#native-maintenance');if(el)el.innerHTML=body();}
async function load(){
 if(source||pending)return pending;failure='';
 pending=(async()=>{const response=await fetch('assets/maintenance-reference.json.gz?v=1');if(!response.ok)throw Error('Respuesta '+response.status);if(!window.DecompressionStream)throw Error('Actualice su navegador para consultar el tarifario.');const stream=response.body.pipeThrough(new DecompressionStream('gzip'));const json=await new Response(stream).json();if(json.version!==2||!Array.isArray(json.plans)||!json.plans.length||!Array.isArray(json.items)||json.columns?.length!==16)throw Error('El archivo de planes no es válido.');source=json;source.rows=json.plans.map((p,i)=>[p[0],p[1],p[2],p[3],p[4],null,null,null,null,null,null,null,null,p[5],i,null]);})().catch(e=>{failure=e.message;}).finally(()=>{pending=null;paint();});
 return pending;
}
function render(options={}){workshopName=options.workshopName||'';setTimeout(()=>load(),0);return '<section id="native-maintenance" class="native-maintenance">'+body()+'</section>';}
document.addEventListener('change',e=>{const key=e.target.dataset.nmFilter;if(!key||!source)return;filters[key]=e.target.value;const order=['year','brand','model','code','km','plan'],index=order.indexOf(key);if(index>=0)for(const next of order.slice(index+1))filters[next]='';paint();});
document.addEventListener('input',e=>{if(e.target.id!=='nm-search')return;filters.search=e.target.value;const cursor=e.target.selectionStart;paint();const input=document.querySelector('#nm-search');input?.focus();input?.setSelectionRange(cursor,cursor);});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-nm-proforma')&&source){openProforma();return;}if(b.hasAttribute('data-nm-totals')&&matchMedia('(hover: none)').matches){const drawer=b.closest('.nm-drawer');b.setAttribute('aria-expanded',String(drawer.classList.toggle('nm-open')));return;}if(b.hasAttribute('data-nm-retry')){load();paint();}if(b.hasAttribute('data-nm-reset')){filters={year:'',brand:'',model:'',code:'',km:'',plan:'',type:'',search:''};paint();}if(b.hasAttribute('data-nm-export')&&source){const rows=visibleRows(selection().rows),t=totals(rows);const cell=v=>'"'+text(v).replace(/^[=+@\t\r-]/,"'"+text(v)[0]).replace(/"/g,'""')+'"';const output=[['Marca','Modelo','Código modelo','Plan','KM','Ítem','Descripción','Cantidad / horas','Tipo','Subtotal USD'],...rows.map(r=>[r[0],r[1],r[2],r[3],r[4],r[5],r[6],r[7],num(r[8])===1?'Mano de obra':'Repuesto / insumo',num(r[12]).toFixed(2)]),['Subtotal','','','','','','','','',t.subtotal.toFixed(2)],['Adicional referencia 15%','','','','','','','','',t.extra.toFixed(2)],['Total referencia','','','','','','','','',t.total.toFixed(2)]].map(r=>r.map(cell).join(';')).join('\r\n');const blob=new Blob(['\ufeff'+output],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='plan-mantenimiento-'+filters.code.replace(/[^a-z0-9]/gi,'-')+'-'+filters.km+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}});
window.EnjoyMaintenance={render};
// Exported pure calculations allow data integrity tests without a browser.
if(typeof module!=='undefined')module.exports={totals,visibleRows,selection,setSource:s=>{source=s;},setFilters:f=>{filters={...filters,...f};}};
})();
