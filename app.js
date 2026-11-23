'use strict';
/* ===== CONFIGURACIÓN: pega aquí tus 2 valores de Supabase (líneas 3 y 4) ===== */
const SUPABASE_URL = 'https://fpyxwpoxwsloezrnxemz.supabase.co';            // https://xxxx.supabase.co  (sin /rest/v1/)
const SUPABASE_ANON_KEY = 'sb_publishable_ZwtcunjfJAlfkXk6Wkjjig_xV2PmxkT';    // sb_publishable_...  (NUNCA la secret/service_role)
/* ============================================================================= */

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtFecha = t => new Date(t).toLocaleString('es-CO', {day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit'});
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c==='x'?r:(r&3|8)).toString(16); }));
const sb = /PEGA_AQUI/.test(SUPABASE_URL + SUPABASE_ANON_KEY) ? null : supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const POR_PAG = 50;
const S = { perfil:null, bodegas:[], bodega:null, prod:null, enviando:false, pag:1, total:0 };

/* ---------- Mensajes ---------- */
let tt;
function msg(t, tipo) { const e = $('#toast'); e.textContent = t; e.className = tipo || ''; e.hidden = false; clearTimeout(tt); tt = setTimeout(() => e.hidden = true, tipo === 'err' ? 6000 : 2500); }
const esRed = e => !e.code && /fetch|network|failed|load/i.test(e.message || '');
const opciones = (arr, ph) => `<option value="">${ph}</option>` + arr.map(o => `<option value="${o.id}">${esc(o.nombre)}</option>`).join('');

/* ---------- Sesión ---------- */
$('#f-login').onsubmit = async e => {
  e.preventDefault();
  const { error } = await sb.auth.signInWithPassword({ email: $('#l-email').value.trim(), password: $('#l-pass').value });
  if (error) return msg('Correo o contraseña incorrectos.', 'err');
  iniciar();
};
$('#salir').onclick = async () => { await sb.auth.signOut(); location.reload(); };

async function iniciar() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { $('#login').hidden = false; $('#app').hidden = true; return; }
  const { data: p, error } = await sb.from('perfiles').select('nombre,rol').eq('id', session.user.id).single();
  if (error || !p) return msg('No se pudo cargar tu perfil. Revisa la conexión.', 'err');
  S.perfil = p;
  $('#login').hidden = true; $('#app').hidden = false;
  $('#usuario').textContent = p.nombre + (p.rol === 'admin' ? ' (admin)' : '');
  $('#tab-admin').hidden = $('#r-anul-l').hidden = p.rol !== 'admin';
  $('#p-cant').parentElement.hidden = p.rol !== 'admin';   // el contador no define la cantidad del sistema
  await pintarBodegas();
  vaciarCola();
}

/* Carga las bodegas permitidas y rellena tarjetas y listas */
async function pintarBodegas() {
  const { data } = await sb.from('bodegas').select('id,nombre').order('id');
  S.bodegas = data || [];
  $('#bodegas').innerHTML = S.bodegas.length
    ? S.bodegas.map(x => `<button class="tarjeta" data-id="${esc(x.id)}"><span>${esc(x.id)}</span>${esc(x.nombre)}</button>`).join('')
    : '<p class="panel">No tienes bodegas asignadas. Pide al administrador que te las asigne.</p>';
  const ops = opciones(S.bodegas.map(b => ({ id: b.id, nombre: b.id + ' · ' + b.nombre })), 'Selecciona bodega…');
  ['#r-bod', '#a-bod', '#d-bod', '#u-bod', '#p-bod'].forEach(s => $(s).innerHTML = ops);
  $('#e-bods').innerHTML = S.bodegas.map(b => `<label class="chk"><input type="checkbox" value="${esc(b.id)}"> ${esc(b.id)} · ${esc(b.nombre)}</label>`).join('');
}
$$('#tabs button').forEach(b => b.onclick = () => {
  $$('#tabs button').forEach(x => x.classList.toggle('on', x === b));
  ['conteo', 'registros', 'producto', 'admin'].forEach(t => $('#t-' + t).hidden = t !== b.dataset.t);
});

