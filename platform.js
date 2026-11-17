/* Adaptación del prototipo a los registros y controles de la plataforma. */
const liveIcon=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[k]||icons.monitor||icons.overview}</svg>`;
let monitorScope='all',monitorRegion='',monitorProvince='';
const originalMonitor=adminMonitor;
adminMonitor=function(){
 if(!data.monitor)return originalMonitor();
 const m=data.monitor,today=m.today||isoToday(),start=new Date(today+'T12:00:00');start.setDate(start.getDate()-monitorDays+1);const from=iso(start);
 const summary=summarizeNetwork(data.workshops,m,{workshop:monitorWorkshop,scope:monitorScope,region:monitorRegion,province:monitorProvince,days:monitorDays,today}),{partners,appointments,stats}=summary;
 const sum=(rows,key='n')=>rows.reduce((s,r)=>s+Number(r[key]||0),0),count=s=>sum(appointments.filter(a=>a.status===s)),total=sum(appointments),done=count('done'),rate=total?Math.round(done/total*100):0;
 const colors=['#3183b9','#7797ad','#dbac5d','#45998b','#9badbd','#b69c79'];
 const metric=(label,value,note,i)=>`<article class="live-stat color-${i}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`;
 const trend=Array.from({length:monitorDays},(_,i)=>{let d=new Date(start);d.setDate(d.getDate()+i);return {date:iso(d),n:sum(appointments.filter(a=>a.date===iso(d)))};}),max=Math.max(1,...trend.map(t=>t.n));
 const line=trend.map((t,i)=>(i?'L':'M')+(i*500/Math.max(1,trend.length-1))+','+(95-t.n/max*85)).join(' ');
 const workshopRows=partners.map(w=>({...w,n:sum(appointments.filter(a=>a.workshop===w.id))})).sort((a,b)=>b.n-a.n),barMax=Math.max(1,...workshopRows.map(w=>w.n));
 const stateRows=[['Completadas',done,'#45998b'],['Programadas',count('scheduled'),'#3183b9'],['En taller',count('arrived'),'#dbac5d'],['Canceladas',count('cancelled'),'#a8b8c6']];let cursor=0;const stops=stateRows.map(s=>{const prev=cursor;cursor+=total?s[1]/total*100:0;return `${s[2]} ${prev}% ${cursor}%`;}).join(',');
 const chart=(title,content,cls='')=>`<section class="live-card ${cls}"><h2>${title}</h2>${content}</section>`;
 return `<div class="live-title"><div><h1>Panel de la red</h1><p>Actividad de los talleres socios · Hora de Ecuador</p></div><button class="btn secondary" data-action="monitor-refresh">Actualizar ↻</button></div><div class="live-filters"><label>Región<select id="monitor-region"><option value="">Todas</option>${Object.keys(regionesRed).map(region=>`<option ${region===monitorRegion?'selected':''}>${esc(region)}</option>`).join('')}</select></label><label>Provincia<select id="monitor-province"><option value="">Todas</option>${(monitorRegion?regionesRed[monitorRegion]:Object.values(regionesRed).flat()).slice().sort((a,b)=>a.localeCompare(b,'es-EC')).map(province=>`<option ${province===monitorProvince?'selected':''}>${esc(province)}</option>`).join('')}</select></label><label>Taller<select id="monitor-workshop"><option value="all">Toda la red</option>${summary.eligible.map(w=>`<option value="${esc(w.id)}" ${w.id===monitorWorkshop?'selected':''}>${esc(w.name)}</option>`).join('')}</select></label><label>Período<select id="monitor-days"><option value="7" ${monitorDays===7?'selected':''}>7 días</option><option value="30" ${monitorDays===30?'selected':''}>30 días</option></select></label><button class="live-pending" data-view="admin">${data.workshops.filter(w=>w.status==='pending'&&!w.deleted_at&&coincideGeografiaRed(w,monitorRegion,monitorProvince)).length} solicitudes pendientes →</button></div>
 <div class="metrics-basis" role="status">${partners.length} talleres autorizados seleccionados: ${summary.examples} de ejemplo y ${partners.length-summary.examples} sin marca de ejemplo. Citas: ${date(from)}–${date(today)}, incluidas las canceladas. Clientes, vehículos y mantenimiento: existencias actuales.</div><div class="live-stats">${metric('Talleres activos',partners.length,'Autorizados',0)}${metric('Clientes',summary.clients,'En la red seleccionada',1)}${metric('Vehículos',summary.vehicles,'Fichas vinculadas',2)}${metric('Citas del período',total,done+' completadas',3)}${metric('Citas de hoy',summary.todayCount,summary.arrivedToday+' en taller hoy',0)}${metric('Mantenimiento',sum(stats,'plans'),sum(stats,'overdue')+' por revisar',2)}</div>
 <div class="live-chart-grid">${chart('Evolución de citas',`<div class="live-chart-total">${total}<small>citas · ${date(from)} – ${date(today)}</small></div><svg class="live-line" viewBox="0 0 500 110" role="img" aria-label="Citas por día"><path d="M0 10H500M0 50H500M0 95H500" class="live-grid"/><path d="${line}V100H0Z" fill="#3183b915"/><path d="${line}" fill="none" stroke="#3183b9" stroke-width="2"/>${trend.map((t,i)=>`<circle cx="${i*500/Math.max(1,trend.length-1)}" cy="${95-t.n/max*85}" r="2" fill="#3183b9"><title>${date(t.date)}: ${t.n} citas</title></circle>`).join('')}</svg>`, 'live-wide')}
 ${chart('Estado de las citas del período',`<div class="live-state"><div class="live-donut" style="background:${total?'conic-gradient('+stops+')':'#e6edf3'}"><span><b>${total}</b><small>CITAS</small></span></div><div>${stateRows.map(s=>`<p><i style="background:${s[2]}"></i>${s[0]}<b>${s[1]}</b></p>`).join('')}</div></div>`)}
 ${chart('Citas por taller',`<div class="live-bars">${workshopRows.slice(0,6).map((w,i)=>`<button data-action="workshop-detail" data-id="${esc(w.id)}"><div><i style="height:${w.n/barMax*100}%;background:${colors[i]}"><b>${w.n}</b></i></div><small title="${esc(w.name)}">${esc(w.name.replace(/^Ejemplo · /,'').split(' ').slice(-1)[0])}</small></button>`).join('')||'<p>Sin talleres autorizados.</p>'}</div>`)}
 ${chart('Atenciones completadas',`<svg class="live-gauge" viewBox="0 0 200 115" role="img" aria-label="${rate}% completadas"><path d="M25 95A75 75 0 0 1 175 95" fill="none" stroke="#e8eff4" stroke-width="13"/><path d="M25 95A75 75 0 0 1 175 95" fill="none" stroke="#45998b" stroke-width="13" pathLength="100" stroke-dasharray="${rate} 100"/><text x="100" y="85" text-anchor="middle">${rate}%</text></svg><p class="live-note">${done} de ${total} citas registradas</p>`)}
 ${chart('Seguimiento de citas',`<div class="live-funnel">${[['Registradas',total,100,'#3183b9'],['Sin cancelar',total-count('cancelled'),85,'#45998b'],['Completadas',done,68,'#dbac5d']].map(s=>`<div style="width:${s[2]}%;background:${s[3]}"><span>${s[0]}</span><b>${s[1]}</b></div>`).join('')}</div>`)}
 ${chart('Ubicación de los talleres',networkMap(partners),'live-wide network-map-card')}
 </div><section class="live-card"><div class="live-card-title"><h2>Control y operación de los talleres</h2></div>${table(['Taller','Clientes / vehículos actuales','Citas del período'],partners.map(w=>`<tr><td><button class="text-button" data-action="workshop-detail" data-id="${esc(w.id)}">${esc(w.name)}</button>${w.is_demo?'<small>Ejemplo · datos ficticios</small>':''}</td><td>${Number(w.counts.clients||0)} / ${Number(w.counts.vehicles||0)}</td><td>${sum(appointments.filter(a=>a.workshop===w.id))}</td></tr>`))}</section>`;
};
const baseRender=render;
render=function(){baseRender();document.body.classList.add('platform-adapted');};
const navigationBeforeAdaptation=setNavigation;setNavigation=function(open,returnFocus=true){if(session&&document.body.classList.contains('platform-adapted')){document.body.classList.remove('menu-open');$('#sidebar').inert=false;$('.shell').inert=false;$('#menu').setAttribute('aria-expanded','false');return;}navigationBeforeAdaptation(open,returnFocus);};
const adaptationRender=render;render=function(){adaptationRender();if(session)setNavigation(false,false);};

