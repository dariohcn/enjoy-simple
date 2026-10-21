/* Natural Earth geography; workshop positions are city references, not addresses. */
let networkMapCity='';
const normalizeMapPlace=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function networkMap(partners){
 const groups=new Map(),unlocated=[];
 partners.forEach(w=>{
  const text=normalizeMapPlace(w.location),city=enjoyMapCities.find(c=>text===normalizeMapPlace(c.name)||new RegExp('(^|[^a-z])'+normalizeMapPlace(c.name)+'([^a-z]|$)').test(text));
  if(!city){unlocated.push(w);return;}
  if(!groups.has(city.name))groups.set(city.name,{...city,workshops:[]});
  groups.get(city.name).workshops.push(w);
 });
 const cities=[...groups.values()].sort((a,b)=>b.workshops.length-a.workshops.length||a.name.localeCompare(b.name));
 if(networkMapCity&&!groups.has(networkMapCity))networkMapCity='';
 const visible=networkMapCity?groups.get(networkMapCity).workshops:partners;
 const point=([lon,lat])=>[(lon+81.2)*43+25,(1.6-lat)*43+12];
 const markers=cities.filter(c=>c.coordinates[0]>-85).map(c=>{const [x,y]=point(c.coordinates),active=c.name===networkMapCity;return `<g class="network-map-pin ${active?'selected':''}" role="button" tabindex="0" data-map-city="${esc(c.name)}" aria-label="${esc(c.name)}: ${c.workshops.length} talleres. Ubicación aproximada" aria-pressed="${active}"><title>${esc(c.name)} · ${c.workshops.length} talleres</title><circle class="map-hit" cx="${x}" cy="${y}" r="15"/><circle class="map-halo" cx="${x}" cy="${y}" r="10"/><circle class="map-dot" cx="${x}" cy="${y}" r="5"/><text x="${x+12}" y="${y+4}">${esc(c.name)} · ${c.workshops.length}</text></g>`;}).join('');
 return `<div class="network-map-tools"><span><i></i>${cities.length} ciudades · ${partners.length} talleres</span><button type="button" data-map-city="" class="${networkMapCity?'':'selected'}">${networkMapCity?'Ver todo Ecuador':'Ecuador'}</button></div><div class="network-map-layout"><div class="network-map-canvas"><svg viewBox="0 0 350 310" role="group" aria-label="Mapa de Ecuador. Talleres agrupados por ciudad"><defs><pattern id="map-grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="#dce7ed" stroke-width=".5"/></pattern></defs><rect width="350" height="310" rx="6" fill="url(#map-grid)"/><text class="map-ocean" x="12" y="160" transform="rotate(-90 12 160)">OCÉANO PACÍFICO</text><path class="map-country" d="${enjoyMapMainland}"/><text class="map-neighbor" x="220" y="28">COLOMBIA</text><text class="map-neighbor" x="265" y="235">PERÚ</text><g class="map-islands" transform="translate(225 0)"><rect x="21" y="247" width="85" height="50" rx="4"/><path d="${enjoyMapIslands}"/><text x="28" y="289">GALÁPAGOS</text></g>${markers}</svg></div><div class="network-map-directory"><label class="network-city-filter">Ciudad<select id="network-city-select"><option value="">Todas las ciudades</option>${cities.map(c=>`<option value="${esc(c.name)}" ${networkMapCity===c.name?'selected':''}>${esc(c.name)} · ${c.workshops.length} talleres</option>`).join('')}</select></label><div class="network-location-list"><h3>${networkMapCity?esc(networkMapCity):'Talleres en la red'}</h3>${visible.map(w=>`<button type="button" data-action="workshop-detail" data-id="${esc(w.id)}"><span class="map-workshop-mark">${liveIcon('admin')}</span><span><strong>${esc(w.name.replace(/^Ejemplo · /,''))}</strong><small>${esc(w.location||'Ciudad pendiente')}${w.is_demo?' · Ejemplo':''}</small></span><span aria-hidden="true">↗</span></button>`).join('')||'<p>No hay talleres en esta selección.</p>'}</div></div></div><div class="network-map-note">Referencia por ciudad; no representa la dirección exacta del taller.${unlocated.length?' '+unlocated.length+' taller(es) sin ciudad reconocida.':''} <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener">Natural Earth ↗</a></div>`;
}
document.addEventListener('click',e=>{const target=e.target.closest('[data-map-city]');if(!target||session?.role!=='admin'||view!=='monitor')return;const previousScroll=window.scrollY;networkMapCity=target.dataset.mapCity;render();window.scrollTo(0,previousScroll);const selector='[data-map-city="'+CSS.escape(networkMapCity)+'"]';document.querySelector('#network-city-select')?.focus({preventScroll:true});});
document.addEventListener('keydown',e=>{if(!e.target.matches('g[data-map-city]')||!['Enter',' '].includes(e.key))return;e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));});


document.addEventListener('change',e=>{if(e.target.id!=='network-city-select'||session?.role!=='admin'||view!=='monitor')return;const y=scrollY;networkMapCity=e.target.value;render();window.scrollTo(0,y);document.querySelector('#network-city-select')?.focus({preventScroll:true});});