/* ---------- 1) Selección de bodega ---------- */
$('#bodegas').onclick = async e => {
  const b = e.target.closest('.tarjeta'); if (!b) return;
  S.bodega = S.bodegas.find(x => x.id == b.dataset.id);
  const [u, en] = await Promise.all([
    sb.from('ubicaciones').select('id,nombre').eq('bodega_id', S.bodega.id).order('nombre'),
    sb.from('encargados_bodegas').select('encargados(id,nombre,activo)').eq('bodega_id', S.bodega.id)]);
  if (u.error || en.error) return msg('No se pudieron cargar encargados y ubicaciones.', 'err');
  $('#ubi').innerHTML = opciones(u.data, 'Selecciona ubicación…');
  $('#enc').innerHTML = opciones(en.data.map(r => r.encargados).filter(x => x && x.activo).sort((a, c) => a.nombre.localeCompare(c.nombre)), 'Selecciona encargado…');
  [$('#enc'), $('#ubi')].forEach(s => { if (s.options.length === 2) s.selectedIndex = 1; });   // si solo hay una opción, se elige sola
  $('#bodegas').hidden = true; $('#conteo').hidden = false; $('#ultimo').textContent = ''; resumen();
};
$('#cambiar').onclick = () => { S.bodega = null; $('#conteo').hidden = true; $('#bodegas').hidden = false; };
const txt = s => s.selectedIndex > 0 ? esc(s.options[s.selectedIndex].text) : '<em>sin elegir</em>';
function resumen() { $('#resumen').innerHTML = `<div><small>Bodega</small><b>${esc(S.bodega.id)} · ${esc(S.bodega.nombre)}</b></div><div><small>Encargado</small><b>${txt($('#enc'))}</b></div><div><small>Ubicación</small><b>${txt($('#ubi'))}</b></div>`; }
$('#enc').onchange = $('#ubi').onchange = resumen;   // el encargado y la ubicación solo cambian si el usuario los modifica

/* ---------- 2) Autocompletar referencia ---------- */
let deb;
$('#ref').oninput = () => {
  S.prod = null; $('#desc').textContent = ''; clearTimeout(deb);
  const q = $('#ref').value.trim().replace(/[,()%*\\]/g, ' ');
  if (q.length < 2) { $('#sug').hidden = true; return; }
  deb = setTimeout(async () => {
    const { data } = await sb.from('productos_catalogo').select('referencia,descripcion').eq('bodega_id', S.bodega.id)
      .or(`referencia.ilike.%${q}%,descripcion.ilike.%${q}%`).limit(8);
    $('#sug').innerHTML = (data || []).map(p => `<button type="button" data-r="${esc(p.referencia)}" data-d="${esc(p.descripcion)}"><b>${esc(p.referencia)}</b><br>${esc(p.descripcion)}</button>`).join('') || '<button type="button" disabled>Sin resultados</button>';
    $('#sug').hidden = false;
  }, 250);
};
$('#sug').onclick = e => { const b = e.target.closest('button[data-r]'); if (b) elegirProd(b.dataset.r, b.dataset.d); };
function elegirProd(r, d) { S.prod = { referencia: r, descripcion: d }; $('#ref').value = r; $('#desc').textContent = d; $('#sug').hidden = true; $('#cant').focus(); }
$('#ref').onkeydown = async e => {   // Enter (lector de códigos): búsqueda exacta
  if (e.key !== 'Enter') return; e.preventDefault();
  const { data } = await sb.from('productos_catalogo').select('referencia,descripcion').eq('bodega_id', S.bodega.id).eq('referencia', $('#ref').value.trim()).maybeSingle();
  data ? elegirProd(data.referencia, data.descripcion) : msg('Referencia no encontrada en esta bodega.', 'err');
};

