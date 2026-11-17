/* TU LIGA · perfiles (planillero y coordinador) en MODO PROTOTIPO
 * Para qué: probar la web completa por usuario ANTES de crear el proyecto de Supabase.
 * Cómo funciona hoy: lee y escribe en window.DEMO_DATOS (memoria de esta pestaña; al recargar se pierde).
 * Cómo va a funcionar después: las mismas pantallas, pero cada "guardar" llama a Supabase (y de ahí se sincroniza al Drive de la liga).
 * Se carga ANTES de app.js; app.js lo llama por ganchos (TL_ROLES.vista / despues / cabecera / extra / tab / esCaptura).
 */
(function () {
  'use strict';
  /* Modo real (Supabase) o demostración. ?demo=1 fuerza la demostración. */
  var CFGR = window.LIGA_CONFIG || {};
  var REAL = !!(CFGR.supabaseUrl && CFGR.supabaseKey) && !/[?&]demo=1/.test(location.search);
  var D = REAL ? { vista_categorias: [], vista_equipos: [], vista_jugadores: [], vista_partidos: [], vista_partido_jugadores: [], vista_tabla: [], eventos: [] } : window.DEMO_DATOS;
  function TL() { return window.TL; }
  function S() { return window.TL.S; }
  function esc(t) { return TL().esc(t); }
  function dot(c) { return TL().dot(c); }

  /* ---------- usuario (simulado) ---------- */
  /* Las cuentas son de la LIGA, no de las personas: 1 coordinador y 5 planilleros. Una sola sesión por cuenta. */
  var USUARIOS = [{ id: 'coord', rol: 'coordinador', nombre: 'Coordinador', clave: 'demo' }].concat([1, 2, 3, 4, 5].map(function (n) { return { id: 'p' + n, rol: 'planillero', nombre: 'Planillero ' + n, clave: 'demo' }; }));
  var U = null;
  try { U = JSON.parse(sessionStorage.getItem('tl_user') || 'null'); } catch (e) { U = null; }
  if (REAL) U = null;                                  // en modo real, la sesión se verifica contra Supabase antes de creerla
  function guardarU() { try { sessionStorage.setItem('tl_user', JSON.stringify(U)); } catch (e) { /* sin almacenamiento */ } }
  var LK = 'tl_locks', FRESCO = 60000;
  function locks() { try { return JSON.parse(localStorage.getItem(LK) || '{}'); } catch (e) { return {}; } }
  function setLocks(o) { try { localStorage.setItem(LK, JSON.stringify(o)); } catch (e) { /* sin almacenamiento */ } }
  function enUsoPorOtro(id) { var l = locks()[id]; return !!(l && Date.now() - l.t < FRESCO && !(U && U.id === id && U.sid === l.sid)); }
  function latido() {
    if (!U) return;
    var o = locks(), l = o[U.id];
    if (l && l.sid !== U.sid && Date.now() - l.t < FRESCO) { expulsado(); return; }
    o[U.id] = { sid: U.sid, t: Date.now() }; setLocks(o);
  }
  function expulsado() {
    U = null; guardarU();
    Object.keys(CAP).forEach(function (k) { CAP[k].ov.classList.remove('on'); }); document.body.classList.remove('capabierta');
    cabecera(); location.hash = '#/vivo';
    if (window.TL) TL().toast('Otra persona tomó esta cuenta. Cerramos tu sesión en este dispositivo.');
  }
  setInterval(REAL ? latidoReal : latido, 15000);
  window.addEventListener('storage', function (e) { if (e.key === LK && U) { var l = locks()[U.id]; if (l && l.sid !== U.sid) expulsado(); } });
  var esPl = function () { return U && U.rol === 'planillero'; };
  var esCo = function () { return U && U.rol === 'coordinador'; };

  /* ---------- estado de pantalla y registro de Drive (simulado) ---------- */
  var ST = { pf: 'prox', gcat: null, evf: 'puntos', pegar: false, form: {} };
  var DRIVE = [];
  var PRIV = {};          // datos privados de jugadores (solo coordinadores)
  var CAP = {};           // planillas abiertas: id de partido -> { x, ov, ifr }

  function drive(hoja, accion) {
    var s = S().liga ? S().liga.slug : '';
    DRIVE.unshift({ t: new Date(), hoja: hoja, accion: accion, ruta: 'SUPER OFICIAL / ' + s + ' / ' + catNombre(gcat()) });
  }
  function nube() {
    if (REAL) return '<div class="nube">☁️ <span>' + '<b>Copia en Drive</b> · se actualiza sola cada pocos minutos' + '</span>' + (CFGR.driveHojaUrl ? '<a href="' + esc(CFGR.driveHojaUrl) + '" target="_blank" rel="noopener">Abrir</a>' : '') + '</div>';
    var u = DRIVE[0];
    return '<div class="nube">☁️ <span>' + (u ? '<b>Guardado en Drive</b> · ' + esc(u.hoja) + ' · hace instantes' : 'Drive al día · sin cambios en esta sesión') + '</span><a href="#/g-drive">Ver</a></div>';
  }

  /* ---------- datos (en la versión real: Supabase) ---------- */
  var FASES = ['Fase regular', 'Playoff', 'Cuartos de final', 'Semifinal', 'Final'];
  var POS = { B: 'Base', E: 'Escolta', A: 'Alero', AP: 'Ala-pívot', P: 'Pívot' };
  var PALETA = ['#1f6feb', '#d62839', '#2ea043', '#f5b800', '#8e44ad', '#ff7a1a', '#17a2b8', '#e91e63', '#111111', '#ffffff'];
  function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function ligaId() { return S().liga.id; }
  function cats() { return S().cats; }
  function gcat() { return ST.gcat && cats().some(function (c) { return c.id === ST.gcat; }) ? ST.gcat : S().catId; }
  function catNombre(id) { var c = cats().filter(function (x) { return x.id === id; })[0]; return c ? c.nombre : ''; }
  function partidos(cat) { return D.vista_partidos.filter(function (p) { return p.liga_id === ligaId() && (!cat || p.categoria_id === cat); }).sort(function (a, b) { return a.fecha_hora < b.fecha_hora ? -1 : 1; }); }
  function equipos(cat) { return D.vista_equipos.filter(function (e) { return e.categoria_id === cat; }); }
  function jugadores(eq) { return D.vista_jugadores.filter(function (j) { return j.equipo_id === eq; }).sort(function (a, b) { return (a.camiseta_habitual == null ? 99 : a.camiseta_habitual) - (b.camiseta_habitual == null ? 99 : b.camiseta_habitual); }); }
  function equipo(id) { return D.vista_equipos.filter(function (e) { return e.id === id; })[0]; }
  function partido(id) { return D.vista_partidos.filter(function (p) { return p.id === id; })[0]; }
  function posDe(j) { if (j.posicion) return j.posicion; var a = j.altura_cm || 185; return a < 180 ? 'B' : a < 186 ? 'E' : a < 192 ? 'A' : a < 198 ? 'AP' : 'P'; }
  function nombreDe(j) { return (j.nombre + ' ' + (j.apellido || '')).trim(); }

  var listo = false;
  function prep() {                                  // numera las fechas del fixture y marca al planillero del partido en vivo de la demo
    if (listo) return; listo = true;
    var porCat = {};
    D.vista_partidos.slice().sort(function (a, b) { return a.fecha_hora < b.fecha_hora ? -1 : 1; }).forEach(function (p) {
      var o = porCat[p.categoria_id] || (porCat[p.categoria_id] = { dias: [] }), d = ymd(new Date(p.fecha_hora));
      if (o.dias.indexOf(d) < 0) o.dias.push(d);
      p.nro_fecha = o.dias.indexOf(d) + 1;
      if (p.estado === 'en_vivo') p.claim = 'Planillero 2';
    });
  }
  prep();

  function recalcTabla(cat) {
    var rows = equipos(cat).map(function (e) { return { categoria_id: cat, equipo_id: e.id, equipo_nombre: e.nombre, color_principal: e.color_principal, pj: 0, pg: 0, pp: 0, pf: 0, pc: 0, dif: 0, pts: 0, posicion: 0 }; });
    D.vista_partidos.filter(function (p) { return p.categoria_id === cat && p.estado === 'cerrado'; }).forEach(function (p) {
      [[p.local_id, p.marcador_local, p.marcador_visitante], [p.visitante_id, p.marcador_visitante, p.marcador_local]].forEach(function (x) {
        var r = rows.filter(function (r) { return r.equipo_id === x[0]; })[0]; if (!r) return;
        r.pj++; r.pf += x[1]; r.pc += x[2]; if (x[1] > x[2]) r.pg++; else r.pp++;
      });
    });
    rows.forEach(function (r) { r.dif = r.pf - r.pc; r.pts = r.pg * 2 + r.pp; });
    rows.sort(function (a, b) { return b.pts - a.pts || b.dif - a.dif; }).forEach(function (r, i) { r.posicion = i + 1; });
    D.vista_tabla = D.vista_tabla.filter(function (r) { return r.categoria_id !== cat; }).concat(rows);
  }
  function sincNombres(eq) {                          // los partidos guardan nombre y color del equipo
    D.vista_partidos.forEach(function (p) {
      if (p.local_id === eq.id) { p.local_nombre = eq.nombre; p.local_color = eq.color_principal; }
      if (p.visitante_id === eq.id) { p.visitante_nombre = eq.nombre; p.visitante_color = eq.color_principal; }
    });
    D.vista_jugadores.forEach(function (j) { if (j.equipo_id === eq.id) j.equipo_nombre = eq.nombre; });
    recalcTabla(eq.categoria_id);
  }
  function refrescar(cat) { TL().recargar(); }

  /* ---------- ganchos hacia app.js ---------- */
  var RUTAS = ['entrar', 'cuenta', 'planilla', 'gestion', 'g-fixture', 'g-partido', 'g-armar', 'g-recibidos', 'g-clubes', 'g-club', 'g-equipos', 'g-equipo', 'g-jugador', 'g-drive', 'g-cuentas', 'g-liga', 'corregir'];
  function tab(k, def) {
    if (k === 'planilla') return 'planilla';
    if (k === 'gestion' || /^g-/.test(k)) return 'gestion';
    if (k === 'corregir') return 'partidos';
    if (k === 'entrar' || k === 'cuenta') return '';
    return def;
  }
  /* ================= MODO REAL (Supabase) ================= */
  function SB() { return window.TL.sb(); }
  var intentoRestaurar = false, CUENTAS = null, CUENTAS_T = 0, CUENTAS_CARGANDO = false;
  function emailDe(u) { return (u.rol === 'coordinador' ? 'coordinador' : 'planillero' + u.id.replace(/\D/g, '')) + '.' + S().liga.slug + '@example.com'; }
  function idDePerfil(p) { return p.rol === 'coordinador' ? 'coord' : 'p' + String(p.nombre || '').replace(/\D/g, ''); }
  function perfilReal(uidu) { return SB().from('perfiles').select('rol,nombre,liga_id,activo').eq('usuario_id', uidu).maybeSingle().then(function (r) { return r.data; }); }
  /* El servidor entrega como máximo 1000 filas por consulta: se pide por páginas hasta traer todo. */
  async function todo(mk) {
    var filas = [], desde = 0;
    for (;;) {
      var r = await mk().range(desde, desde + 999); if (r.error) throw r.error;
      var d = r.data || []; filas = filas.concat(d);
      if (d.length < 1000) break; desde += 1000;
    }
    return filas;
  }
  async function cargarReal() {                         // trae a memoria los datos de la liga (lo que esta cuenta puede ver)
    var sb = SB(), lid = ligaId();
    var c = await sb.from('vista_categorias').select('*').eq('liga_id', lid); D.vista_categorias = c.data || [];
    var ids = D.vista_categorias.map(function (x) { return x.id; });
    var r = await Promise.all([
      todo(function () { return sb.from('vista_equipos').select('*').in('categoria_id', ids).order('id'); }),
      todo(function () { return sb.from('vista_jugadores').select('*').eq('liga_id', lid).order('id').order('equipo_id'); }),
      todo(function () { return sb.from('vista_partidos').select('*').eq('liga_id', lid).order('fecha_hora').order('id'); }),
      todo(function () { return sb.from('vista_tabla').select('*').in('categoria_id', ids).order('categoria_id').order('posicion'); }),
      todo(function () { return sb.from('vista_planilla_claims').select('*').order('partido_id'); })
    ]);
    D.vista_equipos = r[0]; D.vista_jugadores = r[1]; D.vista_partidos = r[2]; D.vista_tabla = r[3];
    var claims = {}; r[4].forEach(function (x) { claims[x.partido_id] = x.planillero; });
    D.vista_partidos.forEach(function (p) { p.claim = claims[p.id] || null; });
    // posición y habilitación (cuentas de la liga) y datos privados (solo el coordinador; la base los filtra)
    var pl = await todo(function () { return sb.from('vista_plantel_planilla').select('*').eq('liga_id', lid).order('jugador_id'); }), pm = {};
    pl.forEach(function (x) { pm[x.jugador_id] = x; });
    D.vista_jugadores.forEach(function (j) { var x = pm[j.id]; if (x) { j.posicion = x.posicion; j.habilitado = x.habilitado; } });
    PRIV = {};
    if (U && U.rol === 'coordinador') { var pr = await todo(function () { return sb.from('jugadores_privado').select('*').order('jugador_id'); }); pr.forEach(function (x) { PRIV[x.jugador_id] = { doc: x.documento || '', nac: x.fecha_nacimiento || '', hab: x.habilitado === false ? 'no' : 'si' }; }); }
  }
  var ultPing = 0;
  function pingDrive() {                               // le avisa a la copia de Drive que hay cambios (máximo cada 30 s; si no hay enlace configurado, no hace nada)
    var u = CFGR.driveSyncUrl; if (!u || Date.now() - ultPing < 30000) return; ultPing = Date.now();
    try { fetch(u + (u.indexOf('?') < 0 ? '?' : '&') + 'accion=sincronizar', { mode: 'no-cors' }).catch(function () { /* la copia se actualiza sola igual */ }); } catch (e) { /* nada */ }
  }
  async function refrescarReal() { await cargarReal(); TL().recargar(); pingDrive(); }
  async function cargarEventosReal(id) {               // jugadas y plantel de un partido (para corregir o retomar)
    var r = await Promise.all([SB().from('eventos').select('*').eq('partido_id', id).order('seq'), SB().from('vista_partido_jugadores').select('*').eq('partido_id', id)]);
    D.eventos = D.eventos.filter(function (e) { return e.partido_id !== id; }).concat(okr(r[0]) || []);
    D.vista_partido_jugadores = D.vista_partido_jugadores.filter(function (x) { return x.partido_id !== id; }).concat(okr(r[1]) || []);
    EVL[id] = 1;
  }
  var EVL = {};
  function okr(r) { if (r && r.error) throw r.error; return r ? r.data : null; }
  function msgError(e) {
    var c = e && e.code, m = (e && e.message) || String(e || '');
    if (c === '23505') return 'Ya existe algo igual (nombre repetido).';
    if (c === '42501' || /permission|row-level|insufficient/i.test(m)) return 'Esta cuenta no tiene permiso para eso.';
    if (c === '23503') return 'No se puede: hay datos que dependen de esto.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sin conexión. Probá de nuevo.';
    return m || 'Algo salió mal.';
  }
  function uuid4() { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
  function esDataUrl(u) { return typeof u === 'string' && u.indexOf('data:') === 0; }
  async function subirLogo(dataUrl, ruta) {
    var blob = await (await fetch(dataUrl)).blob(), st = SB().storage.from('logos');
    var r = await st.upload(ruta, blob, { upsert: true, contentType: blob.type || 'image/png' }); if (r.error) throw r.error;
    return st.getPublicUrl(ruta).data.publicUrl + '?v=' + Date.now();
  }
  function abrirSesionReal(user, p, sid) {
    U = { id: idDePerfil(p), rol: p.rol, nombre: p.nombre, sid: sid, uid: user.id, ligaId: ligaId() }; guardarU();
    try { sessionStorage.setItem('tl_sid', sid); } catch (e) { /* sin almacenamiento */ }
    return cargarReal().then(function () {
      cabecera(); TL().toast('Entraste como ' + U.nombre + '.');
      location.hash = esPl() ? '#/planilla' : '#/gestion'; TL().recargar();
    });
  }
  function loginReal(u, clave, er) {
    return SB().auth.signInWithPassword({ email: emailDe(u), password: clave }).then(function (r) {
      if (r.error || !r.data || !r.data.user) { er.textContent = 'La contraseña no es correcta.'; return; }
      var user = r.data.user;
      return perfilReal(user.id).then(function (p) {
        if (!p || !p.activo || p.liga_id !== ligaId()) return SB().auth.signOut().then(function () { er.textContent = 'Esta cuenta no pertenece a esta liga.'; });
        var sid = uid();
        return SB().rpc('tomar_sesion', { p_sid: sid, p_forzar: false }).then(function (x) {
          if (x.error) { er.textContent = 'No pude abrir la sesión: ' + x.error.message; return SB().auth.signOut(); }
          if (x.data === 'ok') return abrirSesionReal(user, p, sid);
          modal('<p style="margin:0 0 14px;font-size:16px"><b>' + esc(p.nombre) + '</b> está abierta en otro dispositivo. Si entrás, esa sesión se cierra.</p>',
            [['Cancelar', function () { SB().auth.signOut(); return true; }], ['Entrar igual', function () {
              SB().rpc('tomar_sesion', { p_sid: sid, p_forzar: true }).then(function (y) { if (y.error) { TL().toast('No pude abrir la sesión.'); SB().auth.signOut(); } else abrirSesionReal(user, p, sid); });
              return true;
            }, 'p']]);
        });
      });
    });
  }
  function restaurarReal() {                           // al recargar: si había sesión y sigue siendo la vigente, se retoma
    if (!REAL || intentoRestaurar || !S().liga) return;
    intentoRestaurar = true;
    SB().auth.getSession().then(function (r) {
      var ses = r.data && r.data.session, sid = null; try { sid = sessionStorage.getItem('tl_sid'); } catch (e) { sid = null; }
      if (!ses || !sid) return;
      return perfilReal(ses.user.id).then(function (p) {
        if (!p || !p.activo || p.liga_id !== ligaId()) return SB().auth.signOut();
        return SB().rpc('latido_sesion', { p_sid: sid }).then(function (x) {
          if (x.data !== true) return SB().auth.signOut();
          U = { id: idDePerfil(p), rol: p.rol, nombre: p.nombre, sid: sid, uid: ses.user.id, ligaId: ligaId() }; guardarU();
          return cargarReal().then(function () { cabecera(); TL().pintar(true); });
        });
      });
    }).catch(function () { /* sin conexión: queda como visitante */ });
  }
  function latidoReal() {
    if (!U) return;
    SB().rpc('latido_sesion', { p_sid: U.sid }).then(function (r) { if (r.data === false) { SB().auth.signOut(); expulsado(); } });
  }
  function cargarCuentas() {
    if (CUENTAS_CARGANDO) return; CUENTAS_CARGANDO = true;
    SB().rpc('cuentas_de_liga', { p_liga: ligaId() }).then(function (r) { CUENTAS = r.data || []; CUENTAS_T = Date.now(); CUENTAS_CARGANDO = false; TL().pintar(true); }, function () { CUENTAS_CARGANDO = false; });
  }
  function cabecera() {
    var nav = document.getElementById('tabs');
    Array.prototype.slice.call(nav.querySelectorAll('[data-rol]')).forEach(function (n) { n.remove(); });
    if (U) {
      var a = document.createElement('a'); a.setAttribute('data-rol', '1');
      if (esPl()) { a.href = '#/planilla'; a.dataset.t = 'planilla'; a.innerHTML = '<i>🏀</i><span>Planilla</span>'; }
      else { a.href = '#/gestion'; a.dataset.t = 'gestion'; a.innerHTML = '<i>🛠️</i><span>Gestión</span>'; }
      nav.insertBefore(a, nav.firstChild);
    }
    var b = document.getElementById('btnLogin');
    if (b) { if (U) b.innerHTML = '<b class="av">' + (esPl() ? 'P' + U.nombre.replace(/\D/g, '') : 'C') + '</b>'; else b.textContent = '🔑'; b.setAttribute('aria-label', U ? 'Mi cuenta' : 'Entrar como planillero o coordinador'); b.onclick = function () { location.hash = U ? '#/cuenta' : '#/entrar'; }; }
    if (REAL && U && S().liga && U.ligaId && U.ligaId !== S().liga.id) { var viejo = U; U = null; guardarU(); SB().rpc('cerrar_sesion', { p_sid: viejo.sid }).then(function () { return SB().auth.signOut(); }); return cabecera(); }
    if (REAL) restaurarReal();
    var rb = document.getElementById('rolBadge');
    if (rb) rb.innerHTML = U && S().liga ? '<span class="rol">' + esc(U.nombre) + '</span>' : '';
  }
  function extra(p) {                                 // botones que el coordinador ve al consultar el fixture
    if (!esCo()) return '';
    if (p.estado === 'cerrado') return '<div class="acc2"><a class="btn" href="#/corregir/' + p.id + '">✏️ Corregir partido</a></div>';
    if (p.estado === 'programado') return '<div class="acc2"><a class="btn" href="#/g-partido/' + p.id + '">✏️ Editar en el fixture</a></div>';
    return '';
  }
  function esCaptura(id) { return !!CAP[id]; }

  function vista(p, r) {
    var k = p[0];
    if (RUTAS.indexOf(k) < 0) return null;
    if (k === 'entrar') return U ? vCuenta() : vLogin();
    if (!U) return '<h1>Entrá con tu usuario</h1><p class="muted">Esta pantalla es para planilleros y coordinadores.</p><a class="btn p full" href="#/entrar">Entrar</a>';
    if (k === 'cuenta') return vCuenta();
    if (k === 'planilla') return esPl() ? vPlanilla() : noPerm();
    if (!esCo()) return noPerm();
    switch (k) {
      case 'gestion': return vGestion();
      case 'g-fixture': return vGFixture(r.q);
      case 'g-partido': return vGPartido(p[1], r.q);
      case 'g-armar': return vGArmar();
      case 'g-recibidos': return vGRecibidos();
      case 'g-clubes': return vGClubes();
      case 'g-club': return vGClub(p[1]);
      case 'g-equipos': return vGEquipos(r.q);
      case 'g-equipo': return vGEquipo(p[1], r.q);
      case 'g-jugador': return vGJugador(p[1], r.q);
      case 'g-drive': return vGDrive();
      case 'g-cuentas': return vGCuentas();
      case 'g-liga': return vGLiga();
      case 'corregir': return vCorregir(p[1]);
    }
    return null;
  }
  function noPerm() { return '<h1>Sin acceso</h1><p class="muted">Tu perfil no tiene esta pantalla.</p>'; }

  function despues(r) {
    var pant = document.getElementById('pantalla');
    pant.oninput = function (e) {
      var t = e.target; if (!t || (t.id !== 'cBuscar' && t.id !== 'jBuscar')) return;
      if (t.id === 'cBuscar') ST.cq = t.value; else ST.jq = t.value;
      var pos = t.selectionStart; TL().pintar(true);
      var n = document.getElementById(t.id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {} }
    };
    pant.onchange = function (e) {
      var t = e.target;
      if (t && t.id === 'fLogo' && t.files && t.files[0]) {
        var nn = document.getElementById('eNombre'); if (nn) ST.form.nombre = nn.value;
        reducirImagen(t.files[0], 192, function (url, err) { if (err) { TL().toast(err); return; } ST.form.logo = url; TL().pintar(true); TL().toast('Logo cargado. Tocá “Guardar equipo” para confirmarlo.'); });
      }
      if (t && t.id === 'lLogo' && t.files && t.files[0]) {
        var ln = document.getElementById('lNombre'); if (ln) ST.form.lnombre = ln.value;
        reducirImagen(t.files[0], 192, function (url, err) { if (err) { TL().toast(err); return; } ST.form.llogo = url; TL().pintar(true); TL().toast('Logo cargado. Tocá “Guardar” para confirmarlo.'); });
      }
    };
    pant.onclick = function (e) {
      var b = e.target.closest('[data-a]'); if (!b) return;
      var f = A[b.dataset.a]; if (!f) return;
      e.preventDefault();
      if (REAL && AR[b.dataset.a]) { AR[b.dataset.a](b).catch(function (err) { TL().toast(msgError(err)); }); return; }
      f(b);
    };
    Array.prototype.slice.call(pant.querySelectorAll('input[type=number]')).forEach(function (i) { i.setAttribute('inputmode', 'numeric'); });
    Array.prototype.slice.call(pant.querySelectorAll('#jNom,#jApe,#eNombre,#fCancha')).forEach(function (i) { i.setAttribute('autocapitalize', 'words'); i.setAttribute('enterkeyhint', 'done'); });
    if (r.p[0] === 'partido' && esCo()) {             // en la ficha de un partido cerrado, el coordinador también puede corregir
      var p = partido(r.p[1]);
      if (p && p.estado === 'cerrado' && !pant.querySelector('[data-corr]')) pant.insertAdjacentHTML('afterbegin', '<div class="pw" data-corr="1"><div class="acc2"><a class="btn" href="#/corregir/' + p.id + '">✏️ Corregir partido</a></div></div>');
    }
  }

  /* ---------- tarjeta de fixture ---------- */
  function metaPartido(p) {
    var d = new Date(p.fecha_hora);
    return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + hm(d) + (p.cancha ? ' · ' + esc(p.cancha) : '') + ' · ' + esc(p.categoria_nombre) + (p.nro_fecha ? ' · Fecha ' + p.nro_fecha : '') + (p.grupo ? ' · Grupo ' + esc(p.grupo) : '');
  }
  function cardPj(p, pill, acc, bloq) {
    var m = p.estado === 'programado' ? 'vs' : p.marcador_local + ' - ' + p.marcador_visitante;
    return '<div class="pj' + (bloq ? ' bloq' : '') + '"><div class="meta"><span>' + metaPartido(p) + '</span>' + (pill || '') + '</div>' +
      '<div class="eqs"><span>' + TL().mark(p.local_id, p.local_color) + esc(p.local_nombre) + '</span><span class="m">' + m + '</span><span>' + esc(p.visitante_nombre) + TL().mark(p.visitante_id, p.visitante_color) + '</span></div>' + (acc ? '<div class="acc2">' + acc + '</div>' : '') + '</div>';
  }
  function porDia(arr, fn) {
    var out = '', ult = '';
    arr.forEach(function (p) {
      var d = new Date(p.fecha_hora), k = ymd(d);
      if (k !== ult) { ult = k; out += '<div class="dia"><span>' + esc(d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })) + '</span><span>' + (p.nro_fecha ? 'Fecha ' + p.nro_fecha : '') + '</span></div>'; }
      out += fn(p);
    });
    return out;
  }

  /* ================= LOGIN / CUENTA ================= */
  function vLogin() {
    return '<h1>Entrar</h1><p class="muted">Cuentas de la liga para planilleros y coordinador. Si sos jugador no necesitás entrar: mirá todo en la web.</p>' +
      '<label class="campo"><span>Cuenta</span><select id="lgCuenta">' + USUARIOS.map(function (u) { return '<option value="' + u.id + '">' + esc(u.nombre) + '</option>'; }).join('') + '</select></label>' +
      '<label class="campo"><span>Contraseña</span><input id="lgPass" type="password" placeholder="••••••••" autocomplete="current-password"></label><div class="err" id="lgErr"></div>' +
      '<button class="btn p full" data-a="login" type="button">Entrar</button>' +
      (REAL ? '<p class="sm muted centro" style="margin-top:14px">Cada cuenta admite una sola sesión a la vez. La contraseña te la da el coordinador de la liga.</p>' :
        '<div class="ayuda"><b>Prototipo de prueba</b> · la contraseña de todas las cuentas es <b>demo</b>. Accesos rápidos:</div>' +
        '<div class="rapidos">' + USUARIOS.map(function (u) { return '<button class="btn' + (u.rol === 'coordinador' ? ' p' : '') + '" data-a="rapido" data-id="' + u.id + '" type="button">' + (u.rol === 'coordinador' ? '🛠️ ' : '🏀 ') + esc(u.nombre) + '</button>'; }).join('') + '</div>' +
        '<p class="sm muted centro">Cada cuenta admite una sola sesión a la vez. Las cuentas son de la liga, no de las personas.</p>');
  }
  function vCuenta() {
    var cuerpo = esPl()
      ? 'Ves la pestaña <b>Planilla</b>: elegís un partido del fixture y lo capturás con Super Oficial. Un partido, un planillero.'
      : 'Ves la pestaña <b>Gestión</b>: armás el fixture, cargás equipos y jugadores, y corregís partidos desde el fixture. Es la única cuenta que modifica la liga.';
    return '<h1>Mi cuenta</h1><div class="card"><div class="fila"><span><b>' + esc(U.nombre) + '</b><br><span class="muted sm">' + (esPl() ? '🏀 Planillero' : '🛠️ Coordinador') + ' · ' + esc(S().liga.nombre) + '</span></span></div></div>' +
      '<div class="ayuda">' + cuerpo + '</div><div class="ayuda">Esta cuenta es <b>de la liga</b>, no tuya. Cerrá sesión al terminar para que otra persona pueda usarla.</div>' +
      (esCo() ? '<a class="btn full" href="#/g-cuentas" style="margin-bottom:10px">👥 Cuentas de la liga</a><a class="btn full" href="#/g-drive" style="margin-bottom:10px">☁️ Ver lo que se guardó en Drive</a>' : '') +
      (REAL ? '' : '<button class="btn full" data-a="reset" type="button">↺ Restablecer datos de la demo</button><div style="height:10px"></div>') + '<button class="btn mal full" data-a="logout" type="button">Salir</button>';
  }
  function vGCuentasReal() {
    if (!CUENTAS || Date.now() - CUENTAS_T > 8000) cargarCuentas();
    if (!CUENTAS) return '<h1>Cuentas de la liga</h1><div class="sk"><i></i><i></i></div>';
    var h = '<h1>Cuentas de la liga</h1><div class="ayuda">Son <b>6 cuentas de la liga</b>: la tuya (coordinador) y 5 de planillero. Quien tenga los datos de una cuenta la usa. Cada cuenta admite <b>una sola sesión</b> a la vez, y solo la de coordinador modifica la liga.</div>';
    h += CUENTAS.map(function (c) {
      var yo = U && c.usuario_id === U.uid, pa = c.partido_id ? partido(c.partido_id) : null;
      var pill = yo ? '<span class="pill ok">Tu sesión</span>' : c.en_uso ? '<span class="pill warn">En uso ahora</span>' : '<span class="pill">Libre</span>';
      return '<div class="card"><div class="fila"><span><b>' + esc(c.nombre) + '</b>' + (pa ? '<br><span class="muted sm">' + esc(pa.local_nombre + ' vs ' + pa.visitante_nombre) + '</span>' : '') + '</span>' + pill + '</div>' +
        '<div class="acc2" style="display:flex;gap:8px;margin-top:8px"><button class="mini" data-a="cclave" data-uid="' + c.usuario_id + '" data-nom="' + esc(c.nombre) + '" type="button">🔑 Cambiar clave</button>' + (c.en_uso && !yo ? '<button class="mini mal" data-a="liberarCuenta" data-uid="' + c.usuario_id + '" data-nom="' + esc(c.nombre) + '" type="button">🔓 Liberar cuenta</button>' : '') + '</div></div>';
    }).join('');
    return h + '<div class="ayuda">Si una clave se filtra o querés cortar un acceso, cambiala acá: la sesión abierta con la clave vieja se cierra.</div>';
  }
  function vGCuentas() {
    if (REAL) return vGCuentasReal();
    var h = '<h1>Cuentas de la liga</h1><div class="ayuda">Son <b>6 cuentas de la liga</b>: la tuya (coordinador) y 5 de planillero. Quien tenga los datos de una cuenta la usa. Cada cuenta admite <b>una sola sesión</b> a la vez, y solo la de coordinador modifica la liga.</div>';
    h += USUARIOS.map(function (u) {
      var yo = U && U.id === u.id, uso = enUsoPorOtro(u.id);
      var cl = partidos().filter(function (p) { return p.claim === u.nombre && p.estado !== 'cerrado'; })[0];
      var pill = yo ? '<span class="pill ok">Tu sesión</span>' : uso ? '<span class="pill warn">En uso ahora</span>' : '<span class="pill">Libre</span>';
      return '<div class="card"><div class="fila"><span><b>' + esc(u.nombre) + '</b>' + (cl ? '<br><span class="muted sm">' + esc(cl.local_nombre + ' vs ' + cl.visitante_nombre) + '</span>' : '') + '</span>' + pill + '</div>' +
        '<div class="acc2" style="display:flex;gap:8px;margin-top:8px"><button class="mini" data-a="cclave" data-id="' + u.id + '" type="button">🔑 Cambiar clave</button>' + (uso ? '<button class="mini mal" data-a="liberarCuenta" data-id="' + u.id + '" type="button">🔓 Liberar cuenta</button>' : '') + '</div></div>';
    }).join('');
    return h + '<div class="ayuda">Si una clave se filtra o querés cortar un acceso, cambiala acá: la sesión abierta con la clave vieja se cierra.</div>';
  }

  /* ================= PLANILLERO ================= */
  function vPlanilla() {
    var f = ST.pf, hoy = ymd(new Date()), lista = partidos();
    var filtradas = lista.filter(function (p) { return f === 'cerr' ? p.estado === 'cerrado' : f === 'hoy' ? ymd(new Date(p.fecha_hora)) === hoy && p.estado !== 'cerrado' : p.estado !== 'cerrado'; });
    if (f === 'cerr') filtradas.reverse();
    var chip = function (k, t) { return '<button class="chip' + (f === k ? ' on' : '') + '" data-a="pf" data-v="' + k + '" type="button">' + t + '</button>'; };
    var h = '<h1>Elegí el partido</h1><p class="muted sm" style="margin-top:-6px">Sale del fixture de tu liga. Si el coordinador lo cambia, se actualiza acá.</p><div class="chips">' + chip('prox', 'Próximos') + chip('hoy', 'Hoy') + chip('cerr', 'Cerrados') + '</div>';
    if (!filtradas.length) h += '<p class="vacio">No hay partidos en esta lista.</p>';
    h += porDia(filtradas, function (p) {
      if (p.estado === 'cerrado') return cardPj(p, '<span class="pill ok">Final</span>');
      var mio = p.claim === U.nombre;
      if (p.claim && !mio) return cardPj(p, '<span class="pill warn">En juego · ' + esc(p.claim) + '</span>', '<a class="btn" href="#/partido/' + p.id + '">👁 Mirar en vivo</a>', true);
      var faltan = [p.local_id, p.visitante_id].filter(function (id) { return jugadores(id).length < 5; }).map(function (id) { return equipo(id).nombre; });
      if (faltan.length) return cardPj(p, '<span class="pill">Falta plantel</span>', '<span class="sm muted">Faltan jugadores en ' + esc(faltan.join(' y ')) + '. Avisale al coordinador.</span>', true);
      return cardPj(p, mio ? '<span class="pill warn">Lo llevás vos</span>' : '<span class="pill">Libre</span>',
        '<button class="btn p" data-a="abrir" data-id="' + p.id + '" type="button">' + (mio ? '▶ Continuar planilla' : '🏀 Empezar planilla') + '</button>');
    });
    return h + '<div class="ayuda">Un partido, un planillero: al empezar, el partido queda tuyo y nadie más puede abrirlo. Si se te corta, volvés a entrar y seguís donde estabas.</div>';
  }
  function payload(p) {
    var teams = {}, ids = {}, n = 0, keyDe = {};
    equipos(p.categoria_id).forEach(function (e) {
      var k = 'E' + (++n); keyDe[e.id] = k; ids[k] = e.id;
      teams[k] = { nombre: e.nombre, escudo: e.logo_url || null, c1: e.color_principal, c2: e.color_alternativo || '#FFFFFF', jug: jugadores(e.id).filter(function (j) { return j.habilitado !== false; }).map(function (j) { return { n: nombreDe(j), alt: j.altura_cm || 185, pos: posDe(j), cam: j.camiseta_habitual, id: j.id }; }) };
    });
    var tabla0 = {};
    D.vista_tabla.filter(function (t) { return t.categoria_id === p.categoria_id; }).forEach(function (t) { if (keyDe[t.equipo_id]) tabla0[keyDe[t.equipo_id]] = { pj: t.pj, pg: t.pg, pp: t.pp, pf: t.pf, pc: t.pc }; });
    Object.keys(teams).forEach(function (k) { if (!tabla0[k]) tabla0[k] = { pj: 0, pg: 0, pp: 0, pf: 0, pc: 0 }; });
    var d = new Date(p.fecha_hora);
    var rt = p.estado === 'en_vivo' ? retomar(p, teams) : null;
    return { retomar: rt, id: p.id, liga: S().liga.slug, ligaNombre: S().liga.nombre, ligaLogo: S().liga.logo_url || null, cat: p.categoria_nombre, fase: p.fase, fecha: ymd(d), hora: hm(d), cancha: p.cancha || '', nro: p.nro_fecha, local: keyDe[p.local_id], visit: keyDe[p.visitante_id], teams: teams, ids: ids, tabla0: tabla0 };
  }
  function retomar(p, teams) {                        // reconstruye la planilla desde las jugadas guardadas
    var SOP = { P1: 1, P2: 1, P3: 1, E1: 1, E2: 1, E3: 1, FALTA: 1, TM: 1, QUINTETO: 1, CAMBIO: 1, REB: 1, AST: 1, ROB: 1, PER: 1 };
    var evs = evsVig(p.id).filter(function (x) { return !x.anul && SOP[x.e.tipo] && (x.e.equipo === 'local' || x.e.equipo === 'visitante'); }).map(function (x) { return x.e; }).sort(function (a, b) { return a.seq - b.seq; });
    if (!evs.length) return null;
    var llave = {}; Object.keys(teams).forEach(function (k) { teams[k].jug.forEach(function (j, i) { llave[j.id] = k + '-' + (i + 1); }); });
    var nuevo = {}; evs.forEach(function (e, i) { nuevo[e.id] = i + 1; });
    var pj = D.vista_partido_jugadores.filter(function (r) { return r.partido_id === p.id; }).map(function (r) { return { eq: r.equipo_id === p.local_id ? 'local' : 'visitante', id: llave[r.jugador_id], cam: r.camiseta, tit: r.titular }; }).filter(function (q) { return q.id; });
    var T = { E1: 'X1', E2: 'X2', E3: 'X3' };
    var mapa = {}; evs.forEach(function (e, i) { mapa[i + 1] = e.id; });
    return { mapa: mapa, pj: pj, arb: p.arbitros || [], mesa: [p.cronometrista || '', ''], ev: evs.map(function (e, i) {
      return { id: i + 1, seq: i + 1, tipo: T[e.tipo] || e.tipo, equipo: e.equipo, jug: e.jugador_id ? llave[e.jugador_id] || null : null, j2: e.jugador2_id ? llave[e.jugador2_id] || null : null, cuarto: e.cuarto, rs: e.reloj_seg || 0, det: e.detalle || null, ref: e.ref ? nuevo[e.ref] || null : null };
    }) };
  }
  function abrirCaptura(p) {
    var c = CAP[p.id];
    if (!c) {
      c = CAP[p.id] = { x: payload(p) }; c.sent = (c.x.retomar && c.x.retomar.mapa) || {}; c.anul = {}; c.listo = !!c.x.retomar;
      var ov = document.createElement('div'); ov.className = 'capov';
      ov.innerHTML = '<div class="capbar"><a data-cap="1">← Volver a TU LIGA</a><b></b><span class="pill">Super Oficial</span></div><iframe title="Super Oficial"></iframe>';
      ov.querySelector('b').textContent = p.local_nombre + ' vs ' + p.visitante_nombre;
      c.ifr = ov.querySelector('iframe'); c.ov = ov;
      c.ifr.name = JSON.stringify(c.x);
      c.ifr.src = 'captura.html';
      ov.querySelector('[data-cap]').onclick = function () { cerrarCaptura(p.id); };
      document.body.appendChild(ov);
    }
    c.ov.classList.add('on'); document.body.classList.add('capabierta');
  }
  function cerrarCaptura(id) {
    var c = CAP[id], p = partido(id);
    if (c) { c.ov.classList.remove('on'); if (p && p.estado === 'cerrado') { c.ov.remove(); delete CAP[id]; } }
    document.body.classList.remove('capabierta');
    if (p && p.estado === 'cerrado') location.hash = '#/partidos'; else TL().pintar();
  }
  function convertir(p, c, m) {                        // eventos y plantel de Super Oficial -> formato de la web
    var x = c.x, T = { X1: 'E1', X2: 'E2', X3: 'E3' };
    var real = function (idj) { if (!idj) return null; var a = idj.split('-'), t = x.teams[a[0]]; return t && t.jug[+a[1] - 1] ? t.jug[+a[1] - 1].id : null; };
    var pj = m.pj.map(function (q) {
      var a = q.id.split('-'), t = x.teams[a[0]], j = t.jug[+a[1] - 1];
      return { partido_id: p.id, jugador_id: j.id, nombre_completo: j.n, altura_cm: j.alt, equipo_id: x.ids[a[0]], camiseta: +q.cam || 0, titular: !!q.tit };
    });
    var evs = m.ev.map(function (e) {
      return { id: 'ev-' + p.id + '-' + e.id, seq: e.seq, partido_id: p.id, tipo: T[e.tipo] || e.tipo, equipo: e.equipo, jugador_id: real(e.jug), jugador2_id: real(e.j2), cuarto: e.cuarto, reloj_seg: Math.round(e.rs), detalle: e.det, ref: e.ref ? 'ev-' + p.id + '-' + e.ref : null, anula: null };
    });
    D.vista_partido_jugadores = D.vista_partido_jugadores.filter(function (r) { return r.partido_id !== p.id; }).concat(pj);
    D.eventos = D.eventos.filter(function (e) { return e.partido_id !== p.id; }).concat(evs);
    return { pj: pj, evs: evs };
  }
  /* ---- planilla en modo real: plantel, jugadas y cierre viajan a Supabase en orden, de a una tanda por vez ---- */
  function syncReal(p, c, m) {
    c.pend = m;
    if (c.trabajando) return;
    c.trabajando = true;
    (async function () {
      try { while (c.pend) { var msg = c.pend; c.pend = null; await volcar(p, c, msg); } c.falla = null; }
      catch (e) {
        TL().toast('No pude guardar en la base: ' + msgError(e));
        c.falla = c.falla || m; c.pend = c.pend || null;
        setTimeout(function () { if (c.falla && !c.trabajando) { var f = c.falla; c.falla = null; syncReal(p, c, f); } }, 8000);
      }
      c.trabajando = false;
    })();
  }
  async function volcar(p, c, m) {
    var sb = SB(), x = c.x;
    var real = function (id) { if (!id) return null; var a = id.split('-'), t = x.teams[a[0]]; return t && t.jug[+a[1] - 1] ? t.jug[+a[1] - 1].id : null; };
    if (!c.listo) {                                    // primera vez: deja armada la planilla y abre el partido
      var pj = m.pj.map(function (q) { var a = q.id.split('-'), j = x.teams[a[0]].jug[+a[1] - 1]; return { jugador_id: j.id, equipo_id: x.ids[a[0]], camiseta: +q.cam || 0, titular: !!q.tit }; });
      okr(await sb.rpc('cargar_planilla', { p_partido: p.id, p_jugadores: pj, p_arbitros: (m.arb || []).filter(Boolean), p_cronometrista: (m.mesa && m.mesa[0]) || null }));
      if (p.estado === 'programado') okr(await sb.rpc('abrir_partido', { p_partido: p.id }));
      p.estado = 'en_vivo'; c.listo = true;
    }
    var vivos = {}; m.ev.forEach(function (e) { vivos[e.id] = true; });
    var anular = Object.keys(c.sent).filter(function (k) { return !vivos[k] && !c.anul[k]; });      // jugadas que ya no están vigentes
    if (anular.length) {
      okr(await sb.from('eventos').insert(anular.map(function (k) { return { partido_id: p.id, tipo: 'ANULA', anula: c.sent[k], motivo: 'corrección en la planilla', cuarto: m.cuarto }; })));
      anular.forEach(function (k) { c.anul[k] = true; });
    }
    var nuevas = m.ev.filter(function (e) { return !c.sent[e.id]; }).sort(function (a, b) { return a.seq - b.seq; });
    if (nuevas.length) {
      var ids = {}; nuevas.forEach(function (e) { ids[e.id] = uuid4(); });
      var T = { X1: 'E1', X2: 'E2', X3: 'E3' };
      okr(await sb.from('eventos').insert(nuevas.map(function (e) {
        return { id: ids[e.id], partido_id: p.id, tipo: T[e.tipo] || e.tipo, equipo: e.equipo, jugador_id: real(e.jug), jugador2_id: real(e.j2), cuarto: e.cuarto, reloj_seg: Math.max(0, Math.round(e.rs)), detalle: e.det, ref: e.ref ? (c.sent[e.ref] || ids[e.ref] || null) : null };
      })));
      nuevas.forEach(function (e) { c.sent[e.id] = ids[e.id]; });
    }
    p.marcador_local = m.l; p.marcador_visitante = m.v; p.cuarto_actual = m.cuarto;
    if (m.cerrado && !c.cerrado) {
      okr(await sb.rpc('cerrar_partido', { p_partido: p.id }));
      c.cerrado = true; p.estado = 'cerrado'; TL().limpiar(p.id);
      await refrescarReal(); TL().toast('✅ Partido guardado: ya está en el fixture y en la tabla.');
    } else if (!c.ult || Date.now() - c.ult > 5000) { c.ult = Date.now(); TL().recargar(); }
  }
  window.addEventListener('message', function (ev) {
    var m = ev.data; if (!m || m.tl !== 'cap') return;
    var c = CAP[m.id]; if (!c || ev.source !== c.ifr.contentWindow) return;
    var p = partido(m.id); if (!p || m.fase < 3) return;
    if (REAL) { syncReal(p, c, m); return; }
    var estaba = p.estado;
    if (p.estado === 'programado') { p.estado = 'en_vivo'; drive('BASE › Partidos', 'partido en vivo: ' + p.local_nombre + ' vs ' + p.visitante_nombre); }
    p.claim = U ? U.nombre : p.claim; p.captura = true;
    p.marcador_local = m.l; p.marcador_visitante = m.v; p.cuarto_actual = m.cuarto;
    p.arbitros = (m.arb || []).filter(Boolean); p.cronometrista = (m.mesa && m.mesa[0]) || null;
    var conv = convertir(p, c, m);
    if (m.cerrado && estaba !== 'cerrado') {
      p.estado = 'cerrado';
      recalcTabla(p.categoria_id);
      drive('BASE › Partidos', 'fila cerrada: ' + p.local_nombre + ' ' + m.l + ' - ' + m.v + ' ' + p.visitante_nombre);
      drive('BASE › Eventos', conv.evs.length + ' jugadas copiadas');
      drive('BASE › EstPartido', conv.pj.length + ' filas de jugadores');
      TL().limpiar(p.id);
      TL().toast('✅ Partido guardado: ya está en el fixture y en la tabla.');
    } else if (p.estado === 'en_vivo') TL().vivo(p.id, conv.evs, conv.pj);
    TL().recargar();
  });

  /* ================= COORDINADOR ================= */
  function chipsCat() {
    if (cats().length < 2) return '';
    return '<div class="chips">' + cats().map(function (c) { return '<button class="chip' + (c.id === gcat() ? ' on' : '') + '" data-a="gcat" data-v="' + c.id + '" type="button">' + esc(c.nombre) + '</button>'; }).join('') + '</div>';
  }
  function vGestion() {
    if (!ST.rec && !ST.recCargando) { ST.recCargando = true; cargarRecibidos().then(function () { ST.recCargando = false; TL().pintar(true); }); }
    var nRec = (ST.rec || []).reduce(function (a, g) { return a + g.jugadores.length; }, 0), nClubRec = (ST.rec || []).length;
    var recCard = '<a class="card gcard" href="#/g-recibidos"><span><b>📥 Recibidos de los clubes</b>' + (nRec ? ' <span class="badge vivo" style="margin-left:6px">' + nRec + '</span>' : '') + '<br><span class="muted sm">Lo que mandan los clubes por el formulario espera tu confirmación para entrar a la liga.</span><br><span class="sm muted">' + (ST.rec ? (nRec ? nClubRec + (nClubRec === 1 ? ' club' : ' clubes') + ' · ' + nRec + ' jugadores esperando' : 'Nada pendiente') : 'Revisando…') + '</span></span><span>›</span></a>';
    var cat = gcat(), np = partidos(cat).length, ne = equipos(cat).length, nj = equipos(cat).reduce(function (a, e) { return a + jugadores(e.id).length; }, 0);
    var prox = partidos(cat).filter(function (p) { return p.estado === 'programado'; })[0];
    return '<h1>Gestión de la liga</h1>' + nube() + chipsCat() +
      '<a class="card gcard" href="#/g-fixture"><span><b>📅 Fixture</b><br><span class="muted sm">Armar y cambiar los partidos. La web y los planilleros lo siguen.</span><br><span class="sm muted">' + np + ' partidos' + (prox ? ' · próximo: ' + esc(new Date(prox.fecha_hora).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })) : '') + '</span></span><span>›</span></a>' +
      recCard + '<a class="card gcard" href="#/g-clubes"><span><b>🛡️ Clubes y jugadores</b><br><span class="muted sm">Cada club con sus categorías y sus jugadores habilitados en cada una.</span><br><span class="sm muted">' + ne + ' equipos · ' + nj + ' jugadores</span></span><span>›</span></a>' +
      '<div class="ayuda">✏️ <b>¿Hay que corregir un partido?</b> Entrá a <b>Fixture</b> como siempre: en los partidos cerrados te aparece el botón <i>Corregir partido</i>.</div><p class="centro"><a class="mini" href="#/g-cuentas">👥 Cuentas de la liga</a> <a class="mini" href="#/g-liga">⚙️ Mi liga</a></p>';
  }

  /* ---- fixture ---- */
  function vGFixture() {
    var cat = gcat(), lista = partidos(cat);
    var h = '<div class="fila"><h1 style="margin:0">Fixture</h1><a class="btn" href="#/g-armar" style="min-height:40px">⚡ Armar solo</a></div>' + nube() + chipsCat();
    if (!lista.length) return h + '<p class="vacio">Todavía no hay partidos. Creá el primero con “+ Nuevo partido” o con “Armar solo”.</p><a class="fab" href="#/g-partido/nuevo?cat=' + cat + '">+ Nuevo partido</a>';
    h += TL().calendario(lista, {
      card: function (p) {
        var pill = p.estado === 'cerrado' ? '<span class="pill ok">Final</span>' : p.estado === 'en_vivo' ? '<span class="badge vivo">EN VIVO</span>' : '<span class="pill">Programado</span>';
        var acc = p.estado === 'programado' ? '<a class="btn" href="#/g-partido/' + p.id + '">✏️ Editar</a>' : p.estado === 'cerrado' ? '<a class="btn" href="#/corregir/' + p.id + '">✏️ Corregir</a>' : '';
        if (p.claim && p.estado !== 'cerrado') acc += '<button class="btn mal" data-a="liberarPartido" data-id="' + p.id + '" type="button">🔓 Liberar a ' + esc(p.claim) + '</button>';
        return cardPj(p, pill, acc);
      },
      extra: function (dia) { return '<a class="btn full" style="margin-top:4px" href="#/g-partido/nuevo?cat=' + cat + '&fecha=' + dia + '">+ Nuevo partido este día</a>'; }
    });
    return h + '<a class="fab" href="#/g-partido/nuevo?cat=' + cat + '&fecha=' + TL().CAL.sel + '">+ Nuevo partido</a>';
  }
  function sel(id, opts, val) { return '<select id="' + id + '">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
  function vGPartido(id, q) {
    var nuevo = id === 'nuevo', p = nuevo ? null : partido(id), cat = nuevo ? (q.cat || gcat()) : p.categoria_id;
    if (!nuevo && !p) return '<p class="vacio">No encuentro ese partido.</p>';
    if (!nuevo && p.estado !== 'programado') return '<h1>Partido ' + (p.estado === 'cerrado' ? 'cerrado' : 'en juego') + '</h1><p class="muted">Un partido que ya se jugó no se edita acá.' + (p.estado === 'cerrado' ? ' Para cambiar el resultado usá “Corregir partido”.' : '') + '</p>' + (p.estado === 'cerrado' ? '<a class="btn p full" href="#/corregir/' + p.id + '">✏️ Corregir partido</a>' : '');
    var d = nuevo ? (q.fecha ? new Date(q.fecha + 'T12:00:00') : new Date(Date.now() + 86400000)) : new Date(p.fecha_hora);
    var maxN = Math.max.apply(null, [0].concat(partidos(cat).map(function (x) { return x.nro_fecha || 0; })));
    var eqs = equipos(cat).map(function (e) { return [e.id, e.nombre]; });
    var v = nuevo ? { fase: 'Fase regular', grupo: '', cancha: 'Cancha 1', nro_fecha: maxN + 1, local_id: eqs[0] && eqs[0][0], visitante_id: eqs[1] && eqs[1][0] } : p;
    return '<h1>' + (nuevo ? 'Nuevo partido' : 'Editar partido') + '</h1><p class="muted sm" style="margin-top:-6px">Categoría ' + esc(catNombre(cat)) + '</p>' +
      '<div class="grid2"><label class="campo"><span>Fase</span>' + sel('fFase', FASES.map(function (f) { return [f, f]; }), v.fase) + '</label><label class="campo"><span>Grupo</span>' + sel('fGrupo', [['', 'Sin grupo'], ['A', 'Grupo A'], ['B', 'Grupo B'], ['C', 'Grupo C'], ['D', 'Grupo D']], v.grupo || '') + '</label></div>' +
      '<div class="grid2"><label class="campo"><span>Fecha</span><input id="fFecha" type="date" value="' + ymd(d) + '"></label><label class="campo"><span>Hora</span><input id="fHora" type="time" value="' + (nuevo ? '20:00' : hm(d)) + '"></label></div>' +
      '<div class="grid2"><label class="campo"><span>Cancha</span><input id="fCancha" value="' + esc(v.cancha || '') + '"></label><label class="campo"><span>Nº de fecha</span><input id="fNro" type="number" min="1" value="' + (v.nro_fecha || 1) + '"></label></div>' +
      '<div class="grid2"><label class="campo"><span>Local</span>' + sel('fLocal', eqs, v.local_id) + '</label><label class="campo"><span>Visitante</span>' + sel('fVisit', eqs, v.visitante_id) + '</label></div><div class="err" id="fErr"></div>' +
      '<button class="btn p full" data-a="gpartido" data-id="' + (nuevo ? 'nuevo' : p.id) + '" data-cat="' + cat + '" type="button">Guardar en el fixture</button>' +
      (!nuevo && !p.claim ? '<div style="height:10px"></div><button class="btn mal full" data-a="bpartido" data-id="' + p.id + '" type="button">Borrar partido</button>' : '') +
      '<p class="centro sm muted" style="margin-top:10px">Se ve al instante en la web y en la lista de los planilleros.</p>';
  }
  function vGArmar() {
    var cat = gcat(), d = new Date(); d.setDate(d.getDate() + ((3 - d.getDay() + 7) % 7 || 7));
    return '<h1>Armar solo</h1>' + chipsCat() + '<p class="muted sm">Propone todos contra todos de la categoría <b>' + esc(catNombre(cat)) + '</b> con los equipos cargados. Después ajustás lo que quieras partido por partido.</p>' +
      '<label class="campo"><span>Fase</span>' + sel('aFase', FASES.map(function (f) { return [f, f]; }), 'Fase regular') + '</label>' +
      '<div class="grid2"><label class="campo"><span>Primera fecha</span><input id="aFecha" type="date" value="' + ymd(d) + '"></label><label class="campo"><span>Hora del primero</span><input id="aHora" type="time" value="20:00"></label></div>' +
      '<div class="grid2"><label class="campo"><span>Días entre fechas</span><input id="aDias" type="number" min="1" value="7"></label><label class="campo"><span>Partidos por fecha</span><input id="aPpf" type="number" min="1" value="2"></label></div>' +
      '<div class="grid2"><label class="campo"><span>Canchas</span><input id="aCanchas" type="number" min="1" max="4" value="1"></label><label class="campo"><span>Minutos entre partidos</span><input id="aMin" type="number" min="30" value="90"></label></div><div class="err" id="aErr"></div>' +
      '<button class="btn p full" data-a="armar" type="button">⚡ Armar el fixture</button>';
  }

  /* ---- Mi liga ---- */
  function vGLiga() {
    var l = S().liga, f = ST.form;
    if (f.eq !== 'liga') ST.form = f = { eq: 'liga', llogo: l.logo_url || null };
    return '<h1>Mi liga</h1>' + nube() +
      '<label class="campo"><span>Nombre de la liga</span><input id="lNombre" value="' + esc(f.lnombre != null ? f.lnombre : l.nombre) + '" autocapitalize="words"></label>' +
      '<span class="muted sm">Logo de la liga (aparece al inicio de la web y en los flyers)</span>' +
      '<div class="logo-edit">' + (f.llogo ? '<img class="esc" style="--c:#ff8a4c" src="' + esc(f.llogo) + '" alt="Logo">' : '<span class="vacio-logo">🏆</span>') +
      '<div class="acc"><label class="btn full" style="cursor:pointer">' + (f.llogo ? 'Cambiar logo' : 'Subir logo') + '<input id="lLogo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label>' +
      (f.llogo ? '<button class="btn mal full" data-a="llogoQuitar" type="button">Quitar logo</button>' : '') + '</div></div>' +
      '<div class="err" id="lErr"></div><button class="btn p full" data-a="gliga" type="button">Guardar</button>' +
      '<h2>Categorías</h2>' + cats().map(function (c) { return '<div class="card fila"><span><b>' + esc(c.nombre) + '</b> <span class="muted sm">· ' + esc(c.temporada) + '</span></span><button class="mini" data-a="renCat" data-id="' + c.id + '" type="button">✏️ Renombrar</button></div>'; }).join('') +
      '<div class="grid2"><label class="campo"><span>Nueva categoría</span><input id="cNom" placeholder="Ej.: +30" autocapitalize="characters"></label><label class="campo"><span>Temporada</span><input id="cTemp" value="2026" inputmode="numeric"></label></div><button class="btn full" data-a="addCat" type="button">+ Agregar categoría</button>';
  }

  /* ---- clubes: un club agrupa sus equipos de cada categoría; el jugador figura una vez y queda habilitado en una o varias categorías ---- */
  function kClub(n) { return String(n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function clubes() {
    var cs = cats().map(function (c) { return c.id; }), m = {}, out = [];
    D.vista_equipos.filter(function (e) { return cs.indexOf(e.categoria_id) >= 0; }).forEach(function (e) {
      var k = kClub(e.nombre);
      if (!m[k]) { m[k] = { key: k, nombre: e.nombre, equipos: [], color: e.color_principal, alt: e.color_alternativo, logo: e.logo_url }; out.push(m[k]); }
      m[k].equipos.push(e); if (!m[k].logo && e.logo_url) m[k].logo = e.logo_url;
    });
    return out.sort(function (a, b) { return a.nombre < b.nombre ? -1 : 1; });
  }
  function clubDe(eqId) { return clubes().filter(function (k) { return k.equipos.some(function (e) { return e.id === eqId; }); })[0]; }
  function catsSel(eq) {                              // categorías marcadas en la ficha del jugador (si el club tiene una sola, es esa)
    var box = document.getElementById('jCats'); if (!box) return [eq];
    return Array.prototype.slice.call(box.querySelectorAll('.chip.on')).map(function (x) { return x.dataset.eq; });
  }
  function club(key) { return clubes().filter(function (c) { return c.key === key; })[0]; }
  function jugadoresClub(c) {                        // cada persona una sola vez, con las categorías en las que está habilitada
    var ids = {}, m = {}, out = [];
    c.equipos.forEach(function (e) { ids[e.id] = true; });
    D.vista_jugadores.filter(function (j) { return ids[j.equipo_id]; }).forEach(function (j) {
      if (!m[j.id]) { m[j.id] = { j: j, en: {} }; out.push(m[j.id]); }
      m[j.id].en[j.equipo_id] = j;
    });
    return out.sort(function (a, b) { return (a.j.apellido + a.j.nombre) < (b.j.apellido + b.j.nombre) ? -1 : 1; });
  }
  function nomCat(id) { var c = cats().filter(function (x) { return x.id === id; })[0]; return c ? c.nombre : ''; }
  /* ---- recibidos de los clubes (formulario) ---- */
  function urlFormulario() { var u = new URL('formulario.html', location.href); u.search = ''; u.hash = ''; return u.href; }
  function idsDe(g) { var o = []; g.jugadores.forEach(function (x) { o = o.concat(x.ids); }); return o; }
  function fechaCorta(iso) { return String(iso || '').slice(0, 10).split('-').reverse().join('/'); }
  function muestraRecibidos() {                       // en la demo se muestra un envío de ejemplo para ver cómo funciona
    var cn = cats().map(function (c) { return c.nombre; }), c1 = cn[0], c2 = cn[1] || cn[0];
    return [{ club: 'Club Ejemplo', club_nuevo: true, enviado: new Date().toISOString(), jugadores: [
      { ids: ['d1'], documento: '31000111', apellido: 'Pérez', nombre: 'Martín', nacimiento: '1991-03-12', camiseta: 7, altura: 181, categorias: c1 === c2 ? [c1] : [c1, c2], ya_existe: false },
      { ids: ['d2'], documento: '32000222', apellido: 'Suárez', nombre: 'Lucas', nacimiento: '1989-11-02', camiseta: null, categorias: [c1], ya_existe: false }] }];
  }
  function cargarRecibidos() {
    if (!REAL) { if (!ST.rec) ST.rec = muestraRecibidos(); return Promise.resolve(); }
    return SB().rpc('recibidos_listar', { p_liga: ligaId() }).then(function (r) { if (r.error) throw r.error; ST.rec = r.data || []; ST.recErr = null; }).catch(function (e) { ST.rec = []; ST.recErr = msgError(e); });
  }
  function vGRecibidos() {
    if (!ST.rec) { cargarRecibidos().then(function () { TL().pintar(true); }); return '<h1>Recibidos</h1><div class="sk"><i></i><i></i></div>'; }
    var h = '<a class="sm" href="#/gestion" style="color:var(--acc2)">‹ Gestión</a><h1 style="margin-top:6px">Recibidos de los clubes</h1>' + nube() +
      '<div class="ayuda">📝 <b>Enlace del formulario</b> (mandalo por WhatsApp a todos los clubes):<br><span class="sm" style="word-break:break-all">' + esc(urlFormulario()) + '</span><br><button class="mini" data-a="copiarForm" type="button" style="margin-top:8px">📋 Copiar enlace</button></div>';
    if (ST.recErr) h += '<div class="err">' + esc(ST.recErr) + '</div>';
    if (!ST.rec.length) return h + '<p class="vacio">No hay nada esperando. Cuando un club envíe su plantel, aparece acá para que lo confirmes.</p>';
    h += '<p class="sm muted">Revisá cada club. <b>Aprobar</b> lo suma a la liga (y a la hoja de Drive). <b>Rechazar</b> lo descarta. Con “Quitar” sacás a un jugador puntual.</p>';
    return h + ST.rec.map(function (g, i) {
      var filas = g.jugadores.map(function (x, k) {
        var aviso = x.ya_existe ? '<div class="sm" style="color:var(--acc2);margin-top:4px">⚠️ Ese DNI ya está en la liga' + (x.ya_nombre ? ' (' + esc(x.ya_nombre) + ')' : '') + ': se le suman estas categorías, no se duplica.</div>' : '';
        return '<div class="card" style="margin:8px 0"><div class="fila"><span><b>' + esc(x.apellido + ' ' + x.nombre) + '</b><br><span class="muted sm">DNI ' + esc(x.documento) + ' · ' + esc(fechaCorta(x.nacimiento)) + (x.camiseta != null ? ' · #' + x.camiseta : '') + (x.altura ? ' · ' + x.altura + ' cm' : '') + '</span></span>' +
          '<button class="mini mal" data-a="recQuitar" data-i="' + i + '" data-j="' + k + '" type="button">Quitar</button></div>' +
          '<div class="chips" style="padding:8px 0 0;margin:0">' + x.categorias.map(function (c) { return '<span class="chip on" style="height:30px;font-size:12.5px;pointer-events:none">' + esc(c) + '</span>'; }).join('') + '</div>' + aviso + '</div>';
      }).join('');
      return '<div class="pw" style="margin-top:14px"><div class="fila"><h2 style="margin:0">' + esc(g.club) + '</h2><span class="pill' + (g.club_nuevo ? '' : ' ok') + '">' + (g.club_nuevo ? '🆕 Club nuevo' : 'Club de la liga') + '</span></div>' +
        '<div class="sm muted">Enviado el ' + esc(fechaCorta(g.enviado)) + ' · ' + g.jugadores.length + ' jugadores · espera tu confirmación</div>' + filas +
        '<div class="grid2" style="margin-top:10px"><button class="btn p" data-a="recAprobar" data-i="' + i + '" type="button">✅ Aprobar club</button><button class="btn mal" data-a="recRechazar" data-i="' + i + '" type="button">Rechazar</button></div></div>';
    }).join('');
  }

  function vGClubes() {
    var q = kClub(ST.cq || ''), lista = clubes().filter(function (c) { return !q || c.key.indexOf(q) >= 0; });
    var h = '<h1>Clubes y jugadores</h1>' + nube() +
      '<input id="cBuscar" type="search" class="buscar-club" placeholder="Buscar club…" value="' + esc(ST.cq || '') + '" autocomplete="off" style="width:100%;margin-bottom:10px">' +
      '<div class="sm muted" style="margin:0 0 8px">' + lista.length + ' clubes · <a href="#/g-equipos" style="color:var(--acc2)">ver por categoría</a></div>';
    if (!lista.length) h += '<p class="vacio">No hay clubes que coincidan.</p>';
    return h + lista.map(function (c) {
      var n = {}; jugadoresClub(c).forEach(function (x) { n[x.j.id] = 1; });
      var cl = c.equipos.map(function (e) { return '<span class="pill">' + esc(nomCat(e.categoria_id)) + ' · ' + jugadores(e.id).length + '</span>'; }).join(' ');
      return '<a class="card" href="#/g-club/' + encodeURIComponent(c.key) + '" style="display:block"><div class="fila"><span class="fila" style="justify-content:flex-start;gap:10px">' +
        (c.logo ? '<img class="esc lg" style="--c:' + esc(c.color) + '" src="' + esc(c.logo) + '" alt="">' : '<span class="color" style="background:' + esc(c.color) + '"></span>') +
        '<b>' + esc(c.nombre) + '</b></span><span class="muted sm">' + Object.keys(n).length + ' jug. ›</span></div><div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' + cl + '</div></a>';
    }).join('') + '<a class="fab" href="#/g-equipo/nuevo?cat=' + gcat() + '">+ Club</a>';
  }
  function vGClub(key) {
    var c = club(decodeURIComponent(key || '')); if (!c) return '<p class="vacio">No encuentro ese club.</p><a class="btn full" href="#/g-clubes">← Volver a clubes</a>';
    var fk = 'club:' + c.key;
    if (ST.form.eq !== fk) ST.form = { eq: fk, p: c.color, a: c.alt || '#ffffff', logo: c.logo || null };
    var js = jugadoresClub(c), q = kClub(ST.jq || ''), lista = js.filter(function (x) { return !q || kClub(x.j.apellido + ' ' + x.j.nombre).indexOf(q) >= 0; });
    var libres = cats().filter(function (ct) { return !c.equipos.some(function (e) { return e.categoria_id === ct.id; }); });
    var h = '<a class="sm" href="#/g-clubes" style="color:var(--acc2)">‹ Clubes</a><h1 style="margin-top:6px">' + esc(c.nombre) + '</h1>' + nube() +
      '<span class="muted sm">Logo del club (se ve en todas sus categorías)</span>' + logoEdit(ST.form.logo, ST.form.p) +
      '<span class="muted sm">Color principal</span>' + paleta('p', ST.form.p) + '<span class="muted sm">Color alternativo</span>' + paleta('a', ST.form.a) +
      '<button class="btn p full" data-a="gclub" data-key="' + esc(c.key) + '" type="button">Guardar club</button>' +
      '<h2>Categorías del club</h2>' + c.equipos.map(function (e) { return '<a class="card fila" href="#/g-equipo/' + e.id + '"><b>' + esc(nomCat(e.categoria_id)) + '</b><span class="muted sm">' + jugadores(e.id).length + ' jug. ›</span></a>'; }).join('');
    if (libres.length) h += '<div class="grid2" style="align-items:end"><label class="campo" style="margin:0"><span>Sumar categoría</span><select id="ccNueva">' + libres.map(function (ct) { return '<option value="' + ct.id + '">' + esc(ct.nombre) + '</option>'; }).join('') + '</select></label><button class="btn" data-a="addCatClub" data-key="' + esc(c.key) + '" type="button">+ Sumar</button></div>';
    h += '<h2>Jugadores del club · ' + js.length + '</h2><p class="sm muted" style="margin-top:-4px">Cada jugador figura una sola vez. Tocá una categoría para habilitarlo o quitarlo.</p>' +
      '<input id="jBuscar" type="search" placeholder="Buscar jugador…" value="' + esc(ST.jq || '') + '" autocomplete="off" style="width:100%;margin-bottom:8px">';
    h += lista.map(function (x) {
      var chips = c.equipos.map(function (e) { var on = !!x.en[e.id]; return '<button type="button" class="chip' + (on ? ' on' : '') + '" data-a="toggleCat" data-jug="' + x.j.id + '" data-eq="' + e.id + '" style="height:34px;font-size:12.5px">' + esc(nomCat(e.categoria_id)) + '</button>'; }).join('');
      var pr = PRIV[x.j.id] || {};
      return '<div class="card"><div class="fila"><a href="#/g-jugador/' + x.j.id + '"><b>' + esc(nombreDe(x.j)) + '</b></a><span class="muted sm">' + esc(pr.doc || '') + '</span></div><div class="chips" style="padding:8px 0 0;margin:0">' + chips + '</div></div>';
    }).join('') || '<p class="vacio">No hay jugadores que coincidan.</p>';
    return h + '<a class="fab" href="#/g-jugador/nuevo?eq=' + c.equipos[0].id + '">+ Jugador</a>';
  }

  /* ---- equipos y jugadores ---- */
  function vGEquipos() {
    var cat = gcat(), eq = equipos(cat);
    var h = '<h1>Equipos y jugadores</h1>' + nube() + chipsCat();
    if (!eq.length) h += '<p class="vacio">Todavía no hay equipos. Creá el primero con “+ Equipo”.</p>';
    h += eq.map(function (e) { return '<a class="card fila" href="#/g-equipo/' + e.id + '"><span class="fila" style="justify-content:flex-start;gap:10px">' + (e.logo_url ? '<img class="esc lg" style="--c:' + esc(e.color_principal) + '" src="' + esc(e.logo_url) + '" alt="">' : '<span class="color" style="background:' + esc(e.color_principal) + '"></span>') + '<b>' + esc(e.nombre) + '</b></span><span class="muted sm">' + jugadores(e.id).length + ' jug. ›</span></a>'; }).join('');
    return h + '<a class="fab" href="#/g-equipo/nuevo?cat=' + cat + '">+ Equipo</a>';
  }
  function paleta(k, val) { return '<div class="paleta">' + PALETA.map(function (c) { return '<button type="button" data-a="color" data-k="' + k + '" data-v="' + c + '" class="' + (c.toLowerCase() === String(val).toLowerCase() ? 'on' : '') + '" style="background:' + c + '" aria-label="Color ' + c + '"></button>'; }).join('') + '</div>'; }
  function logoEdit(logo, color) {
    return '<div class="logo-edit">' + (logo ? '<img class="esc" style="--c:' + esc(color || '#888') + '" src="' + esc(logo) + '" alt="Logo">' : '<span class="vacio-logo">🛡️</span>') +
      '<div class="acc"><label class="btn full" style="cursor:pointer">' + (logo ? 'Cambiar logo' : 'Subir logo') + '<input id="fLogo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"></label>' +
      (logo ? '<button class="btn mal full" data-a="logoQuitar" type="button">Quitar logo</button>' : '<span class="sm muted">PNG, JPG o SVG. Mejor si es cuadrado y con fondo transparente.</span>') + '</div></div>';
  }
  function reducirImagen(file, max, cb) {            // achica a max px (mantiene proporción y transparencia) y devuelve PNG en base64
    if (!/^image\//.test(file.type)) { cb(null, 'Elegí una imagen (PNG, JPG o SVG).'); return; }
    if (file.size > 6 * 1024 * 1024) { cb(null, 'La imagen pesa más de 6 MB. Elegí una más liviana.'); return; }
    var fr = new FileReader();
    fr.onload = function () {
      var im = new Image();
      im.onload = function () {
        var w = im.naturalWidth || im.width || max, h = im.naturalHeight || im.height || max, k = Math.min(1, max / Math.max(w, h)), cw = Math.max(1, Math.round(w * k)), ch = Math.max(1, Math.round(h * k));
        var c = document.createElement('canvas'); c.width = cw; c.height = ch; c.getContext('2d').drawImage(im, 0, 0, cw, ch);
        cb(c.toDataURL('image/png'));
      };
      im.onerror = function () { cb(null, 'No pude leer esa imagen.'); };
      im.src = fr.result;
    };
    fr.onerror = function () { cb(null, 'No pude leer ese archivo.'); };
    fr.readAsDataURL(file);
  }
  function vGEquipo(id, q) {
    var nuevo = id === 'nuevo', e = nuevo ? null : equipo(id), cat = nuevo ? (q.cat || gcat()) : (e ? e.categoria_id : gcat());
    if (!nuevo && !e) return '<p class="vacio">No encuentro ese equipo.</p>';
    var key = nuevo ? 'nuevo' : id;
    if (ST.form.eq !== key) ST.form = { eq: key, p: nuevo ? PALETA[0] : e.color_principal, a: nuevo ? '#ffffff' : (e.color_alternativo || '#ffffff'), logo: nuevo ? null : (e.logo_url || null) };
    var js = nuevo ? [] : jugadores(id);
    var h = '<h1>' + (nuevo ? 'Nuevo equipo' : dot(e.color_principal) + esc(e.nombre)) + '</h1>' + nube() +
      '<label class="campo"><span>Nombre del equipo</span><input id="eNombre" value="' + esc(ST.form.nombre != null ? ST.form.nombre : (nuevo ? '' : e.nombre)) + '" placeholder="Ej.: Marlin"></label>' +
      '<span class="muted sm">Logo del equipo (se ve en la web y en los flyers)</span>' + logoEdit(ST.form.logo, ST.form.p) +
      '<span class="muted sm">Color principal (se ve en toda la app)</span>' + paleta('p', ST.form.p) + '<span class="muted sm">Color alternativo</span>' + paleta('a', ST.form.a) +
      '<div class="err" id="eErr"></div><button class="btn p full" data-a="gequipo" data-id="' + key + '" data-cat="' + cat + '" type="button">Guardar equipo</button>';
    if (!nuevo && REAL) h += '<button class="btn full" style="margin-top:10px" data-a="fusionar" data-id="' + id + '" type="button">🔀 Fusionar con otro equipo</button>';
    if (nuevo) return h + '<div class="ayuda">Guardá el equipo y después agregás sus jugadores.</div>';
    h += '<h2>Plantel · ' + js.length + '</h2>' + js.map(function (j) { return '<a class="asist" href="#/g-jugador/' + j.id + '"><span class="num">' + (j.camiseta_habitual == null ? '–' : '#' + j.camiseta_habitual) + '</span><span>' + esc(nombreDe(j)) + '</span><span class="muted sm" style="margin-left:auto">' + (j.altura_cm || '–') + ' cm ›</span></a>'; }).join('');
    h += '<div class="fila-btns"><a class="btn p" href="#/g-jugador/nuevo?eq=' + id + '">+ Agregar jugador</a><button class="btn" data-a="pegarT" type="button">📋 Pegar lista</button></div>';
    if (ST.pegar) h += '<div class="card"><label class="campo" style="margin:0"><span>Una línea por jugador: camiseta, nombre y altura (opcionales). Ej.: <i>9 Joaquín Castro 185</i></span><textarea id="pegado" placeholder="9 Joaquín Castro 185&#10;7 Lucas Benítez 181&#10;11 Tomás Domínguez"></textarea></label><button class="btn p full" data-a="pegarOk" data-id="' + id + '" type="button" style="margin-top:10px">Agregar estos jugadores</button></div>';
    return h + '<div class="ayuda">📋 <b>Pegar lista</b>: copiás los nombres desde WhatsApp o una planilla y la app arma los jugadores. Después completás lo que falte.</div>';
  }
  function vGJugador(id, q) {
    var nuevo = id === 'nuevo', j = nuevo ? { equipo_id: q.eq } : D.vista_jugadores.filter(function (x) { return x.id === id; })[0];
    if (!j) return '<p class="vacio">No encuentro ese jugador.</p>';
    var e = equipo(j.equipo_id), pr = PRIV[j.id] || {}, cl = clubDe(j.equipo_id), selc = '';
    if (cl && cl.equipos.length > 1) {                // el jugador es del club: se marca en qué categorías juega (una o varias)
      var enJ = {}; if (!nuevo) D.vista_jugadores.forEach(function (x) { if (x.id === j.id) enJ[x.equipo_id] = true; }); else enJ[j.equipo_id] = true;
      selc = '<div id="jCats"><span class="muted sm">Categorías en las que juega (una o varias)</span><div class="chips" style="padding:6px 0 12px;margin:0">' +
        cl.equipos.map(function (q) { return '<button type="button" class="chip' + (enJ[q.id] ? ' on' : '') + '" data-a="jcat" data-eq="' + q.id + '" style="height:38px">' + esc(nomCat(q.categoria_id)) + '</button>'; }).join('') + '</div></div>';
    }
    return '<h1>' + (nuevo ? 'Nuevo jugador' : esc(nombreDe(j))) + '</h1><p class="muted sm" style="margin-top:-6px">' + (e ? dot(e.color_principal) + esc(e.nombre) : '') + '</p>' +
      '<div class="grid2"><label class="campo"><span>Nombre</span><input id="jNom" value="' + esc(j.nombre || '') + '"></label><label class="campo"><span>Apellido</span><input id="jApe" value="' + esc(j.apellido || '') + '"></label></div>' +
      '<div class="grid2"><label class="campo"><span>Camiseta habitual</span><input id="jCam" type="number" min="0" max="99" value="' + (j.camiseta_habitual == null ? '' : j.camiseta_habitual) + '"></label><label class="campo"><span>Altura (cm)</span><input id="jAlt" type="number" min="120" max="250" value="' + (j.altura_cm || '') + '"></label></div>' +
      '<label class="campo"><span>Posición</span>' + sel('jPos', Object.keys(POS).map(function (k) { return [k, POS[k]]; }), posDe(j)) + '</label>' +
      selc + '<div class="privado"><b>🔒 Solo coordinadores</b><label class="campo" style="margin-top:8px"><span>Documento</span><input id="jDoc" value="' + esc(pr.doc || '') + '" autocomplete="off"></label><label class="campo"><span>Fecha de nacimiento</span><input id="jNac" type="date" value="' + esc(pr.nac || '') + '"></label><label class="campo" style="margin:0"><span>Habilitado para jugar</span>' + sel('jHab', [['si', 'Sí'], ['no', 'No']], pr.hab || 'si') + '</label></div>' +
      '<div class="ayuda">Lo público es solo nombre, camiseta del partido, altura y estadísticas. Documento y fecha de nacimiento nunca salen de esta pantalla.</div><div class="err" id="jErr"></div>' +
      '<button class="btn p full" data-a="gjug" data-id="' + (nuevo ? 'nuevo' : j.id) + '" data-eq="' + (j.equipo_id || '') + '" type="button">Guardar</button>' +
      (nuevo ? '' : '<div style="height:10px"></div><button class="btn mal full" data-a="bjug" data-id="' + j.id + '" type="button">Quitar del equipo</button>');
  }
  function vGDrive() {
    var s = S().liga ? S().liga.slug : '';
    var h = '<h1>Drive de la liga</h1><div class="ayuda">En la versión real, cada cambio que hacés acá se copia solo a <b>SUPER OFICIAL / ' + esc(s) + ' / categoría / BASE</b> (hojas Equipos, Jugadores, Partidos, Eventos, Correcciones y EstPartido). Esto es una simulación de lo que se escribiría.</div>';
    if (!DRIVE.length) return h + '<p class="vacio">Todavía no hiciste cambios en esta sesión.</p>';
    return h + '<h2>Lo que se escribió</h2>' + DRIVE.map(function (d) { return '<div class="evrow"><span><time>' + hm(d.t) + '</time>' + esc(d.hoja) + ' · ' + esc(d.accion) + '<br><span class="muted sm">' + esc(d.ruta) + '</span></span></div>'; }).join('');
  }

  /* ---- corregir un partido cerrado ---- */
  var TXT = { P1: 'Libre', P2: 'Doble', P3: 'Triple', E1: 'Libre errado', E2: 'Doble errado', E3: 'Triple errado', REB: 'Rebote', AST: 'Asistencia', ROB: 'Robo', PER: 'Pérdida', FALTA: 'Falta', TM: 'Tiempo muerto' };
  function evsVig(id) {
    var evs = D.eventos.filter(function (e) { return e.partido_id === id; }), an = {};
    evs.forEach(function (e) { if (e.tipo === 'ANULA' && e.anula) an[e.anula] = true; });
    return evs.filter(function (e) { return e.tipo !== 'ANULA'; }).map(function (e) { return { e: e, anul: !!an[e.id] }; });
  }
  function marcadorDeEventos(id) {
    var m = { local: 0, visitante: 0 }, v = { P1: 1, P2: 2, P3: 3 };
    evsVig(id).forEach(function (x) { if (!x.anul && v[x.e.tipo] && m[x.e.equipo] != null) m[x.e.equipo] += v[x.e.tipo]; });
    return m;
  }
  function nomJug(pid, jid) { var r = D.vista_partido_jugadores.filter(function (x) { return x.partido_id === pid && x.jugador_id === jid; })[0]; return r ? '#' + r.camiseta + ' ' + r.nombre_completo : ''; }
  function mmss(s) { s = s || 0; return pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
  function vCorregir(id) {
    if (REAL && !EVL[id]) { cargarEventosReal(id).then(function () { TL().pintar(true); }, function (e) { TL().toast(msgError(e)); }); return '<h1>Corregir partido</h1><div class="sk"><i></i><i></i></div>'; }
    var p = partido(id); if (!p || p.estado !== 'cerrado') return '<p class="vacio">Solo se corrigen partidos cerrados.</p>';
    var f = ST.evf, lista = evsVig(id).filter(function (x) { return f === 'todo' || /^P[123]$|^FALTA$/.test(x.e.tipo); }).sort(function (a, b) { return b.e.seq - a.e.seq; }).slice(0, 40);
    var chip = function (k, t) { return '<button class="chip' + (f === k ? ' on' : '') + '" data-a="evf" data-v="' + k + '" type="button">' + t + '</button>'; };
    var js = D.vista_partido_jugadores.filter(function (x) { return x.partido_id === id; }).sort(function (a, b) { return a.equipo_id === b.equipo_id ? a.camiseta - b.camiseta : (a.equipo_id === p.local_id ? -1 : 1); });
    var h = '<h1>Corregir partido</h1><div class="card"><div class="score grande"><div class="eq">' + dot(p.local_color) + esc(p.local_nombre) + '</div><div class="pts">' + p.marcador_local + ' - ' + p.marcador_visitante + '</div><div class="eq">' + esc(p.visitante_nombre) + dot(p.visitante_color) + '</div></div></div>' +
      '<div class="chips">' + chip('puntos', 'Puntos y faltas') + chip('todo', 'Todas las jugadas') + '</div>';
    h += lista.length ? lista.map(function (x) {
      var e = x.e, eq = e.equipo === 'local' ? p.local_nombre : e.equipo === 'visitante' ? p.visitante_nombre : '';
      return '<div class="evrow' + (x.anul ? ' anul' : '') + '"><span><time>' + (e.cuarto > 4 ? 'TS' + (e.cuarto - 4) : 'C' + (e.cuarto || 1)) + ' ' + mmss(e.reloj_seg) + '</time>' + esc(nomJug(id, e.jugador_id)) + ' · ' + esc(TXT[e.tipo] || e.tipo) + (eq ? ' <span class="muted sm">(' + esc(eq) + ')</span>' : '') + '</span>' +
        (x.anul ? '<span class="pill">Anulada</span>' : '<button class="mini mal" data-a="anular" data-id="' + p.id + '" data-ev="' + e.id + '" type="button">Anular</button>') + '</div>';
    }).join('') : '<p class="vacio">No hay jugadas para mostrar.</p>';
    h += '<h2>Agregar una jugada olvidada</h2><div class="grid2"><label class="campo"><span>Jugador</span><select id="cJug">' + js.map(function (x) { return '<option value="' + x.jugador_id + '">#' + x.camiseta + ' ' + esc(x.nombre_completo) + ' (' + esc(x.equipo_id === p.local_id ? p.local_nombre : p.visitante_nombre) + ')</option>'; }).join('') + '</select></label>' +
      '<label class="campo"><span>Jugada</span>' + sel('cTipo', [['P1', 'Libre +1'], ['P2', 'Doble +2'], ['P3', 'Triple +3'], ['FALTA', 'Falta'], ['REB', 'Rebote'], ['AST', 'Asistencia'], ['ROB', 'Robo'], ['PER', 'Pérdida']], 'P2') + '</label></div>' +
      '<label class="campo"><span>Cuarto</span>' + sel('cCuarto', [[1, '1.º'], [2, '2.º'], [3, '3.º'], [4, '4.º']], 4) + '</label><button class="btn full" data-a="agregarJ" data-id="' + p.id + '" type="button">+ Agregar jugada</button>' +
      '<div class="ayuda">Las jugadas no se borran: se <b>anulan</b> y queda registro de quién corrigió y cuándo. El marcador, la tabla y las estadísticas se recalculan solos.</div>';
    return h;
  }
  function aplicarMarcador(p, antes) {
    var m = marcadorDeEventos(p.id); p.marcador_local = m.local; p.marcador_visitante = m.visitante;
    recalcTabla(p.categoria_id); TL().limpiar(p.id);
    TL().toast('Marcador: ' + antes + ' → ' + m.local + '-' + m.visitante);
    drive('BASE › Correcciones', p.local_nombre + ' ' + antes + ' → ' + m.local + '-' + m.visitante);
    TL().recargar();
  }

  /* ================= ACCIONES ================= */
  /* ---- guardar de verdad (modo real): cada acción escribe en Supabase y vuelve a leer ---- */
  var AR = {
    gpartido: async function (b) {
      var id = b.dataset.id, cat = b.dataset.cat, er = document.getElementById('fErr');
      var fecha = document.getElementById('fFecha').value, hora = document.getElementById('fHora').value, lo = document.getElementById('fLocal').value, vi = document.getElementById('fVisit').value;
      if (!fecha || !hora) { er.textContent = 'Poné fecha y hora.'; return; }
      if (!lo || !vi || lo === vi) { er.textContent = 'Elegí dos equipos distintos.'; return; }
      var fila = { categoria_id: cat, local_id: lo, visitante_id: vi, fecha_hora: new Date(fecha + 'T' + hora + ':00').toISOString(), cancha: document.getElementById('fCancha').value.trim() || null, fase: document.getElementById('fFase').value, grupo: document.getElementById('fGrupo').value || null, nro_fecha: +document.getElementById('fNro').value || null };
      okr(id === 'nuevo' ? await SB().from('partidos').insert(fila) : await SB().from('partidos').update(fila).eq('id', id));
      TL().verDia(fecha); TL().toast(id === 'nuevo' ? 'Partido agregado al fixture.' : 'Partido actualizado.'); location.hash = '#/g-fixture'; await refrescarReal();
    },
    bpartido: async function (b) {
      var p = partido(b.dataset.id); if (!p || p.claim) return;
      confirmar('¿Borrar <b>' + esc(p.local_nombre + ' vs ' + p.visitante_nombre) + '</b> del fixture?', 'Borrar', function () {
        SB().from('partidos').delete().eq('id', p.id).then(function (r) { if (r.error) TL().toast(msgError(r.error)); else { TL().toast('Partido borrado.'); location.hash = '#/g-fixture'; refrescarReal(); } });
      });
    },
    armar: async function () {
      var cat = gcat(), eq = equipos(cat), er = document.getElementById('aErr');
      if (eq.length < 2) { er.textContent = 'Hacen falta al menos 2 equipos.'; return; }
      var f0 = document.getElementById('aFecha').value, h0 = document.getElementById('aHora').value, dias = +document.getElementById('aDias').value || 7, ppf = +document.getElementById('aPpf').value || 2, nc = +document.getElementById('aCanchas').value || 1, mm = +document.getElementById('aMin').value || 90, fase = document.getElementById('aFase').value;
      if (!f0 || !h0) { er.textContent = 'Poné la primera fecha y la hora.'; return; }
      var ids = eq.map(function (x) { return x.id; }); if (ids.length % 2) ids.push(null);
      var pares = [], n = ids.length, arr = ids.slice();
      for (var r = 0; r < n - 1; r++) { for (var i = 0; i < n / 2; i++) { var a = arr[i], b2 = arr[n - 1 - i]; if (a && b2) pares.push(r % 2 ? [b2, a] : [a, b2]); } arr.splice(1, 0, arr.pop()); }
      var ya = partidos(cat).filter(function (p) { return p.fase === fase; });
      pares = pares.filter(function (x) { return !ya.some(function (p) { return (p.local_id === x[0] && p.visitante_id === x[1]) || (p.local_id === x[1] && p.visitante_id === x[0]); }); });
      var maxN = Math.max.apply(null, [0].concat(partidos(cat).map(function (p) { return p.nro_fecha || 0; }))), base = new Date(f0 + 'T' + h0 + ':00');
      var filas = pares.map(function (x, i) { var j = Math.floor(i / ppf), k = i % ppf; return { categoria_id: cat, local_id: x[0], visitante_id: x[1], fecha_hora: new Date(base.getTime() + j * dias * 86400000 + Math.floor(k / nc) * mm * 60000).toISOString(), cancha: 'Cancha ' + (k % nc + 1), fase: fase, nro_fecha: maxN + j + 1 }; });
      if (filas.length) okr(await SB().from('partidos').insert(filas));
      TL().toast(filas.length ? '⚡ ' + filas.length + ' partidos armados.' : 'Ya estaban todos los cruces.'); location.hash = '#/g-fixture'; await refrescarReal();
    },
    gequipo: async function (b) {
      var nom = document.getElementById('eNombre').value.trim(), er = document.getElementById('eErr'), cat = b.dataset.cat, id = b.dataset.id;
      if (!nom) { er.textContent = 'Poné el nombre del equipo.'; return; }
      var fila = { categoria_id: cat, nombre: nom, color_principal: ST.form.p, color_alternativo: ST.form.a }, eid = id, antes = id === 'nuevo' ? null : equipo(id);
      if (id === 'nuevo') eid = okr(await SB().from('equipos').insert(fila).select('id').single()).id; else okr(await SB().from('equipos').update(fila).eq('id', id));
      var logo = ST.form.logo;
      if (esDataUrl(logo)) okr(await SB().from('equipos').update({ logo_url: await subirLogo(logo, ligaId() + '/equipos/' + eid + '.png') }).eq('id', eid));
      else if (!logo && antes && antes.logo_url) okr(await SB().from('equipos').update({ logo_url: null }).eq('id', eid));
      TL().toast(id === 'nuevo' ? 'Equipo creado. Ahora cargá sus jugadores.' : 'Equipo guardado.'); ST.form = {};
      if (id === 'nuevo') location.hash = '#/g-equipo/' + eid; await refrescarReal();
    },
    pegarOk: async function (b) {
      var e = equipo(b.dataset.id), txt = document.getElementById('pegado').value || '', filas = [];
      txt.split(/\r?\n/).forEach(function (ln) {
        ln = ln.trim(); if (!ln) return;
        var cam = null, alt = null, m = ln.match(/^#?(\d{1,2})[\s.\-)]+(.+)$/); if (m) { cam = +m[1]; ln = m[2]; }
        m = ln.match(/^(.+?)[\s,;\-]+(1[2-9]\d|2[0-4]\d)\s*(?:cm)?$/i); if (m) { alt = +m[2]; ln = m[1]; }
        var w = ln.replace(/[,;]+/g, ' ').trim().split(/\s+/), nombre = w[0], ape = w.slice(1).join(' ');
        if (nombre) filas.push({ nombre: nombre, apellido: ape || '-', altura: alt, cam: cam });
      });
      ST.pegar = false;
      if (!filas.length) { TL().toast('No encontré jugadores en el texto.'); TL().pintar(true); return; }
      var js = okr(await SB().from('jugadores').insert(filas.map(function (f) { return { liga_id: ligaId(), nombre: f.nombre, apellido: f.apellido, altura_cm: f.altura }; })).select('id'));
      okr(await SB().from('inscripciones').insert(js.map(function (j, i) { return { jugador_id: j.id, equipo_id: e.id, camiseta_habitual: filas[i].cam }; })));
      TL().toast(filas.length + ' jugadores agregados. Completá camiseta y altura donde falte.'); await refrescarReal();
    },
    gjug: async function (b) {
      var nom = document.getElementById('jNom').value.trim(), ape = document.getElementById('jApe').value.trim(), er = document.getElementById('jErr'), eq = b.dataset.eq, id = b.dataset.id;
      var cam = document.getElementById('jCam').value, alt = document.getElementById('jAlt').value;
      if (!nom) { er.textContent = 'Poné el nombre.'; return; }
      var sel = catsSel(eq); if (!sel.length) { er.textContent = 'Elegí al menos una categoría.'; return; }
      var cl = clubDe(eq), idsC = cl ? cl.equipos.map(function (x) { return x.id; }) : [eq];
      var ya = id === 'nuevo' ? [] : D.vista_jugadores.filter(function (x) { return x.id === id && idsC.indexOf(x.equipo_id) >= 0; }).map(function (x) { return x.equipo_id; });
      if (cam !== '' && sel.some(function (t) { return (ya.indexOf(t) < 0 || t === eq) && jugadores(t).some(function (j) { return j.id !== id && String(j.camiseta_habitual) === String(cam); }); })) { er.textContent = 'Esa camiseta ya la tiene otro jugador en una de las categorías elegidas.'; return; }
      var datos = { nombre: nom, apellido: ape || '-', altura_cm: alt === '' ? null : +alt }, jid = id, camv = cam === '' ? null : +cam;
      if (id === 'nuevo') jid = okr(await SB().from('jugadores').insert(Object.assign({ liga_id: ligaId() }, datos)).select('id').single()).id;
      else okr(await SB().from('jugadores').update(datos).eq('id', id));
      for (var i = 0; i < sel.length; i++) {          // alta en cada categoría marcada (la camiseta solo se cambia en la categoría que estás editando)
        if (ya.indexOf(sel[i]) < 0) okr(await SB().from('inscripciones').upsert({ jugador_id: jid, equipo_id: sel[i], camiseta_habitual: camv, activa: true }, { onConflict: 'jugador_id,equipo_id' }));
        else if (sel[i] === eq) okr(await SB().from('inscripciones').update({ camiseta_habitual: camv }).eq('jugador_id', jid).eq('equipo_id', sel[i]));
      }
      for (var k = 0; k < ya.length; k++) {           // baja en las categorías desmarcadas
        if (sel.indexOf(ya[k]) >= 0) continue;
        var d = await SB().from('inscripciones').delete().eq('jugador_id', jid).eq('equipo_id', ya[k]);
        if (d.error && d.error.code === '23503') okr(await SB().from('inscripciones').update({ activa: false }).eq('jugador_id', jid).eq('equipo_id', ya[k])); else okr(d);
      }
      okr(await SB().from('jugadores_privado').upsert({ jugador_id: jid, documento: document.getElementById('jDoc').value || null, fecha_nacimiento: document.getElementById('jNac').value || null, posicion: document.getElementById('jPos').value, habilitado: document.getElementById('jHab').value === 'si' }, { onConflict: 'jugador_id' }));
      TL().toast('Jugador guardado.'); location.hash = '#/g-equipo/' + (sel.indexOf(eq) >= 0 ? eq : sel[0]); await refrescarReal();
    },
    bjug: async function (b) {
      var j = D.vista_jugadores.filter(function (x) { return x.id === b.dataset.id; })[0]; if (!j) return;
      confirmar('¿Quitar a <b>' + esc(nombreDe(j)) + '</b> del equipo?', 'Quitar', function () {
        SB().from('jugadores').delete().eq('id', j.id).then(function (r) {
          if (r.error && r.error.code === '23503') return SB().from('inscripciones').update({ activa: false }).eq('jugador_id', j.id);   // ya tiene jugadas: se conserva su historial
          return r;
        }).then(function (r) { if (r && r.error) TL().toast(msgError(r.error)); else { TL().toast('Jugador quitado.'); location.hash = '#/g-equipo/' + j.equipo_id; refrescarReal(); } });
      });
    },
    anular: async function (b) {
      var p = partido(b.dataset.id), ev = D.eventos.filter(function (e) { return e.id === b.dataset.ev; })[0]; if (!p) return;
      var antes = p.marcador_local + '-' + p.marcador_visitante;
      okr(await SB().from('eventos').insert({ partido_id: p.id, tipo: 'ANULA', anula: b.dataset.ev, motivo: 'corrección del coordinador', cuarto: ev ? ev.cuarto : 1 }));
      okr(await SB().rpc('recalcular_partido', { p_partido: p.id }));
      EVL[p.id] = 0; TL().limpiar(p.id); await cargarEventosReal(p.id); await refrescarReal();
      TL().toast('Marcador: ' + antes + ' → ' + p.marcador_local + '-' + p.marcador_visitante);
    },
    agregarJ: async function (b) {
      var p = partido(b.dataset.id); if (!p) return;
      var antes = p.marcador_local + '-' + p.marcador_visitante;
      okr(await SB().from('eventos').insert({ partido_id: p.id, tipo: document.getElementById('cTipo').value, jugador_id: document.getElementById('cJug').value, cuarto: +document.getElementById('cCuarto').value, reloj_seg: 0 }));
      okr(await SB().rpc('recalcular_partido', { p_partido: p.id }));
      EVL[p.id] = 0; TL().limpiar(p.id); await cargarEventosReal(p.id); await refrescarReal();
      TL().toast('Marcador: ' + antes + ' → ' + p.marcador_local + '-' + p.marcador_visitante);
    },
    gclub: async function (b) {
      var c = club(b.dataset.key); if (!c) return;
      var logo = ST.form.logo, url = null, fila = { color_principal: ST.form.p, color_alternativo: ST.form.a };
      if (esDataUrl(logo)) url = await subirLogo(logo, ligaId() + '/equipos/' + c.equipos[0].id + '.png');
      if (url) fila.logo_url = url; else if (!logo) fila.logo_url = null;
      for (var i = 0; i < c.equipos.length; i++) okr(await SB().from('equipos').update(fila).eq('id', c.equipos[i].id));
      ST.form = {}; TL().toast('Club guardado en todas sus categorías.'); await refrescarReal();
    },
    addCatClub: async function (b) {
      var c = club(b.dataset.key), cat = document.getElementById('ccNueva').value; if (!c || !cat) return;
      var base = c.equipos[0];
      okr(await SB().from('equipos').insert({ categoria_id: cat, nombre: c.nombre, color_principal: c.color, color_alternativo: c.alt || base.color_alternativo, logo_url: c.logo || null }));
      TL().toast('Categoría sumada al club. Habilitá a sus jugadores con los botones.'); await refrescarReal();
    },
    recAprobar: async function (b) {
      var g = ST.rec && ST.rec[+b.dataset.i]; if (!g) return;
      confirmar('¿Aprobar a <b>' + esc(g.club) + '</b> con ' + g.jugadores.length + ' jugadores? Entran a la liga y, en unos minutos, a la hoja de Drive.', 'Aprobar', async function () {
        try { var r = okr(await SB().rpc('recibidos_resolver', { p_liga: ligaId(), p_ids: idsDe(g), p_aprobar: true })); TL().toast('Aprobado ✅ ' + r.jugadores_nuevos + ' jugadores nuevos' + (r.equipos_nuevos ? ' · ' + r.equipos_nuevos + ' equipo(s) creados' : '') + '.'); ST.rec = null; await refrescarReal(); } catch (e) { TL().toast(msgError(e)); }
      });
    },
    recRechazar: async function (b) {
      var g = ST.rec && ST.rec[+b.dataset.i]; if (!g) return;
      confirmar('¿Rechazar lo que mandó <b>' + esc(g.club) + '</b>? No entra a la liga.', 'Rechazar', async function () {
        try { okr(await SB().rpc('recibidos_resolver', { p_liga: ligaId(), p_ids: idsDe(g), p_aprobar: false })); TL().toast('Rechazado.'); ST.rec = null; TL().pintar(true); } catch (e) { TL().toast(msgError(e)); }
      });
    },
    recQuitar: async function (b) {
      var g = ST.rec && ST.rec[+b.dataset.i], x = g && g.jugadores[+b.dataset.j]; if (!x) return;
      try { okr(await SB().rpc('recibidos_resolver', { p_liga: ligaId(), p_ids: x.ids, p_aprobar: false })); TL().toast('Jugador quitado de lo recibido.'); ST.rec = null; TL().pintar(true); } catch (e) { TL().toast(msgError(e)); }
    },
    toggleCat: async function (b) {
      var jid = b.dataset.jug, eq = b.dataset.eq, on = b.classList.contains('on');
      var c = clubes().filter(function (k) { return k.equipos.some(function (e) { return e.id === eq; }); })[0];
      var actual = c ? c.equipos.filter(function (e) { return D.vista_jugadores.some(function (j) { return j.id === jid && j.equipo_id === e.id; }); }) : [];
      if (on) {
        if (actual.length <= 1) { TL().toast('Tiene que quedar en al menos una categoría. Para sacarlo del club, borralo desde su ficha.'); return; }
        var d = await SB().from('inscripciones').delete().eq('jugador_id', jid).eq('equipo_id', eq);
        if (d.error && d.error.code === '23503') okr(await SB().from('inscripciones').update({ activa: false }).eq('jugador_id', jid).eq('equipo_id', eq)); else okr(d);
      } else {
        okr(await SB().from('inscripciones').upsert({ jugador_id: jid, equipo_id: eq, activa: true }, { onConflict: 'jugador_id,equipo_id' }));
      }
      await refrescarReal();
    },
    fusionar: async function (b) {
      var e = equipo(b.dataset.id), otros = equipos(e.categoria_id).filter(function (x) { return x.id !== e.id; }).sort(function (a, c) { return a.nombre < c.nombre ? -1 : 1; });
      if (!otros.length) { TL().toast('No hay otros equipos en esta categoría.'); return; }
      modal('<h3>Fusionar equipos</h3><p class="muted sm" style="margin:0 0 12px">Todo lo de <b>' + esc(e.nombre) + '</b> (jugadores, partidos y planillas) pasa al equipo que elijas, y <b>' + esc(e.nombre) + ' se elimina</b>. No se repiten jugadores.</p>' +
        '<label class="campo"><span>Pasar a…</span><select id="fuDest">' + otros.map(function (x) { return '<option value="' + x.id + '">' + esc(x.nombre) + ' · ' + jugadores(x.id).length + ' jug.</option>'; }).join('') + '</select></label>',
        [['Cancelar'], ['Fusionar', function () {
          var d = document.getElementById('fuDest').value;
          SB().rpc('fusionar_equipos', { p_origen: e.id, p_destino: d }).then(function (r) {
            if (r.error) TL().toast(msgError(r.error)); else { TL().toast('Equipos fusionados.'); location.hash = '#/g-equipo/' + d; refrescarReal(); }
          });
          return true;
        }, 'p']]);
    },
    gliga: async function () {
      var l = S().liga, nom = document.getElementById('lNombre').value.trim(), er = document.getElementById('lErr');
      if (!nom) { er.textContent = 'Poné el nombre de la liga.'; return; }
      var fila = { nombre: nom }, logo = ST.form.llogo;
      if (esDataUrl(logo)) fila.logo_url = await subirLogo(logo, l.id + '/liga.png'); else if (!logo) fila.logo_url = null;
      okr(await SB().from('ligas').update(fila).eq('id', l.id));
      l.nombre = nom; if ('logo_url' in fila) l.logo_url = fila.logo_url;
      ST.form = {}; TL().toast('Liga guardada.'); await cargarReal(); await TL().recargarTodo();
    },
    addCat: async function () {
      var n = document.getElementById('cNom').value.trim(), t = document.getElementById('cTemp').value.trim() || '2026';
      if (!n) { TL().toast('Poné el nombre de la categoría.'); return; }
      okr(await SB().from('categorias').insert({ liga_id: ligaId(), nombre: n, temporada: t }));
      TL().toast('Categoría agregada. Ahora podés cargar sus equipos.'); await cargarReal(); await TL().recargarTodo();
    },
    renCat: async function (b) {
      var c = cats().filter(function (x) { return x.id === b.dataset.id; })[0];
      modal('<h3>Renombrar categoría</h3><label class="campo"><span>Nombre</span><input id="rcNom" value="' + esc(c.nombre) + '"></label><div class="err" id="rcErr"></div>', [['Cancelar'], ['Guardar', function () {
        var v = document.getElementById('rcNom').value.trim(); if (!v) { document.getElementById('rcErr').textContent = 'Poné un nombre.'; return false; }
        SB().from('categorias').update({ nombre: v }).eq('id', c.id).then(function (r) { if (r.error) TL().toast(msgError(r.error)); else cargarReal().then(function () { return TL().recargarTodo(); }); });
        return true;
      }, 'p']]);
    },
    liberarPartido: async function (b) {
      var p = partido(b.dataset.id); if (!p) return;
      confirmar('¿Liberar el partido <b>' + esc(p.local_nombre + ' vs ' + p.visitante_nombre) + '</b> de <b>' + esc(p.claim) + '</b>?' + (p.estado === 'en_vivo' ? ' Sigue en vivo con lo cargado hasta ahora: otra cuenta puede retomarlo.' : ''), 'Liberar', function () {
        SB().rpc('liberar_partido', { p_partido: p.id }).then(function (r) {
          if (r.error) { TL().toast(msgError(r.error)); return; }
          if (CAP[p.id]) { CAP[p.id].ov.remove(); delete CAP[p.id]; document.body.classList.remove('capabierta'); }
          TL().toast('Partido liberado.'); refrescarReal();
        });
      });
    },
    abrir: async function (b) {
      var p = partido(b.dataset.id); if (!p) return;
      if (p.claim && p.claim !== U.nombre) { TL().toast('Ese partido ya lo lleva ' + p.claim + '.'); return; }
      if (!CAP[p.id]) {
        okr(await SB().rpc('reclamar_partido', { p_partido: p.id })); p.claim = U.nombre;
        if (p.estado === 'en_vivo') await cargarEventosReal(p.id);
      }
      abrirCaptura(p);
    }
  };
  var A = {
    login: function () {
      var u = USUARIOS.filter(function (x) { return x.id === document.getElementById('lgCuenta').value; })[0], c = document.getElementById('lgPass').value;
      if (REAL) {
        var er = document.getElementById('lgErr'), bt = document.querySelector('[data-a=login]'); er.textContent = '';
        if (!c) { er.textContent = 'Escribí la contraseña.'; return; }
        bt.disabled = true;
        loginReal(u, c, er).then(function () { bt.disabled = false; }, function () { bt.disabled = false; er.textContent = 'No pude conectar. Revisá tu internet.'; });
        return;
      }
      if (!u || u.clave !== c) { document.getElementById('lgErr').textContent = 'La contraseña no es correcta. (Prototipo: es “demo”.)'; return; }
      entrarComo(u);
    },
    rapido: function (b) { entrarComo(USUARIOS.filter(function (x) { return x.id === b.dataset.id; })[0]); },
    logout: function () {
      if (REAL) {
        var viejo = U; U = null; guardarU(); try { sessionStorage.removeItem('tl_sid'); } catch (e) { /* nada */ }
        SB().rpc('cerrar_sesion', { p_sid: viejo.sid }).then(function () { return SB().auth.signOut(); });
        cabecera(); location.hash = '#/vivo'; TL().toast('Saliste. La cuenta queda libre para otra persona.'); return;
      }
      var o = locks(); if (U && o[U.id] && o[U.id].sid === U.sid) { delete o[U.id]; setLocks(o); }
      U = null; guardarU(); cabecera(); location.hash = '#/vivo'; TL().toast('Saliste. La cuenta queda libre para otra persona.');
    },
    cclave: function (b) {
      if (REAL) {
        var uidc = b.dataset.uid, nom = b.dataset.nom;
        modal('<h3>Cambiar clave · ' + esc(nom) + '</h3><label class="campo"><span>Clave nueva (mínimo 8 caracteres)</span><input id="nClave" type="text" autocomplete="off"></label><div class="err" id="nErr"></div>',
          [['Cancelar'], ['Guardar', function () {
            var v = document.getElementById('nClave').value.trim();
            if (v.length < 8) { document.getElementById('nErr').textContent = 'Usá al menos 8 caracteres.'; return false; }
            SB().functions.invoke('cambiar-clave', { body: { usuario_id: uidc, clave_nueva: v } }).then(function (r) {
              if (r.error) TL().toast('No pude cambiar la clave. ¿Está desplegada la función “cambiar-clave”?'); else { TL().toast('Clave cambiada. Pasásela solo a quienes usan esta cuenta.'); CUENTAS_T = 0; TL().pintar(true); }
            });
            return true;
          }, 'p']]);
        return;
      }
      var u = USUARIOS.filter(function (x) { return x.id === b.dataset.id; })[0];
      modal('<h3>Cambiar clave · ' + esc(u.nombre) + '</h3><label class="campo"><span>Clave nueva (mínimo 6 caracteres)</span><input id="nClave" type="text" autocomplete="off"></label><div class="err" id="nErr"></div>',
        [['Cancelar'], ['Guardar', function () {
          var v = document.getElementById('nClave').value.trim();
          if (v.length < 6) { document.getElementById('nErr').textContent = 'Usá al menos 6 caracteres.'; return false; }
          u.clave = v; TL().toast('Clave cambiada. Pasásela solo a quienes usan esta cuenta.'); return true;
        }, 'p']]);
    },
    reset: function () { location.hash = '#/vivo'; location.reload(); },
    pf: function (b) { ST.pf = b.dataset.v; TL().pintar(true); },
    gcat: function (b) { ST.gcat = b.dataset.v; TL().pintar(true); },
    evf: function (b) { ST.evf = b.dataset.v; TL().pintar(true); },
    abrir: function (b) {
      var p = partido(b.dataset.id); if (!p) return;
      if (p.claim && p.claim !== U.nombre) { TL().toast('Ese partido ya lo lleva ' + p.claim + '.'); return; }
      if (!p.claim) { p.claim = U.nombre; drive('BASE › Partidos', 'planillero asignado: ' + U.nombre); }
      abrirCaptura(p);
    },
    gpartido: function (b) {
      var id = b.dataset.id, cat = b.dataset.cat, e = document.getElementById('fErr');
      var fecha = document.getElementById('fFecha').value, hora = document.getElementById('fHora').value, lo = document.getElementById('fLocal').value, vi = document.getElementById('fVisit').value;
      if (!fecha || !hora) { e.textContent = 'Poné fecha y hora.'; return; }
      if (!lo || !vi || lo === vi) { e.textContent = 'Elegí dos equipos distintos.'; return; }
      var L = equipo(lo), V = equipo(vi), p = id === 'nuevo' ? null : partido(id);
      var datos = { categoria_id: cat, categoria_nombre: catNombre(cat), local_id: lo, local_nombre: L.nombre, local_color: L.color_principal, visitante_id: vi, visitante_nombre: V.nombre, visitante_color: V.color_principal,
        fecha_hora: new Date(fecha + 'T' + hora + ':00').toISOString(), cancha: document.getElementById('fCancha').value.trim(), fase: document.getElementById('fFase').value, grupo: document.getElementById('fGrupo').value, nro_fecha: +document.getElementById('fNro').value || 1 };
      if (p) Object.assign(p, datos);
      else D.vista_partidos.push(Object.assign({ id: uid(), liga_id: ligaId(), estado: 'programado', marcador_local: 0, marcador_visitante: 0, cuarto_actual: null, arbitros: [], cronometrista: null }, datos));
      drive('BASE › Partidos', (p ? 'fila actualizada: ' : 'fila agregada: ') + L.nombre + ' vs ' + V.nombre);
      TL().verDia(fecha); TL().toast(p ? 'Partido actualizado.' : 'Partido agregado al fixture.'); location.hash = '#/g-fixture'; TL().recargar();
    },
    bpartido: function (b) {
      var p = partido(b.dataset.id); if (!p || p.claim) return;
      confirmar('¿Borrar <b>' + esc(p.local_nombre + ' vs ' + p.visitante_nombre) + '</b> del fixture?', 'Borrar', function () {
        D.vista_partidos.splice(D.vista_partidos.indexOf(p), 1);
        drive('BASE › Partidos', 'fila borrada: ' + p.local_nombre + ' vs ' + p.visitante_nombre);
        TL().toast('Partido borrado.'); location.hash = '#/g-fixture'; TL().recargar();
      });
    },
    armar: function () {
      var cat = gcat(), eq = equipos(cat), e = document.getElementById('aErr');
      if (eq.length < 2) { e.textContent = 'Hacen falta al menos 2 equipos.'; return; }
      var f0 = document.getElementById('aFecha').value, h0 = document.getElementById('aHora').value, dias = +document.getElementById('aDias').value || 7, ppf = +document.getElementById('aPpf').value || 2, nc = +document.getElementById('aCanchas').value || 1, mm = +document.getElementById('aMin').value || 90, fase = document.getElementById('aFase').value;
      if (!f0 || !h0) { e.textContent = 'Poné la primera fecha y la hora.'; return; }
      var ids = eq.map(function (x) { return x.id; }); if (ids.length % 2) ids.push(null);
      var rondas = [], n = ids.length, arr = ids.slice();                   // método del círculo: todos contra todos
      for (var r = 0; r < n - 1; r++) { var par = []; for (var i = 0; i < n / 2; i++) { var a = arr[i], b = arr[n - 1 - i]; if (a && b) par.push(r % 2 ? [b, a] : [a, b]); } rondas.push(par); arr.splice(1, 0, arr.pop()); }
      var pares = []; rondas.forEach(function (rr) { rr.forEach(function (x) { pares.push(x); }); });
      var ya = partidos(cat).filter(function (p) { return p.fase === fase; });
      pares = pares.filter(function (x) { return !ya.some(function (p) { return (p.local_id === x[0] && p.visitante_id === x[1]) || (p.local_id === x[1] && p.visitante_id === x[0]); }); });
      var maxN = Math.max.apply(null, [0].concat(partidos(cat).map(function (p) { return p.nro_fecha || 0; }))), base = new Date(f0 + 'T' + h0 + ':00'), creados = 0;
      pares.forEach(function (x, i) {
        var j = Math.floor(i / ppf), k = i % ppf, d = new Date(base.getTime() + j * dias * 86400000 + Math.floor(k / nc) * mm * 60000), L = equipo(x[0]), V = equipo(x[1]);
        D.vista_partidos.push({ id: uid(), liga_id: ligaId(), categoria_id: cat, categoria_nombre: catNombre(cat), local_id: L.id, local_nombre: L.nombre, local_color: L.color_principal, visitante_id: V.id, visitante_nombre: V.nombre, visitante_color: V.color_principal,
          fecha_hora: d.toISOString(), cancha: 'Cancha ' + (k % nc + 1), fase: fase, grupo: '', estado: 'programado', marcador_local: 0, marcador_visitante: 0, cuarto_actual: null, arbitros: [], cronometrista: null, nro_fecha: maxN + j + 1 });
        creados++;
      });
      drive('BASE › Partidos', creados + ' filas agregadas (armado automático)');
      TL().toast(creados ? '⚡ ' + creados + ' partidos armados.' : 'Ya estaban todos los cruces.'); location.hash = '#/g-fixture'; TL().recargar();
    },
    llogoQuitar: function () { ST.form.llogo = null; var n = document.getElementById('lNombre'); if (n) ST.form.lnombre = n.value; TL().pintar(true); },
    gliga: function () {
      var l = S().liga, nom = document.getElementById('lNombre').value.trim();
      if (!nom) { document.getElementById('lErr').textContent = 'Poné el nombre de la liga.'; return; }
      l.nombre = nom; l.logo_url = ST.form.llogo || null;
      D.vista_categorias.forEach(function (c) { if (c.liga_id === l.id) c.liga_nombre = nom; });
      drive('LIGAS', 'liga actualizada: ' + nom); ST.form = {}; TL().toast('Liga guardada.'); TL().recargarTodo();
    },
    addCat: function () {
      var n = document.getElementById('cNom').value.trim(), t = document.getElementById('cTemp').value.trim() || '2026', l = S().liga;
      if (!n) { TL().toast('Poné el nombre de la categoría.'); return; }
      if (cats().some(function (c) { return c.nombre.toLowerCase() === n.toLowerCase() && c.temporada === t; })) { TL().toast('Esa categoría ya existe.'); return; }
      D.vista_categorias.push({ id: uid(), liga_id: l.id, liga_slug: l.slug, liga_nombre: l.nombre, nombre: n, temporada: t }); l.categorias = (l.categorias || 0) + 1;
      drive('BASE › Categorías', 'categoría agregada: ' + n); TL().toast('Categoría agregada. Ahora podés cargar sus equipos.'); TL().recargarTodo();
    },
    renCat: function (b) {
      var c = cats().filter(function (x) { return x.id === b.dataset.id; })[0];
      modal('<h3>Renombrar categoría</h3><label class="campo"><span>Nombre</span><input id="rcNom" value="' + esc(c.nombre) + '"></label><div class="err" id="rcErr"></div>', [['Cancelar'], ['Guardar', function () {
        var v = document.getElementById('rcNom').value.trim(); if (!v) { document.getElementById('rcErr').textContent = 'Poné un nombre.'; return false; }
        c.nombre = v; D.vista_partidos.forEach(function (p) { if (p.categoria_id === c.id) p.categoria_nombre = v; });
        drive('BASE › Categorías', 'categoría renombrada: ' + v); TL().recargarTodo(); return true;
      }, 'p']]);
    },
    liberarCuenta: function (b) {
      if (REAL) {
        confirmar('¿Liberar <b>' + esc(b.dataset.nom) + '</b>? Se cierra la sesión que la está usando y la cuenta queda libre.', 'Liberar', function () {
          SB().rpc('liberar_cuenta', { p_usuario: b.dataset.uid }).then(function (r) { if (r.error) TL().toast('No pude liberar la cuenta.'); else { TL().toast(b.dataset.nom + ' liberada.'); CUENTAS_T = 0; TL().pintar(true); } });
        });
        return;
      }
      var u = USUARIOS.filter(function (x) { return x.id === b.dataset.id; })[0];
      confirmar('¿Liberar <b>' + esc(u.nombre) + '</b>? Se cierra la sesión que la está usando y la cuenta queda libre.', 'Liberar', function () {
        var o = locks(); o[u.id] = { sid: 'liberada-' + uid(), t: Date.now() }; setLocks(o);
        setTimeout(function () { var o2 = locks(); if (o2[u.id] && /^liberada-/.test(o2[u.id].sid)) { delete o2[u.id]; setLocks(o2); } TL().pintar(true); }, 1600);
        TL().toast(u.nombre + ' liberada.');
      });
    },
    liberarPartido: function (b) {
      var p = partido(b.dataset.id); if (!p) return;
      confirmar('¿Liberar el partido <b>' + esc(p.local_nombre + ' vs ' + p.visitante_nombre) + '</b> de <b>' + esc(p.claim) + '</b>?' + (p.estado === 'en_vivo' ? ' Sigue en vivo con lo cargado hasta ahora: otra cuenta puede retomarlo.' : ''), 'Liberar', function () {
        var quien = p.claim; p.claim = null;
        if (CAP[p.id]) { CAP[p.id].ov.remove(); delete CAP[p.id]; document.body.classList.remove('capabierta'); }
        drive('BASE › Partidos', 'planillero liberado: ' + quien + ' · ' + p.local_nombre + ' vs ' + p.visitante_nombre);
        TL().toast('Partido liberado.'); TL().pintar(true);
      });
    },
    logoQuitar: function () { ST.form.logo = null; TL().pintar(true); },
    color: function (b) { ST.form[b.dataset.k] = b.dataset.v; Array.prototype.slice.call(b.parentNode.children).forEach(function (x) { x.classList.toggle('on', x === b); }); },
    gequipo: function (b) {
      var nom = document.getElementById('eNombre').value.trim(), e = document.getElementById('eErr'), cat = b.dataset.cat, id = b.dataset.id;
      if (!nom) { e.textContent = 'Poné el nombre del equipo.'; return; }
      if (equipos(cat).some(function (x) { return x.nombre.toLowerCase() === nom.toLowerCase() && x.id !== id; })) { e.textContent = 'Ya hay un equipo con ese nombre en esta categoría.'; return; }
      var q = equipo(id);
      if (q) { q.nombre = nom; q.color_principal = ST.form.p; q.color_alternativo = ST.form.a; q.logo_url = ST.form.logo || null; sincNombres(q); drive('BASE › Equipos', 'fila actualizada: ' + nom); TL().toast('Equipo guardado.'); TL().recargar(); }
      else {
        q = { id: uid(), categoria_id: cat, nombre: nom, color_principal: ST.form.p, color_alternativo: ST.form.a, logo_url: ST.form.logo || null }; D.vista_equipos.push(q); recalcTabla(cat);
        drive('BASE › Equipos', 'fila agregada: ' + nom); TL().toast('Equipo creado. Ahora cargá sus jugadores.'); ST.form = {}; location.hash = '#/g-equipo/' + q.id; TL().recargar();
      }
    },
    gclub: function (b) {
      var c = club(b.dataset.key); if (!c) return;
      c.equipos.forEach(function (e) { e.color_principal = ST.form.p; e.color_alternativo = ST.form.a; e.logo_url = ST.form.logo || null; });
      drive('BASE › Equipos', 'club actualizado: ' + c.nombre); ST.form = {}; TL().toast('Club guardado en todas sus categorías.'); TL().recargar();
    },
    addCatClub: function (b) {
      var c = club(b.dataset.key), cat = document.getElementById('ccNueva').value; if (!c || !cat) return;
      D.vista_equipos.push({ id: uid(), categoria_id: cat, nombre: c.nombre, color_principal: c.color, color_alternativo: c.alt, logo_url: c.logo || null });
      drive('BASE › Equipos', 'categoría sumada a ' + c.nombre); TL().toast('Categoría sumada al club.'); TL().recargar();
    },
    toggleCat: function (b) {
      var jid = b.dataset.jug, eq = b.dataset.eq, on = b.classList.contains('on'), e = equipo(eq);
      var propias = D.vista_jugadores.filter(function (j) { return j.id === jid; });
      if (on) {
        var enClub = propias.filter(function (j) { var q = equipo(j.equipo_id); return q && kClub(q.nombre) === kClub(e.nombre); });
        if (enClub.length <= 1) { TL().toast('Tiene que quedar en al menos una categoría.'); return; }
        D.vista_jugadores.splice(D.vista_jugadores.indexOf(propias.filter(function (j) { return j.equipo_id === eq; })[0]), 1);
      } else {
        var base = propias[0]; if (!base) return;
        D.vista_jugadores.push(Object.assign({}, base, { equipo_id: eq, equipo_nombre: e.nombre, categoria_id: e.categoria_id, camiseta_habitual: null }));
      }
      drive('BASE › Jugadores', 'categorías del jugador actualizadas'); TL().recargar();
    },
    pegarT: function () { ST.pegar = !ST.pegar; TL().pintar(true); },
    pegarOk: function (b) {
      var e = equipo(b.dataset.id), txt = (document.getElementById('pegado').value || ''), n = 0;
      txt.split(/\r?\n/).forEach(function (ln) {
        ln = ln.trim(); if (!ln) return;
        var cam = null, alt = null, m = ln.match(/^#?(\d{1,2})[\s.\-)]+(.+)$/); if (m) { cam = +m[1]; ln = m[2]; }
        m = ln.match(/^(.+?)[\s,;\-]+(1[2-9]\d|2[0-4]\d)\s*(?:cm)?$/i); if (m) { alt = +m[2]; ln = m[1]; }
        var w = ln.replace(/[,;]+/g, ' ').trim().split(/\s+/), nombre = w[0], ape = w.slice(1).join(' ');
        if (!nombre) return;
        D.vista_jugadores.push({ id: uid(), liga_id: ligaId(), nombre: nombre, apellido: ape, nombre_completo: (nombre + ' ' + ape).trim(), altura_cm: alt, equipo_id: e.id, equipo_nombre: e.nombre, categoria_id: e.categoria_id, camiseta_habitual: cam });
        n++;
      });
      ST.pegar = false;
      if (n) { drive('BASE › Jugadores', n + ' filas agregadas (lista pegada)'); TL().toast(n + ' jugadores agregados. Completá camiseta y altura donde falte.'); } else TL().toast('No encontré jugadores en el texto.');
      TL().recargar();
    },
    copiarForm: function () {
      var u = urlFormulario();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(u).then(function () { TL().toast('Enlace copiado ✅'); }, function () { TL().toast(u); }); else TL().toast(u);
    },
    recAprobar: function (b) {
      var g = ST.rec && ST.rec[+b.dataset.i]; if (!g) return;
      confirmar('¿Aprobar a <b>' + esc(g.club) + '</b> con ' + g.jugadores.length + ' jugadores? Entran a la liga y, en unos minutos, a la hoja de Drive.', 'Aprobar', function () {
        var n = 0;
        g.jugadores.forEach(function (x) {
          var jid = null; Object.keys(PRIV).forEach(function (k) { if (PRIV[k] && PRIV[k].doc === x.documento) jid = k; });
          if (!jid) jid = uid();
          x.categorias.forEach(function (cn) {
            var ct = cats().filter(function (c) { return c.nombre === cn; })[0]; if (!ct) return;
            var eq = D.vista_equipos.filter(function (e) { return e.categoria_id === ct.id && kClub(e.nombre) === kClub(g.club); })[0];
            if (!eq) { var base = D.vista_equipos.filter(function (e) { return kClub(e.nombre) === kClub(g.club); })[0]; eq = { id: uid(), categoria_id: ct.id, nombre: g.club, color_principal: base ? base.color_principal : '#ff8a4c', color_alternativo: base ? base.color_alternativo : '#ffffff', logo_url: base ? base.logo_url : null }; D.vista_equipos.push(eq); }
            if (!D.vista_jugadores.some(function (j) { return j.id === jid && j.equipo_id === eq.id; })) D.vista_jugadores.push({ id: jid, liga_id: ligaId(), nombre: x.nombre, apellido: x.apellido, nombre_completo: x.nombre + ' ' + x.apellido, altura_cm: x.altura || null, equipo_id: eq.id, equipo_nombre: eq.nombre, categoria_id: ct.id, camiseta_habitual: x.camiseta });
          });
          PRIV[jid] = PRIV[jid] || { doc: x.documento, nac: x.nacimiento, hab: 'si' }; n++;
        });
        ST.rec.splice(+b.dataset.i, 1); drive('BASE › Jugadores', n + ' jugadores aprobados de ' + g.club); TL().toast('Aprobado ✅ ' + n + ' jugadores.'); TL().recargar();
      });
    },
    recRechazar: function (b) {
      var g = ST.rec && ST.rec[+b.dataset.i]; if (!g) return;
      confirmar('¿Rechazar lo que mandó <b>' + esc(g.club) + '</b>? No entra a la liga.', 'Rechazar', function () { ST.rec.splice(+b.dataset.i, 1); TL().toast('Rechazado.'); TL().pintar(true); });
    },
    recQuitar: function (b) {
      var g = ST.rec && ST.rec[+b.dataset.i]; if (!g) return; g.jugadores.splice(+b.dataset.j, 1);
      if (!g.jugadores.length) ST.rec.splice(+b.dataset.i, 1); TL().toast('Jugador quitado de lo recibido.'); TL().pintar(true);
    },
    jcat: function (b) { b.classList.toggle('on'); },
    gjug: function (b) {
      var nom = document.getElementById('jNom').value.trim(), ape = document.getElementById('jApe').value.trim(), er = document.getElementById('jErr'), eq = b.dataset.eq, id = b.dataset.id;
      var cam = document.getElementById('jCam').value, alt = document.getElementById('jAlt').value;
      if (!nom) { er.textContent = 'Poné el nombre.'; return; }
      var sel = catsSel(eq); if (!sel.length) { er.textContent = 'Elegí al menos una categoría.'; return; }
      var cl = clubDe(eq), idsC = cl ? cl.equipos.map(function (x) { return x.id; }) : [eq];
      var filas = id === 'nuevo' ? [] : D.vista_jugadores.filter(function (x) { return x.id === id && idsC.indexOf(x.equipo_id) >= 0; });
      var ya = filas.map(function (x) { return x.equipo_id; });
      if (cam !== '' && sel.some(function (t) { return (ya.indexOf(t) < 0 || t === eq) && jugadores(t).some(function (j) { return j.id !== id && String(j.camiseta_habitual) === String(cam); }); })) { er.textContent = 'Esa camiseta ya la tiene otro jugador en una de las categorías elegidas.'; return; }
      var datos = { nombre: nom, apellido: ape, nombre_completo: (nom + ' ' + ape).trim(), altura_cm: alt === '' ? null : +alt, posicion: document.getElementById('jPos').value }, camv = cam === '' ? null : +cam, jid = id === 'nuevo' ? uid() : id;
      filas.forEach(function (r) { Object.assign(r, datos); if (r.equipo_id === eq) r.camiseta_habitual = camv; });
      filas.filter(function (r) { return sel.indexOf(r.equipo_id) < 0; }).forEach(function (r) { D.vista_jugadores.splice(D.vista_jugadores.indexOf(r), 1); });
      sel.forEach(function (t) { if (ya.indexOf(t) < 0) { var e2 = equipo(t); D.vista_jugadores.push(Object.assign({ id: jid, liga_id: ligaId(), equipo_id: t, equipo_nombre: e2.nombre, categoria_id: e2.categoria_id }, datos, { camiseta_habitual: camv })); } });
      PRIV[jid] = { doc: document.getElementById('jDoc').value, nac: document.getElementById('jNac').value, hab: document.getElementById('jHab').value };
      drive('BASE › Jugadores', (id === 'nuevo' ? 'fila agregada: ' : 'fila actualizada: ') + datos.nombre_completo + (sel.length > 1 ? ' (' + sel.length + ' categorías)' : ''));
      TL().toast('Jugador guardado.'); location.hash = '#/g-equipo/' + (sel.indexOf(eq) >= 0 ? eq : sel[0]); TL().recargar();
    },
    bjug: function (b) {
      var j = D.vista_jugadores.filter(function (x) { return x.id === b.dataset.id; })[0]; if (!j) return;
      confirmar('¿Quitar a <b>' + esc(nombreDe(j)) + '</b> del equipo?', 'Quitar', function () {
        D.vista_jugadores.splice(D.vista_jugadores.indexOf(j), 1); delete PRIV[j.id];
        drive('BASE › Jugadores', 'fila quitada: ' + nombreDe(j)); TL().toast('Jugador quitado.'); location.hash = '#/g-equipo/' + j.equipo_id; TL().recargar();
      });
    },
    anular: function (b) {
      var p = partido(b.dataset.id), ev = D.eventos.filter(function (e) { return e.id === b.dataset.ev; })[0]; if (!p || !ev) return;
      var antes = p.marcador_local + '-' + p.marcador_visitante, mx = Math.max.apply(null, D.eventos.filter(function (e) { return e.partido_id === p.id; }).map(function (e) { return e.seq; }).concat([0]));
      D.eventos.push({ id: uid(), seq: mx + 1, partido_id: p.id, tipo: 'ANULA', equipo: null, jugador_id: null, jugador2_id: null, cuarto: ev.cuarto, reloj_seg: null, detalle: null, ref: null, anula: ev.id });
      aplicarMarcador(p, antes);
    },
    agregarJ: function (b) {
      var p = partido(b.dataset.id), jid = document.getElementById('cJug').value, tipo = document.getElementById('cTipo').value, cu = +document.getElementById('cCuarto').value; if (!p) return;
      var r = D.vista_partido_jugadores.filter(function (x) { return x.partido_id === p.id && x.jugador_id === jid; })[0]; if (!r) return;
      var antes = p.marcador_local + '-' + p.marcador_visitante, mx = Math.max.apply(null, D.eventos.filter(function (e) { return e.partido_id === p.id; }).map(function (e) { return e.seq; }).concat([0]));
      D.eventos.push({ id: uid(), seq: mx + 1, partido_id: p.id, tipo: tipo, equipo: r.equipo_id === p.local_id ? 'local' : 'visitante', jugador_id: jid, jugador2_id: null, cuarto: cu, reloj_seg: 0, detalle: null, ref: null, anula: null });
      aplicarMarcador(p, antes);
    }
  };
  function modal(html, botones, ok) {
    var m = document.querySelector('.modal'); if (m) m.remove();
    m = document.createElement('div'); m.className = 'modal';
    m.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + '<div class="fila-btns" style="margin-bottom:0">' + botones.map(function (b, i) { return '<button class="btn' + (b[2] ? ' ' + b[2] : '') + '" data-i="' + i + '" type="button" style="flex:1">' + b[0] + '</button>'; }).join('') + '</div></div>';
    m.onclick = function (e) {
      if (e.target === m) { m.remove(); return; }
      var b = e.target.closest('[data-i]'); if (!b) return;
      var f = botones[+b.dataset.i][1], r = f ? f() : true;
      if (r !== false) m.remove();
    };
    document.body.appendChild(m);
    var inp = m.querySelector('input'); if (inp) inp.focus();
  }
  function confirmar(msg, okTxt, fn) { modal('<p style="margin:0 0 14px;font-size:16px">' + msg + '</p>', [['Cancelar'], [okTxt, fn, 'p']]); }
  function entrarComo(u) {
    var seguir = function () {
      U = { id: u.id, rol: u.rol, nombre: u.nombre, sid: uid() }; guardarU();
      var o = locks(); o[u.id] = { sid: U.sid, t: Date.now() }; setLocks(o);
      cabecera(); TL().toast('Entraste como ' + u.nombre + '.');
      location.hash = esPl() ? '#/planilla' : '#/gestion';
    };
    if (enUsoPorOtro(u.id)) confirmar('<b>' + esc(u.nombre) + '</b> está abierta en otro dispositivo. Si entrás, esa sesión se cierra.', 'Entrar igual', seguir);
    else seguir();
  }

  window.TL_ROLES = { vista: vista, despues: despues, cabecera: cabecera, extra: extra, tab: tab, esCaptura: esCaptura };
})();