icons.monitor=icons.overview;icons.products='<path d="m12 3 9 5v9l-9 5-9-5V8Zm-9 5 9 5 9-5M12 13v9"/>';
// La identidad de sesión del servidor determina las vistas disponibles.
function permittedViews(){return session?.role==='admin'?['monitor','admin','products','reminders','security','orders']:['overview','calendar','clients','vehicles','maintenance','services','products','requests','alerts','reminders','indicators','security','orders'];}
const roleAwareGo=go;go=function(next){if(!session||!permittedViews().includes(next))return;roleAwareGo(next);};
const roleAwareRender=render;render=function(){if(!session)return loginPage();if(!permittedViews().includes(view))view=session.role==='admin'?'adminHome':'overview';roleAwareRender();document.body.dataset.accountRole=session.role;};





const overviewBeforeScopeNotice=workshopOverview;workshopOverview=function(){return '<div class="metrics-basis">Datos exclusivos de '+esc(session.workshop)+'. Las citas de hoy excluyen las canceladas; los demás indicadores reflejan los registros de este taller.</div>'+overviewBeforeScopeNotice();};




document.addEventListener('change',event=>{
 if(event.target.id==='monitor-region'){
  monitorRegion=event.target.value;
  monitorProvince='';
 }else if(event.target.id==='monitor-province'){
  monitorProvince=event.target.value;
 }else return;
 monitorWorkshop='all';
 render();
});
