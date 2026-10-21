/* A single population/date basis for every network visualization. */
function summarizeNetwork(workshops,monitor,{workshop='all',scope='all',days=30,today}={}){
 today=today||monitor.today;
 const start=new Date(today+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-days+1);
 const from=start.toISOString().slice(0,10);
 const eligible=workshops.filter(w=>!w.deleted_at&&w.status==='approved'&&(scope==='all'||(scope==='demo'?w.is_demo:!w.is_demo)));
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
