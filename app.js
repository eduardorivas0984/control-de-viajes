// ============================================================
// CONTROL DE VIAJES — app.js  (PWA Edition)
// ============================================================

// ===== DATA STORE =====
const STORE_KEY = 'ctrl_viajes_v1';
let db = { usuarios: [], viajes: [], gastos: [], documentos: [], eventos: [] };
let currentUser   = null;
let activeViajeId = null;
let tempFiles     = { gasto: null, doc: null, evento: null };
let gastosTabActual = 'todos';
let docsTabActual   = 'todos';
let viajesTabActual = 'activos';
let currentPage     = 'dashboard';

function saveDB()  { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
function loadDB()  {
  try { const r = localStorage.getItem(STORE_KEY); if (r) db = JSON.parse(r); } catch(e){}
  if (!db.usuarios)   db.usuarios   = [];
  if (!db.viajes)     db.viajes     = [];
  if (!db.gastos)     db.gastos     = [];
  if (!db.documentos) db.documentos = [];
  if (!db.eventos)    db.eventos    = [];
}
function genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2,5); }

// ===== SERVICE WORKER =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('[App] SW registrado:', reg.scope);
        // Pedir permisos de notificación
        if (Notification.permission === 'default') Notification.requestPermission();
      })
      .catch(e => console.warn('[App] SW falló:', e));
  });
}

// ===== DRAWER =====
function openDrawer() {
  document.getElementById('drawerOverlay').style.display = 'block';
  setTimeout(() => document.getElementById('drawer').classList.add('open'), 10);
}
function closeDrawer() {
  document.getElementById('drawer').classList.remove('open');
  setTimeout(() => document.getElementById('drawerOverlay').style.display = 'none', 300);
}

// ===== USER =====
function getUser(id) { return db.usuarios.find(u => u.id === id); }
function logout() { currentUser = null; activeViajeId = null; showLoginScreen(); }

function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  renderLoginUsers();
}

function enterApp(userId) {
  const user = getUser(userId);
  if (!user) return;
  currentUser = user;
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  // Viaje activo: el más reciente no completado del usuario
  const myActive = db.viajes.filter(v =>
    v.participantes.includes(userId) && v.estado !== 'completado'
  ).sort((a,b) => new Date(b.fechaInicio) - new Date(a.fechaInicio));
  activeViajeId = myActive.length ? myActive[0].id : null;
  updateTopBar();
  navTo('dashboard');
  checkEventBadge();
  scheduleNotifications();
  requestBrowserNotifs();
}

function updateTopBar() {
  if (!currentUser) return;
  const av = document.getElementById('topbarAvatar');
  av.style.background = currentUser.color;
  av.textContent = currentUser.nombre.charAt(0).toUpperCase();
  const v = getActiveViaje();
  const chip = document.getElementById('topbarViaje');
  chip.textContent = v ? `✈️ ${v.nombre.slice(0,20)}${v.nombre.length>20?'…':''}` : 'Sin viaje';
}

// ===== LOGIN =====
function renderLoginUsers() {
  const grid = document.getElementById('loginUserGrid');
  if (!grid) return;
  if (!db.usuarios.length) {
    grid.innerHTML = '<p style="color:var(--gray);font-size:14px;padding:20px 0;width:100%">Crea un perfil para empezar.</p>';
    return;
  }
  grid.innerHTML = db.usuarios.map(u => `
    <div class="user-card-login" onclick="enterApp('${u.id}')">
      <div class="user-avatar-big" style="background:${u.color}">${u.nombre.charAt(0).toUpperCase()}</div>
      <div class="user-name-login">${u.nombre}</div>
    </div>`).join('');
}
function loginShowCreate() {
  document.getElementById('loginViewSelect').style.display = 'none';
  document.getElementById('loginViewCreate').style.display = 'block';
  setTimeout(() => document.getElementById('uNombreLogin').focus(), 100);
}
function loginShowSelect() {
  document.getElementById('loginViewCreate').style.display = 'none';
  document.getElementById('loginViewSelect').style.display = 'block';
}
function loginSelectColor(color, el) {
  document.querySelectorAll('#loginColorPicker .color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('uColorLogin').value = color;
}
function loginCrearUsuario() {
  const nombre = document.getElementById('uNombreLogin').value.trim();
  if (!nombre) { alert('El nombre es obligatorio'); return; }
  const u = {
    id: genId(), nombre,
    email: document.getElementById('uEmailLogin').value.trim(),
    color: document.getElementById('uColorLogin').value || '#FF6B35',
    creadoEn: new Date().toISOString()
  };
  db.usuarios.push(u);
  saveDB();
  document.getElementById('uNombreLogin').value = '';
  document.getElementById('uEmailLogin').value = '';
  loginShowSelect();
  renderLoginUsers();
}

// ===== NAVIGATION =====
const FAB_ACTIONS = {
  dashboard:  () => showModal('modalViaje'),
  viajes:     () => showModal('modalViaje'),
  gastos:     () => showModal('modalGasto'),
  eventos:    () => showModal('modalEvento'),
  documentos: () => showModal('modalDocumento'),
  deudas:     () => renderDeudas(),
  usuarios:   () => showModal('modalUsuario'),
};
function fabAction() {
  (FAB_ACTIONS[currentPage] || (() => {}))();
}

function navTo(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.bnav-item[data-page]').forEach(n => n.classList.remove('active'));
  const el = document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1));
  if (el) el.classList.add('active');
  const nav = document.querySelector(`.bnav-item[data-page="${page}"]`);
  if (nav) nav.classList.add('active');
  // FAB visibility
  const fab = document.getElementById('fab');
  fab.classList.toggle('hidden', page === 'deudas');
  // Render
  const renders = {
    dashboard: renderDashboard, viajes: renderViajes, gastos: renderGastos,
    deudas: renderDeudas, documentos: renderDocumentos, eventos: renderEventos,
    usuarios: renderUsuarios
  };
  if (renders[page]) renders[page]();
  // Scroll top
  document.getElementById('main').scrollTo(0, 0);
}