/* ---------- Guardar conteo (con cola sin conexión) ---------- */
$('#f-conteo').onsubmit = async e => {
  e.preventDefault(); if (S.enviando) return;
  const enc = $('#enc').value, ubi = $('#ubi').value, ref = $('#ref').value.trim(), ct = $('#cant').value.trim().replace(',', '.');
  const cant = Number(ct);
  if (!enc || !ubi) return msg('Selecciona encargado y ubicación.', 'err');
  if (!ref) return msg('Escribe o escanea la referencia.', 'err');
  if (ct === '' || !isFinite(cant) || cant < 0) return msg('La cantidad debe ser un número igual o mayor a 0.', 'err');
  S.enviando = true; $('#guardar').disabled = true;
  try {
    if (!S.prod || S.prod.referencia !== ref) {            // verifica que la referencia exista en la bodega
      if (navigator.onLine) {
        const { data } = await sb.from('productos_catalogo').select('referencia,descripcion').eq('bodega_id', S.bodega.id).eq('referencia', ref).maybeSingle();
        if (!data) return msg('La referencia no existe en esta bodega.', 'err');
      }
    }
    const fila = { bodega_id: S.bodega.id, ubicacion_id: +ubi, encargado_id: +enc, referencia: ref, cantidad: cant, cliente_id: uuid() };
    const r = await enviar(fila);
    msg(r === 'ok' ? `Guardado ✔ ${ref} · ${cant}` : 'Sin conexión: guardado en el equipo, se enviará al reconectar.', r === 'ok' ? 'ok' : '');
    $('#ultimo').innerHTML = (r === 'ok' ? 'Último guardado: ' : 'Pendiente de envío: ') + '<b>' + esc(ref) + '</b> · ' + cant;
    if (navigator.vibrate) navigator.vibrate(60);
    $('#ref').value = $('#cant').value = ''; $('#desc').textContent = ''; S.prod = null;   // solo se limpian referencia y cantidad
    $('#ref').focus();
  } catch (err) { msg('No se guardó: ' + err.message, 'err'); }
  finally { S.enviando = false; $('#guardar').disabled = false; }
};
async function enviar(f) {
  const { error } = await sb.from('conteos').insert(f);
  if (!error || error.code === '23505') return 'ok';      // 23505 = ya estaba guardado (reenvío)
  if (esRed(error)) { cola([...cola(), f]); pend(); return 'cola'; }
  throw error;
}
const cola = v => v ? localStorage.setItem('cola_conteos', JSON.stringify(v)) : JSON.parse(localStorage.getItem('cola_conteos') || '[]');
function pend() { const n = cola().length; $('#pendientes').hidden = !n; $('#pendientes').textContent = n + ' pendiente(s)'; }
async function vaciarCola() {
  let q = cola(); pend();
  while (q.length && navigator.onLine) {
    const { error } = await sb.from('conteos').insert(q[0]);
    if (error && esRed(error)) break;
    if (error && error.code !== '23505') msg('Un registro pendiente fue rechazado: ' + error.message, 'err');
    q = q.slice(1); cola(q); pend();
  }
}
window.addEventListener('online', vaciarCola);

