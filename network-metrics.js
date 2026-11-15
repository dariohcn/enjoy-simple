const regionesRed={
 Costa:['El Oro','Esmeraldas','Guayas','Los Ríos','Manabí','Santa Elena','Santo Domingo de los Tsáchilas'],
 Sierra:['Azuay','Bolívar','Cañar','Carchi','Chimborazo','Cotopaxi','Imbabura','Loja','Pichincha','Tungurahua'],
 Amazonía:['Morona Santiago','Napo','Orellana','Pastaza','Sucumbíos','Zamora Chinchipe'],
 Insular:['Galápagos']
};
const ciudadesPorProvincia={
 Azuay:['Cuenca'], Bolívar:['Guaranda'], Cañar:['Azogues'], Carchi:['Tulcán','San Gabriel'],
 Chimborazo:['Riobamba','Alausí'], Cotopaxi:['Latacunga'], 'El Oro':['Machala','Piñas'],
 Esmeraldas:['Muisne','Valdez','San Lorenzo'], Galápagos:['Santa Cruz','Puerto Villamil','Puerto Baquerizo Moreno'],
 Guayas:['Guayaquil','Milagro'], Imbabura:['Ibarra'], Loja:['Macará'], 'Los Ríos':['Babahoyo'],
 Manabí:['Portoviejo','Manta','Chone','Jipijapa'], 'Morona Santiago':['Macas','Yaupi'], Napo:['Tena'],
 Orellana:['Coca'], Pastaza:['Puyo'], Pichincha:['Quito','Sangolquí','Cayambe'], 'Santa Elena':['Salinas'],
 'Santo Domingo de los Tsáchilas':['Santo Domingo'], Sucumbíos:['Nueva Loja','Lago Agrio'],
 Tungurahua:['Ambato'], 'Zamora Chinchipe':['Zamora']
};
function lugarRed(value){
 return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]+/g,' ').trim();
}
const lugaresRed=Object.entries(regionesRed).flatMap(([region,provincias])=>provincias.flatMap(provincia=>
 [provincia,...(ciudadesPorProvincia[provincia]||[])].map(nombre=>({region,provincia,nombre:lugarRed(nombre)}))
)).sort((a,b)=>b.nombre.length-a.nombre.length);
function coincideGeografiaRed(taller,region,provincia){
 if(!region&&!provincia)return true;
 const ubicacion=' '+lugarRed(taller.location)+' ';
 const lugar=lugaresRed.find(item=>ubicacion.includes(' '+item.nombre+' '));
 return Boolean(lugar&&(!region||lugar.region===region)&&(!provincia||lugar.provincia===provincia));
}
/* A single population/date basis for every network visualization. */
function summarizeNetwork(workshops,monitor,{workshop='all',scope='all',days=30,today,region='',province=''}={}){
 today=today||monitor.today;
 const start=new Date(today+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-days+1);
 const from=start.toISOString().slice(0,10);
 const eligible=workshops.filter(w=>!w.deleted_at&&w.status==='approved'&&coincideGeografiaRed(w,region,province)&&(scope==='all'||(scope==='demo'?w.is_demo:!w.is_demo)));
 const partners=eligible.filter(w=>workshop==='all'||w.id===workshop),ids=new Set(partners.map(w=>w.id));
 const appointments=monitor.appointments.filter(a=>ids.has(a.workshop)&&a.date>=from&&a.date<=today);
 const stats=monitor.workshops.filter(w=>ids.has(w.id));
 const sum=(rows,key='n')=>rows.reduce((s,r)=>s+Number(r[key]||0),0);
 const total=sum(appointments),done=sum(appointments.filter(a=>a.status==='done'));
 const daily=appointments.filter(a=>a.date===today&&a.status!=='cancelled');
 return {eligible,partners,appointments,stats,from,today,total,done,rate:total?Math.round(done/total*100):0,
  todayCount:sum(daily),arrivedToday:sum(daily.filter(a=>a.status==='arrived')),
  clients:partners.reduce((s,w)=>s+Number(w.counts?.clients||0),0),vehicles:partners.reduce((s,w)=>s+Number(w.counts?.vehicles||0),0),
  examples:partners.filter(w=>w.is_demo).length};
}
if(typeof module==='object'&&module.exports)module.exports={summarizeNetwork};