// ===== HELPERS =====
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtDatetime(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-MX', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtMoney(n, moneda) {
  try {
    return new Intl.NumberFormat('es-MX', { style:'currency', currency: moneda || 'USD', minimumFractionDigits:2 }).format(n || 0);
  } catch(e) { return `${moneda} ${(n||0).toFixed(2)}`; }
}
function catIcon(cat) {
  return {comida:'🍔',transporte:'🚗',hospedaje:'🏨',vuelos:'✈️',golosinas:'🍬',
    entretenimiento:'🎡',tren:'🚂',vehiculo:'🚙',otro:'➕'}[cat] || '💳';
}
function tipoDocIcon(tipo) {
  return {boarding:'✈️',hotel:'🏨',vehiculo:'🚗',restaurante:'🍽️',tren:'🚂',
    seguro:'🛡️',visa:'📋',otro:'📁'}[tipo] || '📄';
}
function tipoEventoIcon(tipo) {
  return {vuelo:'✈️',hotel:'🏨',checkout:'🏨',vehiculo:'🚗',restaurante:'🍽️',
    tren:'🚂',metro:'🚇',tour:'🗺️',traslado:'🚌',otro:'📌'}[tipo] || '📅';
}
function getViajeGastos(vid) { return db.gastos.filter(g => g.viajeId === vid); }
function totalGastado(vid)   { return getViajeGastos(vid).reduce((s,g) => s + (g.monto||0), 0); }
function pctUsed(v) { return v.presupuesto ? Math.min(100, totalGastado(v.id)/v.presupuesto*100) : 0; }
function pctClass(p) { return p >= 90 ? 'red' : p >= 70 ? 'orange' : 'green'; }
function getActiveViaje() { return activeViajeId ? db.viajes.find(v => v.id === activeViajeId) : null; }

// ===== MODALS =====
function showModal(id) {
  if (id === 'modalGasto')     setupGastoModal();
  if (id === 'modalViaje')     setupViajeModal();
  if (id === 'modalDocumento') setupDocModal();
  if (id === 'modalEvento')    setupEventoModal();
  const overlay = document.getElementById(id);
  overlay.style.display = 'flex';
}
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function closeOnOverlay(e, id) { if (e.target === e.currentTarget) closeModal(id); }

// ===== TOAST =====
function toast(msg, type='info') {
  const t = document.getElementById('toast');
  const d = document.createElement('div');
  d.className = `toast-item ${type}`;
  const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
  d.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  t.appendChild(d);
  setTimeout(() => d.remove(), 3200);
}

// ===== COLOR PICKER =====
function selectColor(color, el) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('uColor').value = color;
}

// ===== USUARIOS =====
function guardarUsuario() {
  const nombre = document.getElementById('uNombre').value.trim();
  if (!nombre) { toast('El nombre es obligatorio','error'); return; }
  const u = {
    id: genId(), nombre,
    email: document.getElementById('uEmail').value.trim(),
    color: document.getElementById('uColor').value,
    creadoEn: new Date().toISOString()
  };
  db.usuarios.push(u); saveDB(); closeModal('modalUsuario');
  toast('Usuario creado ✅','success');
  renderLoginUsers(); renderUsuarios();
  document.getElementById('uNombre').value = '';
  document.getElementById('uEmail').value = '';
}
function renderUsuarios() {
  const grid = document.getElementById('usuariosGrid');
  if (!db.usuarios.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="es-icon">👥</div><h3>Sin usuarios</h3><p>Crea el primer perfil</p></div>';
    return;
  }
  grid.innerHTML = db.usuarios.map(u => `
    <div class="doc-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <div style="width:44px;height:44px;border-radius:50%;background:${u.color};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;flex-shrink:0">${u.nombre.charAt(0).toUpperCase()}</div>
        <div><div class="doc-name">${u.nombre}</div><div class="doc-meta">${u.email||'Sin email'}</div></div>
      </div>
      <div class="doc-meta">Viajes: ${db.viajes.filter(v=>v.participantes.includes(u.id)).length}</div>
      ${u.id===currentUser?.id
        ? '<span class="badge badge-orange" style="margin-top:8px;display:inline-flex">Tú</span>'
        : `<button class="btn btn-danger btn-xs" style="margin-top:8px" onclick="eliminarUsuario('${u.id}')">🗑️ Eliminar</button>`
      }
    </div>`).join('');
}
function eliminarUsuario(id) {
  if (!confirm('¿Eliminar este usuario?')) return;
  db.usuarios = db.usuarios.filter(u => u.id !== id);
  saveDB(); renderUsuarios(); toast('Usuario eliminado','success');
}