/* ---------- 3) Registros ---------- */
$('#r-bod').onchange = async () => {
  const b = $('#r-bod').value; $('#r-ubi').innerHTML = $('#r-enc').innerHTML = '<option value="">Todos</option>'; if (!b) return;
  const [u, en] = await Promise.all([sb.from('ubicaciones').select('id,nombre').eq('bodega_id', b).order('nombre'),
    sb.from('encargados_bodegas').select('encargados(id,nombre)').eq('bodega_id', b)]);
  $('#r-ubi').innerHTML = opciones(u.data || [], 'Todas'); $('#r-enc').innerHTML = opciones((en.data || []).map(r => r.encargados).filter(Boolean), 'Todos');
};
function filtros(q) {
  q = q.eq('bodega_id', $('#r-bod').value);
  if (!$('#r-anul').checked) q = q.eq('anulado', false);
  if ($('#r-desde').value) q = q.gte('creado_en', new Date($('#r-desde').value + 'T00:00:00').toISOString());
  if ($('#r-hasta').value) { const x = new Date($('#r-hasta').value + 'T00:00:00'); x.setDate(x.getDate() + 1); q = q.lt('creado_en', x.toISOString()); }
  if ($('#r-ubi').value) q = q.eq('ubicacion_id', $('#r-ubi').value);
  if ($('#r-enc').value) q = q.eq('encargado_id', $('#r-enc').value);
  const r = $('#r-ref').value.trim().replace(/[,()%*\\]/g, ' '); if (r) q = q.ilike('referencia', `%${r}%`);
  return q.order('creado_en', { ascending: false }).order('id', { ascending: false });   // más reciente primero
}
async function cargarRegistros() {
  if (!$('#r-bod').value) return msg('Selecciona una bodega.', 'err');
  const d = (S.pag - 1) * POR_PAG;
  const { data, count, error } = await filtros(sb.from('conteos_detalle').select('*', { count: 'exact' })).range(d, d + POR_PAG - 1);
  if (error) return msg('Error al consultar: ' + error.message, 'err');
  S.total = count; const adm = S.perfil.rol === 'admin';
  $('#r-tabla').innerHTML = '<tr><th>Fecha y hora</th><th>Referencia</th><th>Descripción</th><th>Cant.</th><th>Ubicación</th><th>Encargado</th>' + (adm ? '<th></th>' : '') + '</tr>' +
    data.map(r => `<tr class="${r.anulado ? 'anul' : ''}"><td>${fmtFecha(r.creado_en)}</td><td>${esc(r.referencia)}</td><td>${esc(r.descripcion)}</td><td class="n">${r.cantidad}</td><td>${esc(r.ubicacion)}</td><td>${esc(r.encargado)}</td>` +
      (adm ? `<td>${r.anulado ? 'Anulado' : `<button data-a="${r.id}">Anular</button>`}</td>` : '') + '</tr>').join('');
  $('#r-pag').textContent = `Página ${S.pag} de ${Math.max(1, Math.ceil(count / POR_PAG))} · ${count} registros`;
  $('#r-prev').disabled = S.pag <= 1; $('#r-next').disabled = S.pag * POR_PAG >= count;
}
$('#r-buscar').onclick = () => { S.pag = 1; cargarRegistros(); $('#r-tot').open = false; };
$('#r-prev').onclick = () => { S.pag--; cargarRegistros(); };
$('#r-next').onclick = () => { S.pag++; cargarRegistros(); };
$('#r-tabla').onclick = async e => {                      // anular (solo admin; la base registra quién y cuándo)
  const id = e.target.dataset.a; if (!id || !confirm('¿Anular este registro? No se borra, queda marcado como anulado.')) return;
  const { error } = await sb.from('conteos').update({ anulado: true }).eq('id', id);
  error ? msg('No se pudo anular: ' + error.message, 'err') : (msg('Registro anulado.', 'ok'), cargarRegistros());
};
$('#r-tot').ontoggle = async () => {
  if (!$('#r-tot').open || !$('#r-bod').value) return;
  const { data } = await sb.from('totales_conteo').select('*').eq('bodega_id', $('#r-bod').value).order('referencia').limit(500);
  $('#r-tot-t').innerHTML = '<tr><th>Referencia</th><th>Descripción</th><th>Total</th><th>Registros</th></tr>' +
    (data || []).map(r => `<tr><td>${esc(r.referencia)}</td><td>${esc(r.descripcion)}</td><td class="n">${r.total}</td><td class="n">${r.registros}</td></tr>`).join('');
};

/* ---------- CSV (exportar / importar) ---------- */
async function todo(build) { let out = [], i = 0; for (;;) { const { data, error } = await build().range(i, i + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) return out; i += 1000; } }
function descargar(nombre, cols, filas) {                 // separador ";" y BOM para que Excel (es-CO) lo abra bien
  const c = v => { v = v ?? ''; v = String(v); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const t = '\ufeff' + [cols.map(x => x[1]).join(';'), ...filas.map(r => cols.map(x => c(r[x[0]])).join(';'))].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t], { type: 'text/csv;charset=utf-8' })); a.download = nombre; a.click();
}
$('#r-csv').onclick = async () => {
  if (!$('#r-bod').value) return msg('Selecciona una bodega.', 'err');
  try {
    const f = (await todo(() => filtros(sb.from('conteos_detalle').select('*')))).map(r => ({ ...r, creado_en: fmtFecha(r.creado_en), anulado: r.anulado ? 'SI' : '' }));
    descargar('conteos.csv', [['creado_en', 'fecha_hora'], ['referencia', 'referencia'], ['descripcion', 'descripcion'], ['cantidad', 'cantidad'], ['ubicacion', 'ubicacion'], ['encargado', 'encargado'], ['anulado', 'anulado']], f);
  } catch (e) { msg('No se pudo exportar: ' + e.message, 'err'); }
};
function parseCSV(t) {
  t = t.replace(/^\ufeff/, ''); const l1 = t.split('\n')[0], sep = l1.split(';').length > l1.split(',').length ? ';' : ',';
  const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true;
    else if (ch === sep) { r.push(c); c = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(c); c = ''; if (r.some(x => x.trim())) rows.push(r); r = []; }
    else c += ch;
  }
  r.push(c); if (r.some(x => x.trim())) rows.push(r); return rows;
}
$('#a-cargar').onclick = async () => {
  const b = $('#a-bod').value, f = $('#a-file').files[0];
  if (!b || !f) return msg('Elige la bodega y el archivo CSV.', 'err');
  let rows = parseCSV(await f.text());
  if (rows.length && /^(referencia|ref|codigo|código)$/i.test(rows[0][0].trim())) rows.shift();
  const mapa = new Map();                                  // evita referencias repetidas en el mismo archivo
  rows.forEach(r => { const ref = (r[0] || '').trim(); if (ref) mapa.set(ref, { referencia: ref, bodega_id: b, descripcion: (r[1] || '').trim(), cantidad_sistema: Number(String(r[2] || '0').replace(',', '.')) || 0 }); });
  const lista = [...mapa.values()]; if (!lista.length) return msg('El archivo no tiene filas válidas.', 'err');
  $('#a-cargar').disabled = true;
  try {
    for (let i = 0; i < lista.length; i += 500) {
      const { error } = await sb.from('productos').upsert(lista.slice(i, i + 500), { onConflict: 'referencia,bodega_id' });
      if (error) throw error; msg(`Cargando… ${Math.min(i + 500, lista.length)} de ${lista.length}`);
    }
    msg(`Listo: ${lista.length} productos cargados.`, 'ok');
  } catch (e) { msg('Error al cargar: ' + e.message, 'err'); } finally { $('#a-cargar').disabled = false; }
};

/* ---------- 4) Diferencias (admin) ---------- */
const difQ = () => { let q = sb.from('diferencias').select('*').eq('bodega_id', $('#d-bod').value); if ($('#d-solo').checked) q = q.neq('diferencia', 0); return q.order('referencia'); };
$('#d-ver').onclick = async () => {
  if (!$('#d-bod').value) return msg('Selecciona una bodega.', 'err');
  const { data, error } = await difQ().limit(300);
  if (error) return msg('Error: ' + error.message, 'err');
  $('#d-tabla').innerHTML = '<tr><th>Referencia</th><th>Descripción</th><th>Sistema</th><th>Contado</th><th>Diferencia</th></tr>' +
    data.map(r => `<tr class="${r.diferencia != 0 ? 'dif' : ''}"><td>${esc(r.referencia)}</td><td>${esc(r.descripcion)}</td><td class="n">${r.cantidad_sistema}</td><td class="n">${r.cantidad_contada}</td><td class="n d">${r.diferencia}</td></tr>`).join('') +
    (data.length === 300 ? '<tr><td colspan="5">Se muestran 300; exporta el CSV para ver todo.</td></tr>' : '');
};
$('#d-csv').onclick = async () => {
  if (!$('#d-bod').value) return msg('Selecciona una bodega.', 'err');
  try { descargar('diferencias.csv', [['referencia', 'referencia'], ['descripcion', 'descripcion'], ['cantidad_sistema', 'sistema'], ['cantidad_contada', 'contado'], ['diferencia', 'diferencia']], await todo(difQ)); }
  catch (e) { msg('No se pudo exportar: ' + e.message, 'err'); }
};