// ===== VIAJES =====
function setupViajeModal() {
  const list = document.getElementById('vParticipantesList');
  if (!list) return;
  // Mostrar todos los usuarios; el usuario actual queda seleccionado por defecto
  list.innerHTML = db.usuarios.map(u => `
    <div class="participant-chip selected" data-uid="${u.id}" onclick="toggleChip(this)">
      <div class="participant-dot" style="background:${u.color}"></div>${u.nombre}
    </div>`).join('');
  const today = new Date().toISOString().split('T')[0];
  const fi = document.getElementById('vFechaInicio');
  if (fi) fi.value = today;
  ['vNombre','vDestino','vPresupuesto','vNotas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}
function toggleChip(chip) { chip.classList.toggle('selected'); }
function getSelectedChips(containerId) {
  return [...document.querySelectorAll(`#${containerId} .participant-chip.selected`)].map(c => c.dataset.uid);
}
function guardarViaje() {
  const nombre = document.getElementById('vNombre').value.trim();
  const fi = document.getElementById('vFechaInicio').value;
  const ff = document.getElementById('vFechaFin').value;
  if (!nombre) { toast('⚠️ El nombre del viaje es obligatorio','error'); return; }
  if (!fi) { toast('⚠️ Ingresa la fecha de inicio','error'); return; }
  if (!ff) { toast('⚠️ Ingresa la fecha de fin','error'); return; }
  const participantes = getSelectedChips('vParticipantesList');
  if (!participantes.length) {
    // Si no hay nadie seleccionado, agregar al usuario actual automáticamente
    participantes.push(currentUser.id);
  }
  const pres = parseFloat(document.getElementById('vPresupuesto').value) || 0;
  const v = {
    id: genId(), nombre, destino: document.getElementById('vDestino').value.trim(),
    fechaInicio: fi, fechaFin: ff, presupuesto: pres,
    moneda: document.getElementById('vMoneda').value, participantes,
    notas: document.getElementById('vNotas').value.trim(),
    estado: new Date(fi) > new Date() ? 'planificado' : 'activo',
    creadoEn: new Date().toISOString()
  };
  db.viajes.push(v); saveDB();
  activeViajeId = v.id; updateTopBar();
  closeModal('modalViaje'); toast('Viaje creado 🌍','success');
  renderViajes();
}
function renderViajes() {
  const lista = document.getElementById('viajesLista');
  const myViajes = db.viajes.filter(v => v.participantes.includes(currentUser?.id));
  const filtrados = myViajes.filter(v => viajesTabActual === 'activos'
    ? v.estado !== 'completado' : v.estado === 'completado');
  if (!filtrados.length) {
    lista.innerHTML = `<div class="empty-state"><div class="es-icon">🌍</div><h3>Sin viajes ${viajesTabActual==='activos'?'activos':'completados'}</h3>
      <p>Toca + para crear un viaje</p></div>`;
    return;
  }
  lista.innerHTML = filtrados.map(v => {
    const gastado = totalGastado(v.id);
    const pct = pctUsed(v);
    const isActive = v.id === activeViajeId;
    const parts = v.participantes.map(pid=>getUser(pid)).filter(Boolean);
    return `<div class="viaje-card ${isActive?'active-viaje':''}">
      <div class="viaje-header">
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <div class="viaje-name">${v.nombre}</div>
            ${isActive?'<span class="badge badge-orange">Activo</span>':''}
            <span class="badge badge-${v.estado==='completado'?'gray':v.estado==='activo'?'success':'blue'}">${v.estado}</span>
          </div>
          <div class="viaje-dest">📍 ${v.destino||'Sin destino'} · ${fmtDate(v.fechaInicio)} → ${fmtDate(v.fechaFin)}</div>
        </div>
      </div>
      <div class="viaje-nums">
        <div><div class="viaje-num-label">Presupuesto</div><div class="viaje-num-val" style="font-size:13px">${fmtMoney(v.presupuesto,v.moneda)}</div></div>
        <div><div class="viaje-num-label">Gastado</div><div class="viaje-num-val" style="font-size:13px;color:${pct>=90?'var(--danger)':pct>=70?'var(--warning)':'var(--success)'}">${fmtMoney(gastado,v.moneda)}</div></div>
        <div><div class="viaje-num-label">Disponible</div><div class="viaje-num-val" style="font-size:13px">${fmtMoney(v.presupuesto-gastado,v.moneda)}</div></div>
      </div>
      <div class="progress-wrap"><div class="progress-bar ${pctClass(pct)}" style="width:${pct}%"></div></div>
      <div class="participantes-row">
        <span style="font-size:11px;color:var(--gray)">Con:</span>
        ${parts.map(u=>`<div class="p-avatar" style="background:${u.color}" title="${u.nombre}">${u.nombre.charAt(0).toUpperCase()}</div>`).join('')}
      </div>
      <div class="viaje-actions">
        ${!isActive?`<button class="btn btn-primary btn-sm" onclick="setActiveViaje('${v.id}')">🎯 Activar</button>`:''}
        ${v.estado!=='completado'?`<button class="btn btn-secondary btn-sm" onclick="completarViaje('${v.id}')">✅ Completar</button>`:''}
        <button class="btn btn-secondary btn-sm" onclick="abrirReporte('${v.id}')">📊 Reporte</button>
        <button class="btn btn-danger btn-sm" onclick="eliminarViaje('${v.id}')">🗑️</button>
      </div>
    </div>`;
  }).join('');
}
function switchViajesTab(tab, el) {
  viajesTabActual = tab;
  document.querySelectorAll('#viajesTabs .tab-pill').forEach(t=>t.classList.remove('active'));
  el.classList.add('active'); renderViajes();
}
function setActiveViaje(id) {
  activeViajeId = id; updateTopBar(); toast('Viaje activado','success'); renderViajes();
}
function completarViaje(id) {
  const v = db.viajes.find(x=>x.id===id);
  if (v) { v.estado='completado'; saveDB(); renderViajes(); toast('Viaje completado ✅','success'); }
}
function eliminarViaje(id) {
  if (!confirm('¿Eliminar este viaje y todos sus datos?')) return;
  db.viajes    = db.viajes.filter(v=>v.id!==id);
  db.gastos    = db.gastos.filter(g=>g.viajeId!==id);
  db.documentos = db.documentos.filter(d=>d.viajeId!==id);
  db.eventos   = db.eventos.filter(e=>e.viajeId!==id);
  if (activeViajeId===id) { activeViajeId=null; updateTopBar(); }
  saveDB(); renderViajes(); toast('Viaje eliminado','success');
}

// ===== GASTOS =====
function setupGastoModal() {
  const v = getActiveViaje();
  if (!v) { toast('Selecciona un viaje activo primero','error'); return; }
  const monedas = ['USD','EUR','MXN','COP','GTQ','HNL','GBP','CAD'];
  document.getElementById('gMoneda').innerHTML = monedas.map(m=>`<option value="${m}" ${m===v.moneda?'selected':''}>${m}</option>`).join('');
  document.getElementById('gPagadoPor').innerHTML = v.participantes.map(pid=>{
    const u=getUser(pid); return u?`<option value="${pid}" ${pid===currentUser?.id?'selected':''}>${u.nombre}</option>`:'';
  }).join('');
  document.getElementById('gParticipantesList').innerHTML = v.participantes.map(pid=>{
    const u=getUser(pid); return u?`<div class="participant-chip selected" data-uid="${pid}" onclick="toggleChip(this)">
      <div class="participant-dot" style="background:${u.color}"></div>${u.nombre}</div>`:'';
  }).join('');
  document.getElementById('gFecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('gDesc').value = '';
  document.getElementById('gMonto').value = '';
  document.getElementById('gComprobantePreview').innerHTML = '';
  tempFiles.gasto = null;
}
function handleGastoFile(e) {
  const file = e.target.files[0]; if (!file) return;
  if (file.size > 5*1024*1024) { toast('Archivo muy grande (máx 5MB)','error'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    tempFiles.gasto = { nombre:file.name, tipo:file.type, base64:ev.target.result };
    document.getElementById('gComprobantePreview').innerHTML = `<span class="badge badge-success">📎 ${file.name}</span>`;
  };
  reader.readAsDataURL(file);
}
function guardarGasto() {
  const v = getActiveViaje();
  if (!v) { toast('No hay viaje activo','error'); return; }
  const desc = document.getElementById('gDesc').value.trim();
  const monto = parseFloat(document.getElementById('gMonto').value);
  if (!desc || !monto || monto<=0) { toast('Completa descripción y monto','error'); return; }
  const divididoEntre = getSelectedChips('gParticipantesList');
  if (!divididoEntre.length) { toast('Selecciona al menos un participante','error'); return; }
  const g = {
    id:genId(), viajeId:v.id, descripcion:desc,
    categoria: document.getElementById('gCategoria').value,
    monto, moneda: document.getElementById('gMoneda').value,
    pagadoPor: document.getElementById('gPagadoPor').value,
    divididoEntre, fecha: document.getElementById('gFecha').value,
    comprobante: tempFiles.gasto, creadoEn: new Date().toISOString()
  };
  db.gastos.push(g); saveDB();
  closeModal('modalGasto'); toast('Gasto registrado 💳','success');
  renderGastos();
}
function renderGastos() {
  const v = getActiveViaje();
  if (!v) {
    document.getElementById('gastosPresupuesto').innerHTML = `<div class="empty-state"><div class="es-icon">🌍</div><h3>Sin viaje activo</h3><p>Ve a Viajes y activa uno</p></div>`;
    document.getElementById('gastosLista').innerHTML = '';
    return;
  }
  const gastado = totalGastado(v.id);
  const pct = pctUsed(v);
  const cats = {};
  getViajeGastos(v.id).forEach(g => cats[g.categoria]=(cats[g.categoria]||0)+g.monto);
  document.getElementById('gastosPresupuesto').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div><div class="viaje-num-label">Presupuesto</div><div style="font-size:18px;font-weight:800">${fmtMoney(v.presupuesto,v.moneda)}</div></div>
      <div><div class="viaje-num-label">Gastado</div><div style="font-size:18px;font-weight:800;color:${pct>=90?'var(--danger)':pct>=70?'var(--warning)':'var(--success)'}">${fmtMoney(gastado,v.moneda)}</div></div>
      <div><div class="viaje-num-label">Disponible</div><div style="font-size:18px;font-weight:800;color:${v.presupuesto-gastado<0?'var(--danger)':'var(--white)'}">${fmtMoney(v.presupuesto-gastado,v.moneda)}</div></div>
      <div><div class="viaje-num-label">Uso</div><div style="font-size:18px;font-weight:800">${pct.toFixed(0)}%</div></div>
    </div>
    <div class="progress-wrap" style="height:10px"><div class="progress-bar ${pctClass(pct)}" style="width:${pct}%"></div></div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
      ${Object.entries(cats).map(([cat,tot])=>`<span class="badge badge-gray">${catIcon(cat)} ${fmtMoney(tot,v.moneda)}</span>`).join('')}
    </div>`;
  let gastos = getViajeGastos(v.id);
  if (gastosTabActual !== 'todos') gastos = gastos.filter(g=>g.categoria===gastosTabActual);
  gastos.sort((a,b) => new Date(b.fecha)-new Date(a.fecha));
  if (!gastos.length) {
    document.getElementById('gastosLista').innerHTML = `<div class="empty-state"><div class="es-icon">💳</div><h3>Sin gastos aquí</h3><p>Toca + para agregar uno</p></div>`;
    return;
  }
  document.getElementById('gastosLista').innerHTML = gastos.map(g => {
    const pagador = getUser(g.pagadoPor);
    const cuota = g.monto / g.divididoEntre.length;
    return `<div class="list-item">
      <div class="list-icon-box cat-bg-${g.categoria}">${catIcon(g.categoria)}</div>
      <div class="list-main">
        <div class="list-title">${g.descripcion}</div>
        <div class="list-sub">Pagó: ${pagador?.nombre||'?'} · ${fmtDate(g.fecha)}</div>
        <div class="list-sub" style="color:var(--orange);margin-top:2px">${fmtMoney(cuota,g.moneda)} c/u entre ${g.divididoEntre.length}</div>
      </div>
      <div class="list-right">
        <div class="list-amount">${fmtMoney(g.monto,g.moneda)}</div>
        <div style="display:flex;gap:4px;justify-content:flex-end;margin-top:6px">
          ${g.comprobante?`<button class="btn btn-secondary btn-xs" onclick="verComprobante('${g.id}')">📎</button>`:''}
          <button class="btn btn-danger btn-xs" onclick="eliminarGasto('${g.id}')">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}
function switchGastosTab(tab, el) {
  gastosTabActual = tab;
  document.querySelectorAll('#pageGastos .tab-pill').forEach(t=>t.classList.remove('active'));
  el.classList.add('active'); renderGastos();
}
function eliminarGasto(id) {
  if (!confirm('¿Eliminar este gasto?')) return;
  db.gastos = db.gastos.filter(g=>g.id!==id); saveDB(); renderGastos(); toast('Gasto eliminado','success');
}
function verComprobante(gId) {
  const g = db.gastos.find(x=>x.id===gId);
  if (!g?.comprobante) return;
  const win = window.open('','_blank');
  if (g.comprobante.tipo.startsWith('image/')) {
    win.document.write(`<img src="${g.comprobante.base64}" style="max-width:100%;height:auto">`);
  } else {
    win.document.write(`<embed src="${g.comprobante.base64}" width="100%" height="100%" type="application/pdf">`);
  }
}

// ===== DEUDAS =====
function calcularDeudas(viajeId) {
  const v = db.viajes.find(x=>x.id===viajeId); if (!v) return {balances:{},transacciones:[]};
  const gastos = getViajeGastos(viajeId);
  const balance = {};
  v.participantes.forEach(pid => balance[pid] = 0);
  gastos.forEach(g => {
    const n = g.divididoEntre.length; if (!n) return;
    const share = g.monto / n;
    g.divididoEntre.forEach(pid => { balance[pid] = (balance[pid]||0) - share; });
    balance[g.pagadoPor] = (balance[g.pagadoPor]||0) + g.monto;
  });
  const creditors = [], debtors = [];
  Object.entries(balance).forEach(([uid,bal]) => {
    const b = Math.round(bal*100)/100;
    if (b > 0.01) creditors.push({uid, amount:b});
    else if (b < -0.01) debtors.push({uid, amount:-b});
  });
  const transacciones = [];
  let ci=0, di=0;
  while (ci<creditors.length && di<debtors.length) {
    const pay = Math.min(creditors[ci].amount, debtors[di].amount);
    if (pay > 0.01) transacciones.push({de:debtors[di].uid, a:creditors[ci].uid, monto:Math.round(pay*100)/100});
    creditors[ci].amount -= pay; debtors[di].amount -= pay;
    if (creditors[ci].amount < 0.01) ci++;
    if (debtors[di].amount < 0.01) di++;
  }
  return {balances:balance, transacciones};
}
function renderDeudas() {
  const v = getActiveViaje();
  const cont = document.getElementById('deudasContent');
  if (!v) { cont.innerHTML=`<div class="empty-state"><div class="es-icon">🌍</div><h3>Sin viaje activo</h3></div>`; return; }
  const gastos = getViajeGastos(v.id);
  if (!gastos.length) { cont.innerHTML=`<div class="empty-state"><div class="es-icon">⚖️</div><h3>Sin gastos registrados</h3><p>Agrega gastos para ver el balance</p></div>`; return; }
  const {balances, transacciones} = calcularDeudas(v.id);
  let html = `<div class="card"><div class="card-title">📊 Balance individual</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
    ${v.participantes.map(pid => {
      const u=getUser(pid); if(!u) return '';
      const b = Math.round((balances[pid]||0)*100)/100;
      return `<div class="balance-card ${b>0?'balance-positive':b<0?'balance-negative':''}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <div style="width:30px;height:30px;border-radius:50%;background:${u.color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">${u.nombre.charAt(0)}</div>
          <span style="font-size:13px;font-weight:600">${u.nombre}</span>
        </div>
        <div style="font-size:18px;font-weight:800;color:${b>0?'var(--success)':b<0?'var(--danger)':'var(--gray)'}">${b>0?'+':''}${fmtMoney(b,v.moneda)}</div>
        <div style="font-size:11px;color:var(--gray);margin-top:3px">${b>0?'Le deben':b<0?'Debe':'Al corriente'}</div>
      </div>`;
    }).join('')}
    </div></div>`;
  html += transacciones.length===0
    ? `<div class="card" style="margin-top:10px;text-align:center;padding:24px"><div style="font-size:32px">🎉</div><div style="font-weight:700;color:var(--success);margin-top:8px">¡Todos al corriente!</div></div>`
    : `<div class="card" style="margin-top:10px"><div class="card-title">💸 Pagos para liquidar</div>
      ${transacciones.map(tx => {
        const de=getUser(tx.de), a=getUser(tx.a);
        return `<div class="debt-card">
          <div style="width:38px;height:38px;border-radius:50%;background:${de?.color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0">${de?.nombre?.charAt(0)||'?'}</div>
          <div class="debt-info">
            <div class="debt-title">${de?.nombre||'?'} → ${a?.nombre||'?'}</div>
            <div class="debt-sub">Pago pendiente</div>
          </div>
          <div class="debt-amount">${fmtMoney(tx.monto,v.moneda)}</div>
        </div>`;
      }).join('')}
    </div>`;
  // Detalle compacto
  html += `<div class="card" style="margin-top:10px"><div class="card-title">📋 Detalle por gasto</div>
    ${gastos.map(g => {
      const pag=getUser(g.pagadoPor);
      return `<div style="padding:10px 0;border-bottom:1px solid var(--bg);display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${catIcon(g.categoria)} ${g.descripcion}</div>
          <div style="font-size:11px;color:var(--gray)">Pagó ${pag?.nombre||'?'} · ${fmtMoney(g.monto/g.divididoEntre.length,g.moneda)} c/u</div>
        </div>
        <div style="font-weight:700;font-size:14px;flex-shrink:0">${fmtMoney(g.monto,g.moneda)}</div>
      </div>`;
    }).join('')}
  </div>`;
  cont.innerHTML = html;
}

// ===== DOCUMENTOS =====
function setupDocModal() {
  document.getElementById('dFecha').value = new Date().toISOString().split('T')[0];
  document.getElementById('dNombre').value = '';
  document.getElementById('dDesc').value = '';
  document.getElementById('dArchivoPreview').innerHTML = '';
  tempFiles.doc = null;
}
function handleDocFile(e) {
  const file = e.target.files[0]; if (!file) return;
  if (file.size > 5*1024*1024) { toast('Máx 5MB','error'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    tempFiles.doc = {nombre:file.name, tipo:file.type, base64:ev.target.result};
    document.getElementById('dArchivoPreview').innerHTML = `<span class="badge badge-success">📎 ${file.name}</span>`;
  };
  reader.readAsDataURL(file);
}
function guardarDocumento() {
  const v = getActiveViaje();
  if (!v) { toast('No hay viaje activo','error'); return; }
  const nombre = document.getElementById('dNombre').value.trim();
  if (!nombre) { toast('El nombre es obligatorio','error'); return; }
  if (!tempFiles.doc) { toast('Sube un archivo','error'); return; }
  const d = {
    id:genId(), viajeId:v.id, usuarioId:currentUser.id,
    tipo: document.getElementById('dTipo').value,
    nombre, descripcion: document.getElementById('dDesc').value.trim(),
    fecha: document.getElementById('dFecha').value,
    archivo: tempFiles.doc, creadoEn: new Date().toISOString()
  };
  db.documentos.push(d); saveDB();
  closeModal('modalDocumento'); toast('Documento guardado 📄','success');
  renderDocumentos();
}
function renderDocumentos() {
  const v = getActiveViaje();
  const grid = document.getElementById('docsGrid');
  if (!v) { grid.innerHTML=`<div class="empty-state" style="grid-column:1/-1"><div class="es-icon">🌍</div><h3>Sin viaje activo</h3></div>`; return; }
  let docs = db.documentos.filter(d=>d.viajeId===v.id && d.usuarioId===currentUser.id);
  if (docsTabActual!=='todos') docs = docs.filter(d=>d.tipo===docsTabActual);
  if (!docs.length) {
    grid.innerHTML=`<div class="empty-state" style="grid-column:1/-1"><div class="es-icon">📄</div><h3>Sin documentos</h3><p>Sube boarding passes, reservas, vouchers...</p></div>`;
    return;
  }
  grid.innerHTML = docs.map(d=>`
    <div class="doc-card" onclick="verDocumento('${d.id}')">
      <div class="doc-icon">${tipoDocIcon(d.tipo)}</div>
      <div class="doc-name">${d.nombre}</div>
      <div class="doc-meta">${fmtDate(d.fecha)}</div>
    </div>`).join('');
}
function switchDocsTab(tab, el) {
  docsTabActual = tab;
  document.querySelectorAll('#pageDocumentos .tab-pill').forEach(t=>t.classList.remove('active'));
  el.classList.add('active'); renderDocumentos();
}
function verDocumento(id) {
  const d = db.documentos.find(x=>x.id===id); if (!d) return;
  document.getElementById('verDocTitulo').textContent = d.nombre;
  const isImg = d.archivo?.tipo?.startsWith('image/');
  document.getElementById('verDocBody').innerHTML = `
    <div style="margin-bottom:10px"><span class="badge badge-blue">${tipoDocIcon(d.tipo)} ${d.tipo}</span> <span style="font-size:12px;color:var(--gray)">${fmtDate(d.fecha)}</span></div>
    ${d.descripcion?`<p style="color:var(--gray);font-size:14px;margin-bottom:12px">${d.descripcion}</p>`:''}
    ${d.archivo?(isImg
      ?`<img src="${d.archivo.base64}" style="max-width:100%;border-radius:10px">`
      :`<embed src="${d.archivo.base64}" type="application/pdf" width="100%" height="420px" style="border-radius:10px">`)
    :'<p style="color:var(--gray)">Sin archivo</p>'}`;
  document.getElementById('verDocDeleteBtn').onclick = () => {
    if (confirm('¿Eliminar este documento?')) {
      db.documentos = db.documentos.filter(x=>x.id!==id);
      saveDB(); closeModal('modalVerDoc'); renderDocumentos(); toast('Eliminado','success');
    }
  };
  document.getElementById('modalVerDoc').style.display = 'flex';
}

// ===== EVENTOS =====
function setupEventoModal() {
  const now = new Date(); now.setSeconds(0);
  document.getElementById('eFechaHora').value = now.toISOString().slice(0,16);
  document.getElementById('eTitulo').value = '';
  document.getElementById('eDesc').value = '';
  document.getElementById('eLugar').value = '';
  document.getElementById('eArchivoPreview').innerHTML = '';
  tempFiles.evento = null;
}
function handleEventoFile(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    tempFiles.evento = {nombre:file.name, tipo:file.type, base64:ev.target.result};
    document.getElementById('eArchivoPreview').innerHTML = `<span class="badge badge-success">📎 ${file.name}</span>`;
  };
  reader.readAsDataURL(file);
}
function guardarEvento() {
  const v = getActiveViaje();
  if (!v) { toast('No hay viaje activo','error'); return; }
  const titulo = document.getElementById('eTitulo').value.trim();
  const fechaHora = document.getElementById('eFechaHora').value;
  if (!titulo || !fechaHora) { toast('Completa título y fecha/hora','error'); return; }
  const ev = {
    id:genId(), viajeId:v.id, usuarioId:currentUser.id,
    tipo: document.getElementById('eTipo').value,
    titulo, descripcion: document.getElementById('eDesc').value.trim(),
    fechaHora, lugar: document.getElementById('eLugar').value.trim(),
    archivo: tempFiles.evento, notificaciones:[1440,60],
    creadoEn: new Date().toISOString()
  };
  db.eventos.push(ev); saveDB();
  closeModal('modalEvento'); toast('Evento agregado 📅','success');
  scheduleNotifications(); renderEventos(); checkEventBadge();
}
function renderEventos() {
  const v = getActiveViaje();
  const lista = document.getElementById('eventosLista');
  if (!v) { lista.innerHTML=`<div class="empty-state"><div class="es-icon">🌍</div><h3>Sin viaje activo</h3></div>`; return; }
  const now = new Date();
  let eventos = db.eventos.filter(e=>e.viajeId===v.id && e.usuarioId===currentUser.id);
  eventos.sort((a,b) => new Date(a.fechaHora)-new Date(b.fechaHora));
  if (!eventos.length) {
    lista.innerHTML=`<div class="empty-state"><div class="es-icon">📅</div><h3>Sin eventos</h3><p>Agrega vuelos, check-ins, traslados...</p></div>`;
    return;
  }
  const proximos = eventos.filter(e=>new Date(e.fechaHora)>=now);
  const pasados  = eventos.filter(e=>new Date(e.fechaHora)<now);
  let html = '';
  if (proximos.length) {
    html += `<div style="font-size:12px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">Próximos</div>`;
    html += proximos.map(e=>renderEventoCard(e,false)).join('');
  }
  if (pasados.length) {
    html += `<div style="font-size:12px;font-weight:700;color:var(--gray);text-transform:uppercase;letter-spacing:.05em;margin:16px 0 10px">Pasados</div>`;
    html += pasados.map(e=>renderEventoCard(e,true)).join('');
  }
  lista.innerHTML = html;
}
function renderEventoCard(e, pasado) {
  const dt = new Date(e.fechaHora);
  const day = dt.getDate();
  const mon = dt.toLocaleString('es-MX',{month:'short'});
  const time = dt.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  return `<div class="event-card ${pasado?'pasado':''}">
    <div class="event-cal"><div class="event-day">${day}</div><div class="event-month">${mon}</div></div>
    <div class="event-body">
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
        <span>${tipoEventoIcon(e.tipo)}</span>
        <div class="event-title">${e.titulo}</div>
      </div>
      ${e.lugar?`<div class="event-detail">📍 ${e.lugar}</div>`:''}
      ${e.descripcion?`<div class="event-detail">${e.descripcion.slice(0,60)}${e.descripcion.length>60?'...':''}</div>`:''}
      <div class="event-time">🕐 ${time} hrs</div>
    </div>
    <div class="event-actions">
      ${e.archivo?`<button class="btn btn-secondary btn-xs" onclick="verArchivoEvento('${e.id}')">📎</button>`:''}
      <button class="btn btn-danger btn-xs" onclick="eliminarEvento('${e.id}')">🗑️</button>
    </div>
  </div>`;
}
function verArchivoEvento(id) {
  const e = db.eventos.find(x=>x.id===id); if (!e?.archivo) return;
  const win = window.open('','_blank');
  if (e.archivo.tipo.startsWith('image/')) win.document.write(`<img src="${e.archivo.base64}" style="max-width:100%">`);
  else win.document.write(`<embed src="${e.archivo.base64}" width="100%" height="100%" type="application/pdf">`);
}
function eliminarEvento(id) {
  if (!confirm('¿Eliminar este evento?')) return;
  db.eventos = db.eventos.filter(e=>e.id!==id);
  saveDB(); renderEventos(); checkEventBadge(); scheduleNotifications();
  toast('Evento eliminado','success');
}
function checkEventBadge() {
  const now = new Date();
  const in24h = new Date(now.getTime()+24*60*60*1000);
  const cnt = db.eventos.filter(e=>
    e.usuarioId===currentUser?.id &&
    new Date(e.fechaHora)>now && new Date(e.fechaHora)<=in24h
  ).length;
  const badge = document.getElementById('eventoBadge');
  badge.textContent = cnt;
  badge.style.display = cnt ? 'block' : 'none';
}

// ===== EXPORT EVENTOS =====
function exportarEventos() {
  const data = db.eventos.map(e => ({
    id:e.id, titulo:e.titulo, tipo:e.tipo, fechaHora:e.fechaHora,
    lugar:e.lugar||'', descripcion:e.descripcion||'',
    usuario: getUser(e.usuarioId)?.nombre||'',
    viaje: db.viajes.find(v=>v.id===e.viajeId)?.nombre||'',
    notificaciones: e.notificaciones||[1440,60]
  }));
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'eventos.json'; a.click();
  URL.revokeObjectURL(a.href);
  toast('eventos.json exportado','success');
}

// ===== NOTIFICATIONS =====
function requestBrowserNotifs() {
  if ('Notification' in window && Notification.permission==='default') {
    Notification.requestPermission().then(p => {
      if (p==='granted') { toast('🔔 Notificaciones activadas','success'); scheduleNotifications(); }
    });
  }
  setInterval(checkAndNotifyInApp, 5*60*1000);
  checkAndNotifyInApp();
}

// Programar notificaciones vía Service Worker
function scheduleNotifications() {
  if (!navigator.serviceWorker?.controller) return;
  const myEventos = db.eventos
    .filter(e=>e.usuarioId===currentUser?.id)
    .map(e => ({
      id:e.id, titulo:e.titulo, tipo:e.tipo, fechaHora:e.fechaHora,
      lugar:e.lugar||'', descripcion:e.descripcion||'',
      viaje: db.viajes.find(v=>v.id===e.viajeId)?.nombre||'',
      notificaciones:e.notificaciones||[1440,60]
    }));
  navigator.serviceWorker.controller.postMessage({
    type:'SCHEDULE_NOTIFICATIONS', eventos:myEventos
  });
}

// Notificaciones en primer plano
function checkAndNotifyInApp() {
  if (!currentUser || Notification.permission!=='granted') return;
  const now = new Date();
  db.eventos.filter(e=>e.usuarioId===currentUser.id).forEach(e => {
    const evTime = new Date(e.fechaHora);
    const diffMin = (evTime-now)/60000;
    if (diffMin>=1435 && diffMin<=1445 && !e._n24h) {
      showSWNotif(`⏰ Mañana: ${e.titulo}`, `${tipoEventoIcon(e.tipo)} ${evTime.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})} hrs${e.lugar?' · '+e.lugar:''}`, e.id+'_1440');
      e._n24h = true; saveDB();
    }
    if (diffMin>=55 && diffMin<=65 && !e._n1h) {
      showSWNotif(`⏰ En 1 hora: ${e.titulo}`, `${tipoEventoIcon(e.tipo)} ${evTime.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})} hrs${e.lugar?' · '+e.lugar:''}`, e.id+'_60');
      e._n1h = true; saveDB();
    }
  });
}
function showSWNotif(title, body, tag) {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({type:'SHOW_NOTIFICATION', title, body, tag});
  } else if (Notification.permission==='granted') {
    try { new Notification(title, {body, icon:'./icons/icon-192.png', tag}); } catch(e){}
  }
}

// ===== DASHBOARD =====
function renderDashboard() {
  const v = getActiveViaje();
  const noViaje = document.getElementById('dashNoViaje');
  const content = document.getElementById('dashContent');
  if (!v) { noViaje.style.display='block'; content.style.display='none'; return; }
  noViaje.style.display='none'; content.style.display='block';
  const gastos = getViajeGastos(v.id);
  const gastado = totalGastado(v.id);
  const pct = pctUsed(v);
  const {transacciones} = calcularDeudas(v.id);
  const now = new Date();
  const proxEventos = db.eventos
    .filter(e=>e.viajeId===v.id && e.usuarioId===currentUser.id && new Date(e.fechaHora)>now)
    .sort((a,b)=>new Date(a.fechaHora)-new Date(b.fechaHora));

  document.getElementById('dashStats').innerHTML = `
    <div class="stat-card">
      <div class="stat-icon">💰</div>
      <div class="stat-value" style="font-size:18px;color:${pct>=90?'var(--danger)':pct>=70?'var(--warning)':'var(--white)'}">${fmtMoney(v.presupuesto-gastado,v.moneda)}</div>
      <div class="stat-label">Disponible</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">💳</div>
      <div class="stat-value">${gastos.length}</div>
      <div class="stat-label">Gastos</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">⚖️</div>
      <div class="stat-value" style="color:${transacciones.length?'var(--warning)':'var(--success)'}">${transacciones.length}</div>
      <div class="stat-label">Deudas</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon">📅</div>
      <div class="stat-value">${proxEventos.length}</div>
      <div class="stat-label">Eventos próx.</div>
    </div>`;

  document.getElementById('dashPresupuestoCard').innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:8px">
      <div><div style="font-size:15px;font-weight:700">✈️ ${v.nombre}</div><div style="font-size:12px;color:var(--gray)">${v.destino||''}</div></div>
      <span class="badge badge-${v.estado==='activo'?'success':'blue'}">${v.estado}</span>
    </div>
    <div class="progress-wrap"><div class="progress-bar ${pctClass(pct)}" style="width:${pct}%"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--gray);margin-top:4px">
      <span>Gastado ${fmtMoney(gastado,v.moneda)}</span>
      <span>${pct.toFixed(0)}% de ${fmtMoney(v.presupuesto,v.moneda)}</span>
    </div>`;

  const recientes = [...gastos].sort((a,b)=>new Date(b.creadoEn)-new Date(a.creadoEn)).slice(0,4);
  document.getElementById('dashGastos').innerHTML = recientes.length
    ? recientes.map(g=>{
        const pag=getUser(g.pagadoPor);
        return `<div class="list-item">
          <div class="list-icon-          <div class="list-icon-box cat-bg-${g.categoria}">${catIcon(g.categoria)}</div>
          <div class="list-main"><div class="list-title">${g.descripcion}</div><div class="list-sub">${pag?.nombre||'?'} · ${fmtDate(g.fecha)}</div></div>
          <div class="list-right"><div class="list-amount">${fmtMoney(g.monto,g.moneda)}</div></div>
        </div>`;
      }).join('')
    : '<p style="color:var(--gray);font-size:14px;padding:12px 0">Sin gastos aún</p>';

  document.getElementById('dashEventos').innerHTML = proxEventos.slice(0,3).length
    ? proxEventos.slice(0,3).map(e=>{
        const dt=new Date(e.fechaHora);
        return `<div class="list-item">
          <div class="list-icon-box" style="background:rgba(255,107,53,0.12)">${tipoEventoIcon(e.tipo)}</div>
          <div class="list-main">
            <div class="list-title">${e.titulo}</div>
            <div class="list-sub">${fmtDate(e.fechaHora)} · ${dt.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})} hrs</div>
          </div>
        </div>`;
      }).join('')
    : '<p style="color:var(--gray);font-size:14px;padding:12px 0">Sin eventos próximos</p>';
}

// ===== REPORTE FINAL =====
function abrirReporte(viajeId) {
  const v = db.viajes.find(x => x.id === viajeId);
  if (!v) return;
  document.getElementById('reporteContent').innerHTML = generarReporteHTML(viajeId);
  document.getElementById('modalReporte').style.display = 'flex';
}

function generarReporteHTML(viajeId) {
  const v = db.viajes.find(x => x.id === viajeId);
  if (!v) return '';
  const gastos = getViajeGastos(viajeId);
  const gastado = gastos.reduce((s, g) => s + (g.monto || 0), 0);
  const pct = v.presupuesto ? Math.min(100, gastado / v.presupuesto * 100) : 0;
  const { balances, transacciones } = calcularDeudas(viajeId);
  const moneda = v.moneda;
  const dias = Math.max(1, Math.ceil((new Date(v.fechaFin) - new Date(v.fechaInicio)) / (1000*60*60*24)) + 1);
  const cats = {};
  gastos.forEach(g => { cats[g.categoria] = (cats[g.categoria] || 0) + g.monto; });
  const pagadoPorPersona = {};
  v.participantes.forEach(pid => pagadoPorPersona[pid] = 0);
  gastos.forEach(g => { pagadoPorPersona[g.pagadoPor] = (pagadoPorPersona[g.pagadoPor] || 0) + g.monto; });

  return `
  <div style="background:linear-gradient(135deg,var(--bg2),var(--bg3));border-radius:16px;padding:20px;margin-bottom:16px;border:1px solid var(--card)">
    <div style="font-size:28px;margin-bottom:6px">✈️</div>
    <div style="font-size:20px;font-weight:800;margin-bottom:4px">${v.nombre}</div>
    <div style="font-size:13px;color:var(--gray);margin-bottom:12px">📍 ${v.destino||'Sin destino'} &nbsp;·&nbsp; ${fmtDate(v.fechaInicio)} → ${fmtDate(v.fechaFin)} &nbsp;·&nbsp; ${dias} días</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      ${v.participantes.map(pid=>{const u=getUser(pid);return u?`<div style="display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.06);padding:5px 12px;border-radius:20px;font-size:12px;font-weight:600"><div style="width:20px;height:20px;border-radius:50%;background:${u.color};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700">${u.nombre.charAt(0)}</div>${u.nombre}</div>`:'';}).join('')}
    </div>
  </div>

  <div class="card">
    <div class="card-title">💰 Resumen financiero</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div style="background:var(--bg);border-radius:10px;padding:12px">
        <div style="font-size:11px;color:var(--gray);margin-bottom:3px">Presupuesto</div>
        <div style="font-size:17px;font-weight:800">${fmtMoney(v.presupuesto,moneda)}</div>
      </div>
      <div style="background:var(--bg);border-radius:10px;padding:12px">
        <div style="font-size:11px;color:var(--gray);margin-bottom:3px">Total gastado</div>
        <div style="font-size:17px;font-weight:800;color:${pct>=90?'var(--danger)':pct>=70?'var(--warning)':'var(--success)'}">${fmtMoney(gastado,moneda)}</div>
      </div>
      <div style="background:var(--bg);border-radius:10px;padding:12px">
        <div style="font-size:11px;color:var(--gray);margin-bottom:3px">Disponible</div>
        <div style="font-size:17px;font-weight:800;color:${v.presupuesto-gastado<0?'var(--danger)':'var(--white)'}">${fmtMoney(v.presupuesto-gastado,moneda)}</div>
      </div>
      <div style="background:var(--bg);border-radius:10px;padding:12px">
        <div style="font-size:11px;color:var(--gray);margin-bottom:3px">Uso del presupuesto</div>
        <div style="font-size:17px;font-weight:800">${pct.toFixed(1)}%</div>
      </div>
    </div>
    <div class="progress-wrap" style="height:10px"><div class="progress-bar ${pctClass(pct)}" style="width:${pct}%"></div></div>
    ${gastos.length?`<div style="font-size:12px;color:var(--gray);margin-top:8px;text-align:center">${gastos.length} gastos &nbsp;·&nbsp; promedio ${fmtMoney(gastado/gastos.length,moneda)}/gasto &nbsp;·&nbsp; ${fmtMoney(gastado/dias,moneda)}/día</div>`:''}
  </div>

  ${Object.keys(cats).length?`<div class="card">
    <div class="card-title">📊 Gasto por categoría</div>
    ${Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([cat,tot])=>{const p=gastado>0?(tot/gastado*100):0;return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-size:13px;font-weight:600">${catIcon(cat)} ${cat.charAt(0).toUpperCase()+cat.slice(1)}</span><span style="font-size:13px;font-weight:700">${fmtMoney(tot,moneda)} <span style="color:var(--gray);font-size:11px">(${p.toFixed(0)}%)</span></span></div><div style="background:rgba(255,255,255,0.06);border-radius:6px;height:6px;overflow:hidden"><div style="width:${p}%;height:100%;background:var(--orange);border-radius:6px"></div></div></div>`;}).join('')}
  </div>`:''}

  <div class="card">
    <div class="card-title">👥 Balance por participante</div>
    ${v.participantes.map(pid=>{
      const u=getUser(pid); if(!u) return '';
      const pagado=pagadoPorPersona[pid]||0;
      const balance=Math.round((balances[pid]||0)*100)/100;
      const cuota=gastos.reduce((s,g)=>g.divididoEntre.includes(pid)?s+g.monto/g.divididoEntre.length:s,0);
      return `<div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--bg)">
        <div style="width:40px;height:40px;border-radius:50%;background:${u.color};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;flex-shrink:0">${u.nombre.charAt(0).toUpperCase()}</div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:700">${u.nombre}</div>
          <div style="font-size:12px;color:var(--gray);margin-top:2px">Pagó: ${fmtMoney(pagado,moneda)} &nbsp;·&nbsp; Le corresponde: ${fmtMoney(cuota,moneda)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:18px;font-weight:800;color:${balance>0?'var(--success)':balance<0?'var(--danger)':'var(--gray)'}">${balance>0?'+':''}${fmtMoney(balance,moneda)}</div>
          <div style="font-size:11px;color:var(--gray);margin-top:2px">${balance>0?'Le deben':balance<0?'Debe':'Al corriente'}</div>
        </div>
      </div>`;
    }).join('')}
  </div>

  <div class="card">
    <div class="card-title">💸 Liquidación de deudas</div>
    ${transacciones.length===0
      ?`<div style="text-align:center;padding:16px 0"><div style="font-size:36px">🎉</div><div style="font-weight:700;color:var(--success);margin-top:8px;font-size:15px">¡Todos al corriente!</div><div style="font-size:13px;color:var(--gray);margin-top:4px">No hay deudas pendientes</div></div>`
      :transacciones.map(tx=>{const de=getUser(tx.de),a=getUser(tx.a);return `<div style="display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid var(--bg)"><div style="display:flex;align-items:center;gap:8px;flex:1"><div style="width:36px;height:36px;border-radius:50%;background:${de?.color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0">${de?.nombre?.charAt(0)||'?'}</div><div><div style="font-size:13px;font-weight:700">${de?.nombre||'?'}</div><div style="font-size:11px;color:var(--gray)">le paga a ${a?.nombre||'?'}</div></div></div><div style="font-size:13px;color:var(--gray)">→</div><div style="width:36px;height:36px;border-radius:50%;background:${a?.color};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;flex-shrink:0">${a?.nombre?.charAt(0)||'?'}</div><div style="font-size:18px;font-weight:800;color:var(--orange);min-width:80px;text-align:right">${fmtMoney(tx.monto,moneda)}</div></div>`;}).join('')}
  </div>

  <div class="card">
    <div class="card-title">📋 Detalle completo de gastos</div>
    ${gastos.length===0
      ?`<p style="color:var(--gray);font-size:14px;padding:12px 0">Sin gastos registrados</p>`
      :[...gastos].sort((a,b)=>new Date(a.fecha)-new Date(b.fecha)).map(g=>{
        const pag=getUser(g.pagadoPor);
        const parts=g.divididoEntre.map(pid=>getUser(pid)?.nombre).filter(Boolean);
        const cuota=g.monto/g.divididoEntre.length;
        return `<div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid var(--bg)">
          <div class="list-icon-box cat-bg-${g.categoria}" style="width:36px;height:36px;border-radius:8px;font-size:15px;flex-shrink:0;margin-top:2px">${catIcon(g.categoria)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.descripcion}</div>
            <div style="font-size:11px;color:var(--gray);margin-top:2px">Pagó: ${pag?.nombre||'?'} &nbsp;·&nbsp; ${fmtDate(g.fecha)}</div>
            <div style="font-size:11px;color:var(--orange);margin-top:1px">${fmtMoney(cuota,g.moneda)} c/u &nbsp;·&nbsp; Entre: ${parts.join(', ')}</div>
          </div>
          <div style="font-size:14px;font-weight:700;flex-shrink:0;text-align:right;padding-top:2px">${fmtMoney(g.monto,g.moneda)}</div>
        </div>`;
      }).join('')}
    ${gastos.length?`<div style="padding:12px 0 4px;text-align:right;font-size:16px;font-weight:800;color:var(--white)">TOTAL: ${fmtMoney(gastado,moneda)}</div>`:''}
  </div>`;
}

// ===== INIT =====
loadDB();
showLoginScreen();
setInterval(() => { if (currentUser) checkEventBadge(); }, 60000);