/* ---------- Administración: catálogos y usuarios ---------- */
$$('#sub button').forEach(b => b.onclick = () => {
  $$('#sub button').forEach(x => x.classList.toggle('on', x === b));
  $$('.sp').forEach(p => p.hidden = p.id !== 'sp-' + b.dataset.s);
  if (b.dataset.s === 'usr') cargarUsuarios();
});
const fallo = (e, dup) => msg(e.code === '23505' && dup ? dup : 'Error: ' + e.message, 'err');
$('#b-add').onclick = async () => {
  const id = $('#b-id').value.trim(), nombre = $('#b-nom').value.trim();
  if (!id || !nombre) return msg('Escribe el código y el nombre.', 'err');
  const { error } = await sb.from('bodegas').insert({ id, nombre });
  if (error) return fallo(error, 'Ya existe una bodega con ese código.');
  $('#b-id').value = $('#b-nom').value = ''; msg('Bodega creada.', 'ok'); pintarBodegas();
};
$('#u-add').onclick = async () => {
  const b = $('#u-bod').value, filas = $('#u-txt').value.split('\n').map(x => x.trim()).filter(Boolean).map(nombre => ({ bodega_id: b, nombre }));
  if (!b || !filas.length) return msg('Elige la bodega y escribe al menos una ubicación.', 'err');
  const { error } = await sb.from('ubicaciones').insert(filas);
  if (error) return fallo(error);
  $('#u-txt').value = ''; msg(filas.length + ' ubicación(es) creada(s).', 'ok');
};
$('#e-add').onclick = async () => {
  const nombre = $('#e-nom').value.trim(), bs = $$('#e-bods input:checked').map(x => x.value);
  if (!nombre || !bs.length) return msg('Escribe el nombre y marca al menos una bodega.', 'err');
  const { data, error } = await sb.from('encargados').insert({ nombre }).select('id').single();
  if (error) return fallo(error);
  const r = await sb.from('encargados_bodegas').insert(bs.map(b => ({ encargado_id: data.id, bodega_id: b })));
  if (r.error) return fallo(r.error);
  $('#e-nom').value = ''; $$('#e-bods input').forEach(x => x.checked = false); msg('Encargado creado.', 'ok');
};
async function cargarUsuarios() {
  const [p, pb] = await Promise.all([sb.from('perfiles').select('id,nombre,rol').order('nombre'), sb.from('perfiles_bodegas').select('perfil_id,bodega_id')]);
  if (p.error) return msg('Error: ' + p.error.message, 'err');
  $('#usr-lista').innerHTML = p.data.map(u => {
    const mias = (pb.data || []).filter(x => x.perfil_id === u.id).map(x => x.bodega_id);
    return `<div class="usr"><b>${esc(u.nombre)}</b><select data-rol="${u.id}"><option ${u.rol === 'contador' ? 'selected' : ''}>contador</option><option ${u.rol === 'admin' ? 'selected' : ''}>admin</option></select>` +
      S.bodegas.map(b => `<label class="chk"><input type="checkbox" data-u="${u.id}" value="${esc(b.id)}" ${mias.includes(b.id) ? 'checked' : ''}> ${esc(b.id)} · ${esc(b.nombre)}</label>`).join('') + '</div>';
  }).join('');
}
$('#usr-lista').onchange = async e => {
  const t = e.target; let r;
  if (t.dataset.rol) r = await sb.from('perfiles').update({ rol: t.value }).eq('id', t.dataset.rol);
  else if (t.dataset.u) r = t.checked ? await sb.from('perfiles_bodegas').insert({ perfil_id: t.dataset.u, bodega_id: t.value })
                                      : await sb.from('perfiles_bodegas').delete().eq('perfil_id', t.dataset.u).eq('bodega_id', t.value);
  else return;
  r.error ? msg('No se guardó: ' + r.error.message, 'err') : msg('Cambio guardado.', 'ok');
};

/* Crear un producto a mano (referencia y descripción se guardan tal cual se escriben) */
$('#p-add').onclick = async () => {
  const b = $('#p-bod').value, ref = $('#p-ref').value.trim(), desc = $('#p-desc').value.trim(), ct = $('#p-cant').value.trim().replace(',', '.');
  const cant = S.perfil.rol !== 'admin' || ct === '' ? 0 : Number(ct);   // cantidad vacía = 0; el contador siempre crea con 0
  if (!b) return msg('Selecciona la bodega.', 'err');
  if (!ref) return msg('Escribe la referencia.', 'err');
  if (!desc) return msg('Escribe la descripción.', 'err');
  if (!isFinite(cant) || cant < 0) return msg('La cantidad en sistema debe ser un número igual o mayor a 0.', 'err');
  $('#p-add').disabled = true;
  const { error } = await sb.from('productos').insert({ referencia: ref, bodega_id: b, descripcion: desc, cantidad_sistema: cant });
  $('#p-add').disabled = false;
  if (error) return fallo(error, 'Esa referencia ya existe en esta bodega.');
  msg('Producto creado: ' + ref, 'ok');
  $('#p-ref').value = $('#p-desc').value = $('#p-cant').value = ''; $('#p-ref').focus();   // la bodega queda elegida para crear varios seguidos
};

/* ---------- Inicio ---------- */
if (/PEGA_AQUI/.test(SUPABASE_URL + SUPABASE_ANON_KEY)) msg('Falta pegar SUPABASE_URL y la clave en app.js (líneas 3 y 4).', 'err');
else iniciar();

/* ---------- PWA: permite instalar la app en la pantalla de inicio ---------- */
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
