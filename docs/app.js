/* TU LIGA · web de la liga (cartelera pública)
 * Para qué: que cualquier persona, SIN login, consulte la liga: partidos en vivo, tabla, estadísticas, jugadores y equipos.
 * Privacidad: solo muestra NOMBRE, CAMISETA (por partido), ALTURA y estadísticas. Nada más sale de la base.
 * Datos: Supabase (vistas públicas) o, si config.js está vacío, datos de demostración inventados.
 */
(function () {
  'use strict';
  var CFG = window.LIGA_CONFIG || {};
  var DEMO = !(CFG.supabaseUrl && CFG.supabaseKey) || /[?&]demo=1/.test(location.search);   // ?demo=1 fuerza el modo demostración
  var sb = null;
  var S = { ligas: [], liga: null, cats: [], vivoCats: {}, catId: '', eq: {}, jug: {}, partidos: [], tabla: [], statsJ: [], statsE: [], cargado: false };
  var PJ = {};            // jugadores habilitados por partido (cache)
  var LV = { evs: {}, canal: null, poll: null, demo: null };   // eventos de partidos en vivo
  var SELLOG = {};        // cache de estadísticas por partido
  var LS = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } } };

  /* ---------- utilidades ---------- */
  function $(s) { return document.querySelector(s); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n1(n) { return n == null ? '–' : Number(n).toFixed(1).replace('.', ','); }
  function n0(n) { return n == null ? '–' : String(Math.round(Number(n))); }
  function pct(a, b) { return b ? Math.round(100 * a / b) + '%' : '–'; }
  function mmss(s) { if (s == null) return '–'; var m = Math.floor(s / 60), r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }
  function cuartoTxt(c) { return c > 4 ? 'TS' + (c - 4) : 'C' + c; }
  function fecha(iso) { try { return new Date(iso).toLocaleString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
  function mark(id, color, size) {
    var e = S.eq[id], logo = e && e.logo_url;
    return logo ? '<img class="esc ' + (size || '') + '" style="--c:' + esc(color || '#888') + '" src="' + esc(logo) + '" alt="" loading="lazy">' : dot(color);
  }
  function dot(color) { return '<i class="dot" style="background:' + esc(color || '#888') + '"></i>'; }
  function eqNombre(id) { var e = S.eq[id]; return e ? e.nombre : '—'; }
  function eqColor(id) { var e = S.eq[id]; return e ? e.color_principal : '#888'; }
  function toast(msg) { var t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 2600); }
  function compartir(titulo, texto) {
    var url = location.href;
    if (navigator.share) { navigator.share({ title: titulo, text: texto, url: url }).catch(function () { /* cancelado */ }); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(texto + ' ' + url).then(function () { toast('Enlace copiado'); }, function () { toast(url); }); return; }
    toast(url);
  }

  /* ---------- acceso a datos (Supabase o demostración) ---------- */
  function sel(tabla, filtros, orden) {
    filtros = filtros || {};
    if (DEMO) {
      var rows = (window.DEMO_DATOS[tabla] || []).filter(function (r) { return Object.keys(filtros).every(function (k) { return r[k] === filtros[k]; }); });
      if (orden) rows = rows.slice().sort(function (a, b) { return a[orden] < b[orden] ? -1 : a[orden] > b[orden] ? 1 : 0; });
      return Promise.resolve(rows.slice());
    }
    var q = sb.from(tabla).select('*');
    Object.keys(filtros).forEach(function (k) { q = q.eq(k, filtros[k]); });
    if (orden) q = q.order(orden);
    return q.then(function (r) { if (r.error) throw r.error; return r.data || []; });
  }
  function cargarScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('No pude cargar ' + src)); }; document.head.appendChild(s); });
  }

  function vaciarLiga() { S.cats = []; S.vivoCats = {}; S.catId = ''; S.eq = {}; S.jug = {}; S.partidos = []; S.tabla = []; S.statsJ = []; S.statsE = []; S.cargado = false; LV.evs = {}; PJ = {}; SELLOG = {}; }
  function cargar() {
    sel('vista_partidos', { liga_id: S.liga.id, estado: 'en_vivo' }).then(function (v) { S.vivoCats = {}; v.forEach(function (p) { S.vivoCats[p.categoria_id] = (S.vivoCats[p.categoria_id] || 0) + 1; }); }, function () { S.vivoCats = {}; });
    return sel('vista_categorias', { liga_slug: S.liga.slug }).then(function (cats) {
      if (!cats.length) { S.cats = []; S.catId = ''; S.cargado = true; return; }
      S.cats = cats;
      var guardada = LS.get('liga_cat');
      S.catId = (cats.filter(function (c) { return c.id === guardada; })[0] || cats[0]).id;
      return cargarCategoria();
    });
  }
  function cargarCategoria() {
    var f = { categoria_id: S.catId };
    return Promise.all([sel('vista_equipos', f), sel('vista_jugadores', f), sel('vista_partidos', f, 'fecha_hora'), sel('vista_tabla', f, 'posicion'), sel('vista_stats_jugador', f), sel('vista_stats_equipo', f)]).then(function (r) {
      S.eq = {}; r[0].forEach(function (e) { S.eq[e.id] = e; });
      S.jug = {}; r[1].forEach(function (j) { S.jug[j.id] = j; });
      S.partidos = r[2]; S.tabla = r[3]; S.statsJ = r[4]; S.statsE = r[5]; S.cargado = true;
    });
  }
  function recargarPartidos() { return sel('vista_partidos', { categoria_id: S.catId }, 'fecha_hora').then(function (p) { S.partidos = p; return sel('vista_tabla', { categoria_id: S.catId }, 'posicion'); }).then(function (t) { S.tabla = t; }); }
  function jugadoresDe(partidoId) {
    if (PJ[partidoId]) return Promise.resolve(PJ[partidoId]);
    return sel('vista_partido_jugadores', { partido_id: partidoId }).then(function (r) { PJ[partidoId] = r; return r; });
  }
  function eventosDe(partidoId) {
    if (DEMO) { var todos = window.DEMO_DATOS.eventos.filter(function (e) { return e.partido_id === partidoId; }); var vis = LV.demo && LV.demo.id === partidoId ? LV.demo.n : todos.length; return Promise.resolve(todos.slice(0, vis)); }
    return sel('eventos', { partido_id: partidoId }, 'seq');
  }
  function logJugador(jugId) { return sel('vista_stats_jugador_partido', { jugador_id: jugId }); }

  /* ---------- cálculo de un partido a partir de sus eventos ---------- */
  function calc(evs, pj) {
    var anul = {}; evs.forEach(function (e) { if (e.tipo === 'ANULA' && e.anula) anul[e.anula] = true; });
    var v = evs.filter(function (e) { return e.tipo !== 'ANULA' && !anul[e.id]; }).sort(function (a, b) { return a.seq - b.seq; });
    var jug = {}; (pj || []).forEach(function (x) { jug[x.jugador_id] = { id: x.jugador_id, nombre: x.nombre_completo, equipo_id: x.equipo_id, camiseta: x.camiseta, pts: 0, reb: 0, ast: 0, rob: 0, per: 0, faltas: 0, t3: 0 }; });
    var lado = { local: { pts: 0, faltas: {}, tm: 0 }, visitante: { pts: 0, faltas: {}, tm: 0 } };
    var parc = { local: {}, visitante: {} }, cuarto = 1;
    v.forEach(function (e) { if (e.cuarto) cuarto = Math.max(cuarto, e.cuarto); });
    v.forEach(function (e) {
      var pts = { P1: 1, P2: 2, P3: 3 }[e.tipo], j = jug[e.jugador_id], l = lado[e.equipo], q = e.cuarto || 1;
      if (pts && l) { l.pts += pts; parc[e.equipo][q] = (parc[e.equipo][q] || 0) + pts; if (j) { j.pts += pts; if (e.tipo === 'P3') j.t3++; } }
      else if (e.tipo === 'REB' && j) j.reb++;
      else if (e.tipo === 'AST' && j) j.ast++;
      else if (e.tipo === 'ROB' && j) j.rob++;
      else if (e.tipo === 'PER' && j) j.per++;
      else if (e.tipo === 'FALTA' && j && l) { j.faltas++; l.faltas[q] = (l.faltas[q] || 0) + 1; }
      else if (e.tipo === 'TM' && l) l.tm++;
    });
    var ult = v.filter(function (e) { return e.reloj_seg != null && e.cuarto === cuarto; }).pop();
    return { v: v, jug: jug, lado: lado, parc: parc, cuarto: cuarto, reloj: ult ? ult.reloj_seg : null };
  }
  function descEvento(e, jug, p) {
    var j = jug[e.jugador_id], n = j ? '#' + j.camiseta + ' ' + j.nombre : '', j2 = jug[e.jugador2_id];
    var eq = e.equipo === 'local' ? p.local_nombre : e.equipo === 'visitante' ? p.visitante_nombre : '';
    switch (e.tipo) {
      case 'P1': return '🏀 Libre convertido · ' + n;
      case 'P2': return '🏀 Doble · ' + n;
      case 'P3': return '🎯 Triple · ' + n;
      case 'E1': case 'E2': case 'E3': return 'Tiro errado · ' + n;
      case 'REB': return 'Rebote · ' + n;
      case 'AST': return 'Asistencia · ' + n;
      case 'ROB': return 'Robo · ' + n;
      case 'PER': return 'Pérdida · ' + n;
      case 'FALTA': return '🟨 Falta' + (e.detalle ? ' ' + e.detalle : '') + ' · ' + n;
      case 'TM': return '⏸ Tiempo muerto · ' + eq;
      case 'CAMBIO': return '🔁 Cambio · sale ' + (j ? j.nombre : '') + ', entra ' + (j2 ? j2.nombre : '');
      case 'CUARTO_INICIO': return '▶ Comienza el ' + cuartoTxt(e.cuarto);
      case 'CUARTO_FIN': return '⏹ Termina el ' + cuartoTxt(e.cuarto);
      default: return e.tipo;
    }
  }

  /* ---------- partidos en vivo (varios a la vez) ---------- */
  function idsVivo() { return S.partidos.filter(function (p) { return p.estado === 'en_vivo'; }).map(function (p) { return p.id; }); }
  function aplicarEvento(e) {
    var arr = LV.evs[e.partido_id] || (LV.evs[e.partido_id] = []);
    if (arr.some(function (x) { return x.id === e.id; })) return;
    arr.push(e);
    refrescarSiVivo();
  }
  function refrescarSiVivo() { var r = ruta(); if (r.p[0] === 'vivo' || (r.p[0] === 'partido' && idsVivo().indexOf(r.p[1]) >= 0)) pintar(true); }
  function iniciarVivo() {
    detenerVivo();
    var ids = idsVivo();
    return Promise.all(ids.map(function (id) { return Promise.all([jugadoresDe(id), eventosDe(id)]).then(function (r) { LV.evs[id] = r[1]; }); })).then(function () {
      if (DEMO) { iniciarDemoVivo(ids.filter(function (i) { return !(window.TL_ROLES && TL_ROLES.esCaptura(i)); })[0]); return; }
      LV.canal = sb.channel('liga-vivo')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'eventos' }, function (p) { if (idsVivo().indexOf(p.new.partido_id) >= 0) aplicarEvento(p.new); })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'partidos' }, function () { recargarPartidos().then(function () { iniciarVivoSiCambio(); pintar(true); }); })
        .subscribe();
      LV.poll = setInterval(function () { idsVivo().forEach(function (id) { eventosDe(id).then(function (es) { es.forEach(aplicarEvento); }); }); }, 20000);   // respaldo si se corta la conexión en vivo
    });
  }
  function iniciarVivoSiCambio() { var ids = idsVivo().filter(function (id) { return !LV.evs[id]; }); ids.forEach(function (id) { jugadoresDe(id); eventosDe(id).then(function (es) { LV.evs[id] = es; pintar(true); }); }); }
  function detenerVivo() { if (LV.canal && sb) { sb.removeChannel(LV.canal); } LV.canal = null; clearInterval(LV.poll); LV.poll = null; if (LV.demoT) clearInterval(LV.demoT); LV.demoT = null; }
  // En la demostración, el partido en vivo "se va jugando" solo, para ver cómo se actualiza.
  function iniciarDemoVivo(id) {
    if (!id) return;
    var todos = window.DEMO_DATOS.eventos.filter(function (e) { return e.partido_id === id; });
    LV.demo = { id: id, n: Math.floor(todos.length * 0.55) };
    LV.evs[id] = todos.slice(0, LV.demo.n);
    LV.demoT = setInterval(function () {
      if (LV.demo.n >= todos.length) { LV.demo.n = Math.floor(todos.length * 0.4); LV.evs[id] = todos.slice(0, LV.demo.n); pintar(true); return; }
      LV.demo.n++; aplicarEvento(todos[LV.demo.n - 1]);
    }, 1500);
  }
  function marcadorDe(p) {
    if (p.estado !== 'en_vivo' || !LV.evs[p.id]) return { l: p.marcador_local, v: p.marcador_visitante, c: p.cuarto_actual };
    var c = calc(LV.evs[p.id], PJ[p.id] || []);
    return { l: c.lado.local.pts, v: c.lado.visitante.pts, c: c.cuarto };
  }

  /* ---------- rutas ---------- */
  function ruta() {
    var h = (location.hash || '#/vivo').replace(/^#\/?/, ''), partes = h.split('?'), p = partes[0].split('/').filter(Boolean), q = {};
    (partes[1] || '').split('&').forEach(function (kv) { if (kv) { var a = kv.split('='); q[decodeURIComponent(a[0])] = decodeURIComponent(a[1] || ''); } });
    return { p: p.length ? p : ['vivo'], q: q };
  }
  function ir(h) { location.hash = h; }
  function marcarTab(t) { document.querySelectorAll('#tabs a').forEach(function (a) { a.classList.toggle('on', a.dataset.t === t); }); }

  /* ---------- pantallas ---------- */
  function tarjetaPartido(p) {
    var m = marcadorDe(p), vivo = p.estado === 'en_vivo', cerr = p.estado === 'cerrado';
    var gl = cerr && m.l > m.v, gv = cerr && m.v > m.l;
    return '<a class="card" href="#/partido/' + p.id + '"><div class="fila sm muted"><span>' + esc(fecha(p.fecha_hora)) + (p.cancha ? ' · ' + esc(p.cancha) : '') + '</span>' +
      (vivo ? '<span class="badge vivo">EN VIVO · ' + cuartoTxt(m.c || 1) + '</span>' : cerr ? '<span class="badge">FINAL</span>' : '<span class="badge">PRÓXIMO</span>') + '</div>' +
      '<div class="score" style="margin-top:8px"><div class="eq ' + (gl ? 'ganador' : '') + '">' + mark(p.local_id, p.local_color) + esc(p.local_nombre) + '</div>' +
      '<div class="pts">' + (p.estado === 'programado' ? '<span class="vs">vs</span>' : m.l + ' <span class="vs">–</span> ' + m.v) + '</div>' +
      '<div class="eq ' + (gv ? 'ganador' : '') + '">' + esc(p.visitante_nombre) + mark(p.visitante_id, p.visitante_color) + '</div></div></a>';
  }
  function vVivo() {
    var vivos = S.partidos.filter(function (p) { return p.estado === 'en_vivo'; });
    var h = '<h1>Hoy se juega</h1>';
    if (vivos.length) {
      h += '<div class="cols">' + vivos.map(function (p) {
        var c = LV.evs[p.id] ? calc(LV.evs[p.id], PJ[p.id] || []) : null, top = '';
        if (c) { var arr = Object.keys(c.jug).map(function (k) { return c.jug[k]; }).sort(function (a, b) { return b.pts - a.pts; }).slice(0, 3).filter(function (j) { return j.pts > 0; });
          top = arr.length ? '<div class="sm muted" style="margin-top:8px">Goleadores: ' + arr.map(function (j) { return esc(j.nombre.split(' ').pop()) + ' ' + j.pts; }).join(' · ') + '</div>' : ''; }
        return tarjetaPartido(p).replace('</a>', top + '</a>');
      }).join('') + '</div>';
      h += '<p class="sm muted">Se actualiza solo, sin recargar la página.' + (vivos.length > 1 ? ' Hay ' + vivos.length + ' partidos jugándose a la vez.' : '') + '</p>';
    } else {
      var prox = S.partidos.filter(function (p) { return p.estado === 'programado'; }).sort(function (a, b) { return a.fecha_hora < b.fecha_hora ? -1 : 1; });
      h += '<p class="vacio">Ahora no hay ningún partido en juego.<br><span class="sm">Cuando arranque uno, lo ves acá, sin recargar.</span></p>';
      if (prox.length) h += '<h2>Próximo partido</h2>' + tarjetaPartido(prox[0]);
    }
    var ult = S.partidos.filter(function (p) { return p.estado === 'cerrado'; }).slice(-3).reverse();
    if (ult.length) h += '<h2>Últimos resultados</h2><div class="cols">' + ult.map(tarjetaPartido).join('') + '</div>';
    return h;
  }
  function vTabla() {
    var h = '<h1>Tabla de posiciones</h1><div class="scroll"><table><thead><tr><th>#</th><th>Equipo</th><th>PJ</th><th>G</th><th>P</th><th>PF</th><th>PC</th><th>Dif</th><th>Pts</th></tr></thead><tbody>';
    S.tabla.forEach(function (t) {
      h += '<tr><td class="pos">' + t.posicion + '</td><td class="nom"><a href="#/equipo/' + t.equipo_id + '">' + mark(t.equipo_id, t.color_principal) + esc(t.equipo_nombre) + '</a></td><td>' + t.pj + '</td><td>' + t.pg + '</td><td>' + t.pp + '</td><td>' + t.pf + '</td><td>' + t.pc + '</td><td>' + (t.dif > 0 ? '+' : '') + t.dif + '</td><td><b>' + t.pts + '</b></td></tr>';
    });
    h += '</tbody></table></div><p class="sm muted">PJ: jugados · G: ganados · P: perdidos · PF/PC: puntos a favor/en contra · Dif: diferencia.</p>' +
      '<div class="fila-btns"><button class="btn" data-share="tabla" type="button">⤴ Compartir la tabla</button></div>';
    return h;
  }
  /* ---------- categorías: barra de selección para cualquier usuario ---------- */
  function cambiarCat(id) {
    S.catId = id; LS.set('liga_cat', id); LV.evs = {}; CAL.sel = null;
    var pant = $('#pantalla'); pant.innerHTML = '<div class="sk" aria-label="Cargando"><i></i><i></i><i></i></div>';
    cargarCategoria().then(function () { cabecera(); return iniciarVivo(); }).then(function () { pintar(); window.scrollTo(0, 0); });
  }
  function catBar() {
    if (S.cats.length < 2) return '';
    return '<div class="catbar" role="group" aria-label="Categorías">' + S.cats.map(function (c) {
      return '<button type="button" class="chip' + (c.id === S.catId ? ' on' : '') + '" data-cat="' + c.id + '">' + esc(c.nombre) + (S.vivoCats[c.id] ? '<i class="vv" title="Partido en vivo"></i>' : '') + '</button>';
    }).join('') + '</div>';
  }
  function tarjetaX(p) { return '<div class="pw">' + tarjetaPartido(p) + (window.TL_ROLES ? TL_ROLES.extra(p) : '') + '</div>'; }
  function agrupar(arr) {
    var dias = [], mapa = {};
    arr.forEach(function (p) { var d = new Date(p.fecha_hora), k = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); if (!mapa[k]) { mapa[k] = { f: d, ps: [] }; dias.push(mapa[k]); } mapa[k].ps.push(p); });
    return dias.map(function (g) {
      var nf = g.ps.filter(function (p) { return p.nro_fecha; })[0];
      return '<div class="dia"><span>' + esc(g.f.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' })) + '</span><span>' + (nf ? 'Fecha ' + nf.nro_fecha : '') + '</span></div><div class="cols">' + g.ps.map(tarjetaX).join('') + '</div>';
    }).join('');
  }
  /* ---------- calendario del fixture (el mismo para todos los perfiles) ---------- */
  var CAL = { y: null, m: null, sel: null, modo: 'mes' };
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function ymdL(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function verDia(k) { var d = new Date(k + 'T12:00:00'); CAL.sel = k; CAL.y = d.getFullYear(); CAL.m = d.getMonth(); }
  function calendario(lista, opt) {
    opt = opt || {};
    var hoy = ymdL(new Date()), map = {}, fechas = [];
    lista.forEach(function (p) { var k = ymdL(new Date(p.fecha_hora)); (map[k] = map[k] || []).push(p); fechas.push(k); });
    fechas.sort();
    if (!CAL.sel) { verDia(fechas.filter(function (f) { return f >= hoy; })[0] || fechas[fechas.length - 1] || hoy); }
    var mes = CAL.y + '-' + p2(CAL.m + 1);
    if (CAL.sel.slice(0, 7) !== mes) CAL.sel = fechas.filter(function (f) { return f.slice(0, 7) === mes; })[0] || mes + '-01';
    var start = (new Date(CAL.y, CAL.m, 1).getDay() + 6) % 7, dias = new Date(CAL.y, CAL.m + 1, 0).getDate(), cel = '';
    for (var i = 0; i < start; i++) cel += '<span class="cd vacio"></span>';
    for (var d = 1; d <= dias; d++) {
      var k = mes + '-' + p2(d), ps = map[k] || [];
      var pts = ps.slice(0, 3).map(function (p) { return '<i class="pt ' + (p.estado === 'en_vivo' ? 'vivo' : p.estado === 'cerrado' ? 'fin' : 'prox') + '"></i>'; }).join('') + (ps.length > 3 ? '<b>+</b>' : '');
      cel += '<button type="button" class="cd' + (ps.length ? ' tiene' : '') + (k === hoy ? ' hoy' : '') + (k === CAL.sel ? ' sel' : '') + '" data-cal="' + k + '" aria-label="' + d + (ps.length ? ', ' + ps.length + ' partido' + (ps.length > 1 ? 's' : '') : ', sin partidos') + '"><span class="n">' + d + '</span><span class="pts">' + pts + '</span></button>';
    }
    var titulo = new Date(CAL.y, CAL.m, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    var h = '<div class="calwrap"><div class="cal"><div class="calh"><button type="button" data-calnav="-1" aria-label="Mes anterior">‹</button><b>' + esc(titulo) + '</b><button type="button" data-calnav="1" aria-label="Mes siguiente">›</button></div>' +
      '<div class="calw"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div><div class="calg">' + cel + '</div>' +
      '<div class="calf"><button type="button" class="mini" data-calnav="hoy">Hoy</button><span class="leyenda"><i class="pt vivo"></i>En vivo <i class="pt prox"></i>Próximo <i class="pt fin"></i>Final</span></div></div><div>';
    var del = map[CAL.sel] || [];
    h += '<div class="dia"><span>' + esc(new Date(CAL.sel + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })) + '</span><span>' + (del[0] && del[0].nro_fecha ? 'Fecha ' + del[0].nro_fecha : '') + '</span></div>';
    h += del.length ? del.map(opt.card || tarjetaX).join('') : '<p class="vacio" style="padding:22px 8px">No hay partidos este día.</p>';
    if (opt.extra) h += opt.extra(CAL.sel);
    return h + '</div></div>';
  }
  function enlazarCal() {
    document.querySelectorAll('[data-cal]').forEach(function (b) { b.onclick = function () { verDia(b.dataset.cal); pintar(true); }; });
    document.querySelectorAll('[data-calnav]').forEach(function (b) {
      b.onclick = function () {
        var v = b.dataset.calnav;
        if (v === 'hoy') verDia(ymdL(new Date()));
        else { var d = new Date(CAL.y, CAL.m + (+v), 1); CAL.y = d.getFullYear(); CAL.m = d.getMonth(); CAL.sel = 'cambio'; }
        pintar(true);
      };
    });
    document.querySelectorAll('[data-cat]').forEach(function (b) { b.onclick = function () { if (b.dataset.cat !== S.catId) cambiarCat(b.dataset.cat); }; });
    document.querySelectorAll('[data-modo]').forEach(function (b) { b.onclick = function () { CAL.modo = b.dataset.modo; pintar(true); }; });
  }
  function vPartidos(q) {
    var f = q.equipo || '';
    var h = '<h1>Fixture</h1><div class="buscar"><select id="fEquipo" aria-label="Filtrar por equipo"><option value="">Todos los equipos</option>' +
      Object.keys(S.eq).map(function (id) { return '<option value="' + id + '"' + (id === f ? ' selected' : '') + '>' + esc(S.eq[id].nombre) + '</option>'; }).join('') + '</select></div>';
    var lista = S.partidos.filter(function (p) { return !f || p.local_id === f || p.visitante_id === f; });
    var prox = lista.filter(function (p) { return p.estado !== 'cerrado'; }).sort(function (a, b) { return a.fecha_hora < b.fecha_hora ? -1 : 1; });
    var res = lista.filter(function (p) { return p.estado === 'cerrado'; }).sort(function (a, b) { return a.fecha_hora < b.fecha_hora ? 1 : -1; });
    h += '<div class="chips"><button type="button" class="chip' + (CAL.modo === 'mes' ? ' on' : '') + '" data-modo="mes">📅 Calendario</button><button type="button" class="chip' + (CAL.modo === 'lista' ? ' on' : '') + '" data-modo="lista">☰ Lista</button></div>';
    if (!lista.length) return h + '<p class="vacio">Todavía no hay partidos cargados.</p>';
    if (CAL.modo === 'mes') return h + calendario(lista);
    if (prox.length) h += '<h2>Próximos y en juego</h2>' + agrupar(prox);
    if (res.length) h += '<h2>Resultados</h2>' + agrupar(res);
    return h;
  }
  function tablaBox(equipoId, c, titulo, color) {
    var rows = Object.keys(c.jug).map(function (k) { return c.jug[k]; }).filter(function (j) { return j.equipo_id === equipoId && (j.pts || j.reb || j.ast || j.rob || j.per || j.faltas); }).sort(function (a, b) { return b.pts - a.pts; });
    if (!rows.length) return '';
    return '<h2>' + dot(color) + esc(titulo) + '</h2><div class="scroll"><table><thead><tr><th>Jugador</th><th>Pts</th><th>Reb</th><th>Ast</th><th>Rob</th><th>Per</th><th>F</th></tr></thead><tbody>' +
      rows.map(function (j) { return '<tr><td class="nom"><a href="#/jugador/' + j.id + '"><span class="muted">#' + j.camiseta + '</span> ' + esc(j.nombre) + '</a></td><td><b>' + j.pts + '</b></td><td>' + j.reb + '</td><td>' + j.ast + '</td><td>' + j.rob + '</td><td>' + j.per + '</td><td>' + j.faltas + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function vPartido(id) {
    var p = S.partidos.filter(function (x) { return x.id === id; })[0];
    if (!p) return '<p class="vacio">No encontré ese partido.</p>';
    var pj = PJ[id], evs = LV.evs[id] || (SELLOG['ev' + id]);
    if (!pj || !evs) return '<p class="vacio">Cargando el partido…</p>';
    var c = calc(evs, pj), vivo = p.estado === 'en_vivo', cerr = p.estado === 'cerrado';
    var ml = cerr || !vivo ? p.marcador_local : c.lado.local.pts, mv = cerr || !vivo ? p.marcador_visitante : c.lado.visitante.pts;
    if (vivo) { ml = c.lado.local.pts; mv = c.lado.visitante.pts; }
    var h = '<div class="card grande"><div class="fila sm muted"><span>' + esc(fecha(p.fecha_hora)) + (p.cancha ? ' · ' + esc(p.cancha) : '') + '</span>' +
      (vivo ? '<span class="badge vivo">EN VIVO</span>' : cerr ? '<span class="badge">FINAL</span>' : '<span class="badge">PRÓXIMO</span>') + '</div>' +
      '<div class="score" style="margin-top:10px"><div class="eq">' + mark(p.local_id, p.local_color) + esc(p.local_nombre) + '</div><div class="pts">' + (p.estado === 'programado' ? '<span class="vs">vs</span>' : ml + ' <span class="vs">–</span> ' + mv) + '</div><div class="eq">' + esc(p.visitante_nombre) + dot(p.visitante_color) + '</div></div>';
    if (vivo) h += '<div class="muted sm" style="text-align:center;margin-top:8px">' + cuartoTxt(c.cuarto) + (c.reloj != null ? ' · último reloj marcado ' + mmss(c.reloj) : '') + '</div>';
    h += '</div>';
    if (p.estado !== 'programado') {
      var maxQ = Math.max(4, c.cuarto), cab = '', fl = '', fv = '';
      for (var q = 1; q <= maxQ; q++) cab += '<th>' + cuartoTxt(q) + '</th>';
      h += '<h2>Parciales</h2><div class="scroll"><table><thead><tr><th>Equipo</th>' + cab + '<th>Total</th></tr></thead><tbody>';
      ['local', 'visitante'].forEach(function (L) {
        h += '<tr><td class="nom">' + mark(L === 'local' ? p.local_id : p.visitante_id, L === 'local' ? p.local_color : p.visitante_color) + esc(L === 'local' ? p.local_nombre : p.visitante_nombre) + '</td>';
        for (var q2 = 1; q2 <= maxQ; q2++) h += '<td>' + (c.parc[L][q2] || 0) + '</td>';
        h += '<td><b>' + c.lado[L].pts + '</b></td></tr>';
      });
      h += '</tbody></table></div>';
      h += '<div class="kpis"><div class="kpi"><b>' + (c.lado.local.faltas[c.cuarto] || 0) + '</b><span>Faltas ' + esc(p.local_nombre) + ' ' + cuartoTxt(c.cuarto) + '</span></div><div class="kpi"><b>' + (c.lado.visitante.faltas[c.cuarto] || 0) + '</b><span>Faltas ' + esc(p.visitante_nombre) + ' ' + cuartoTxt(c.cuarto) + '</span></div><div class="kpi"><b>' + c.lado.local.tm + '</b><span>T. muertos ' + esc(p.local_nombre) + '</span></div><div class="kpi"><b>' + c.lado.visitante.tm + '</b><span>T. muertos ' + esc(p.visitante_nombre) + '</span></div></div>';
      h += tablaBox(p.local_id, c, p.local_nombre, p.local_color) + tablaBox(p.visitante_id, c, p.visitante_nombre, p.visitante_color);
      var feed = c.v.filter(function (e) { return ['QUINTETO', 'RELOJ', 'E1', 'E2', 'E3', 'CUARTO_INICIO'].indexOf(e.tipo) < 0; }).slice(-12).reverse();
      h += '<h2>Últimas jugadas</h2><ul class="feed">' + feed.map(function (e, i) { return '<li' + (i === 0 && vivo ? ' class="nuevo"' : '') + '><time>' + cuartoTxt(e.cuarto || 1) + ' ' + mmss(e.reloj_seg) + '</time><span>' + esc(descEvento(e, c.jug, p)) + '</span></li>'; }).join('') + '</ul>';
    } else {
      h += '<p class="vacio">El partido todavía no empezó.</p>';
    }
    if (p.arbitros && p.arbitros.length) h += '<p class="sm muted">Árbitros: ' + esc(p.arbitros.join(', ')) + (p.cronometrista ? ' · Cronometrista: ' + esc(p.cronometrista) : '') + '</p>';
    h += '<div class="fila-btns"><button class="btn p" data-share="partido:' + id + '" type="button">⤴ Compartir el partido</button></div>';
    return h;
  }
  function vJugadores(q) {
    var orden = q.orden || 'pts_prom', buscar = (q.q || '').toLowerCase();
    var campos = [['pts_prom', 'Puntos'], ['reb_prom', 'Rebotes'], ['ast_prom', 'Asistencias'], ['rob_prom', 'Robos'], ['min_prom', 'Minutos'], ['altura_cm', 'Altura']];
    var porId = {}; S.statsJ.forEach(function (s) { porId[s.jugador_id] = s; });
    var lista = Object.keys(S.jug).map(function (id) { var j = S.jug[id], s = porId[id] || {}; return { id: id, nombre: j.nombre_completo, equipo_id: j.equipo_id, altura: j.altura_cm, s: s }; })
      .filter(function (x) { return !buscar || x.nombre.toLowerCase().indexOf(buscar) >= 0; })
      .sort(function (a, b) { var va = orden === 'altura_cm' ? a.altura : (a.s[orden] || 0), vb = orden === 'altura_cm' ? b.altura : (b.s[orden] || 0); return vb - va; });
    var h = '<h1>Jugadores</h1><div class="buscar"><input id="bJug" type="search" placeholder="Buscá a un jugador" value="' + esc(q.q || '') + '" aria-label="Buscar jugador"></div><div class="chips">' +
      campos.map(function (c) { return '<button type="button" class="chip' + (c[0] === orden ? ' on' : '') + '" data-orden="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>' +
      '<div class="scroll"><table><thead><tr><th>Jugador</th><th>PJ</th><th>Pts</th><th>Reb</th><th>Ast</th><th>Rob</th></tr></thead><tbody>';
    lista.forEach(function (x) {
      h += '<tr><td class="nom"><a href="#/jugador/' + x.id + '">' + dot(eqColor(x.equipo_id)) + esc(x.nombre) + '<br><span class="muted sm">' + esc(eqNombre(x.equipo_id)) + (x.altura ? ' · ' + x.altura + ' cm' : '') + '</span></a></td><td>' + (x.s.pj || 0) + '</td><td>' + n1(x.s.pts_prom) + '</td><td>' + n1(x.s.reb_prom) + '</td><td>' + n1(x.s.ast_prom) + '</td><td>' + n1(x.s.rob_prom) + '</td></tr>';
    });
    h += '</tbody></table></div><p class="sm muted">Promedios por partido jugado. Tocá un jugador para ver su detalle.</p>';
    return h;
  }
  function vJugador(id) {
    var j = S.jug[id]; if (!j) return '<p class="vacio">No encontré ese jugador.</p>';
    var s = S.statsJ.filter(function (x) { return x.jugador_id === id; })[0] || {};
    var h = '<h1>' + dot(eqColor(j.equipo_id)) + esc(j.nombre_completo) + '</h1><p class="muted" style="margin-top:-6px"><a href="#/equipo/' + j.equipo_id + '">' + esc(eqNombre(j.equipo_id)) + '</a>' + (j.altura_cm ? ' · ' + j.altura_cm + ' cm' : '') + (j.camiseta_habitual != null ? ' · camiseta ' + j.camiseta_habitual : '') + '</p>';
    h += '<div class="kpis"><div class="kpi"><b>' + n1(s.pts_prom) + '</b><span>Puntos</span></div><div class="kpi"><b>' + n1(s.reb_prom) + '</b><span>Rebotes</span></div><div class="kpi"><b>' + n1(s.ast_prom) + '</b><span>Asist.</span></div><div class="kpi"><b>' + n1(s.rob_prom) + '</b><span>Robos</span></div></div>';
    h += '<div class="kpis"><div class="kpi"><b>' + (s.pj || 0) + '</b><span>Partidos</span></div><div class="kpi"><b>' + n1(s.min_prom) + '</b><span>Minutos</span></div><div class="kpi"><b>' + pct(s.t3_conv, s.t3_int) + '</b><span>Triples</span></div><div class="kpi"><b>' + pct(s.tl_conv, s.tl_int) + '</b><span>Libres</span></div></div>';
    h += '<div class="kpis"><div class="kpi"><b>' + (s.pts || 0) + '</b><span>Pts totales</span></div><div class="kpi"><b>' + (s.pts_max || 0) + '</b><span>Máx. partido</span></div><div class="kpi"><b>' + n1(s.faltas_prom) + '</b><span>Faltas</span></div><div class="kpi"><b>' + n1(s.per_prom) + '</b><span>Pérdidas</span></div></div>';
    h += '<div class="fila-btns"><button class="btn p" data-share="jugador:' + id + '" type="button">⤴ Compartir</button><a class="btn" href="#/comparar?tipo=j&a=' + id + '">⚖️ Comparar</a></div>';
    h += '<h2>Partido a partido</h2><div id="logJug"><p class="vacio">Cargando…</p></div>';
    return h;
  }
  function pintarLog(id, filas) {
    var el = $('#logJug'); if (!el) return;
    var porP = {}; S.partidos.forEach(function (p) { porP[p.id] = p; });
    filas = filas.filter(function (f) { return f.jugo && porP[f.partido_id] && porP[f.partido_id].estado === 'cerrado'; })
      .sort(function (a, b) { return porP[a.partido_id].fecha_hora < porP[b.partido_id].fecha_hora ? 1 : -1; });
    if (!filas.length) { el.innerHTML = '<p class="vacio">Todavía no jugó partidos cerrados.</p>'; return; }
    el.innerHTML = '<div class="scroll"><table><thead><tr><th>Partido</th><th>Min</th><th>Pts</th><th>Reb</th><th>Ast</th><th>F</th></tr></thead><tbody>' + filas.map(function (f) {
      var p = porP[f.partido_id], rival = f.equipo_id === p.local_id ? p.visitante_nombre : p.local_nombre;
      return '<tr><td class="nom"><a href="#/partido/' + p.id + '">vs ' + esc(rival) + '<br><span class="muted sm">' + esc(fecha(p.fecha_hora)) + ' · camiseta #' + f.camiseta + '</span></a></td><td>' + n1(f.min) + '</td><td><b>' + f.pts + '</b></td><td>' + f.reb + '</td><td>' + f.ast + '</td><td>' + f.faltas + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  function vEquipos() {
    var h = '<h1>Equipos</h1><div class="cols">';
    S.tabla.forEach(function (t) { h += '<a class="card fila" href="#/equipo/' + t.equipo_id + '"><span>' + mark(t.equipo_id, t.color_principal) + '<b>' + esc(t.equipo_nombre) + '</b></span><span class="muted sm">' + t.posicion + '.º · ' + t.pg + 'G ' + t.pp + 'P</span></a>'; });
    return h + '</div>';
  }
  function vEquipo(id) {
    var e = S.eq[id]; if (!e) return '<p class="vacio">No encontré ese equipo.</p>';
    var t = S.tabla.filter(function (x) { return x.equipo_id === id; })[0] || {}, s = S.statsE.filter(function (x) { return x.equipo_id === id; })[0] || {};
    var h = '<h1>' + mark(e.id, e.color_principal, 'lg') + esc(e.nombre) + '</h1><p class="muted" style="margin-top:-6px">' + (t.posicion ? t.posicion + '.º en la tabla · ' : '') + (t.pg || 0) + ' ganados, ' + (t.pp || 0) + ' perdidos</p>';
    h += '<div class="kpis"><div class="kpi"><b>' + n1(s.pts_prom) + '</b><span>Puntos</span></div><div class="kpi"><b>' + n1(s.reb_prom) + '</b><span>Rebotes</span></div><div class="kpi"><b>' + n1(s.ast_prom) + '</b><span>Asist.</span></div><div class="kpi"><b>' + n1(s.rob_prom) + '</b><span>Robos</span></div></div>';
    h += '<div class="fila-btns"><button class="btn p" data-share="equipo:' + id + '" type="button">⤴ Compartir</button><a class="btn" href="#/comparar?tipo=e&a=' + id + '">⚖️ Comparar</a><a class="btn" href="#/partidos?equipo=' + id + '">📅 Sus partidos</a></div>';
    var plantel = Object.keys(S.jug).map(function (k) { return S.jug[k]; }).filter(function (j) { return j.equipo_id === id; });
    var porId = {}; S.statsJ.forEach(function (x) { porId[x.jugador_id] = x; });
    plantel.sort(function (a, b) { return ((porId[b.id] || {}).pts_prom || 0) - ((porId[a.id] || {}).pts_prom || 0); });
    h += '<h2>Plantel</h2><div class="scroll"><table><thead><tr><th>Jugador</th><th>Alt.</th><th>Pts</th><th>Reb</th><th>Ast</th></tr></thead><tbody>' + plantel.map(function (j) { var x = porId[j.id] || {};
      return '<tr><td class="nom"><a href="#/jugador/' + j.id + '"><span class="muted">#' + n0(j.camiseta_habitual) + '</span> ' + esc(j.nombre_completo) + '</a></td><td>' + (j.altura_cm || '–') + '</td><td>' + n1(x.pts_prom) + '</td><td>' + n1(x.reb_prom) + '</td><td>' + n1(x.ast_prom) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    return h;
  }
  function barras(filas, nA, nB, cA, cB) {
    return filas.map(function (f) {
      var a = Number(f[1]) || 0, b = Number(f[2]) || 0, max = Math.max(Math.abs(a), Math.abs(b), 0.0001), menosMejor = f[3];
      var gana = a === b ? 0 : (menosMejor ? (a < b ? 1 : 2) : (a > b ? 1 : 2));
      return '<div class="barra"><div class="lado a"><b class="' + (gana === 1 ? 'mejor' : '') + '">' + f[4](a) + '</b><div class="b" style="width:' + Math.round(100 * Math.abs(a) / max * 0.6) + '%;background:' + esc(cA) + '"></div></div><div class="et">' + f[0] + '</div><div class="lado"><div class="b" style="width:' + Math.round(100 * Math.abs(b) / max * 0.6) + '%;background:' + esc(cB) + '"></div><b class="' + (gana === 2 ? 'mejor' : '') + '">' + f[4](b) + '</b></div></div>';
    }).join('');
  }
  function vComparar(q) {
    var tipo = q.tipo === 'e' ? 'e' : 'j', a = q.a || '', b = q.b || '';
    var h = '<h1>Comparar</h1><div class="chips"><button type="button" class="chip' + (tipo === 'j' ? ' on' : '') + '" data-tipo="j">Jugadores</button><button type="button" class="chip' + (tipo === 'e' ? ' on' : '') + '" data-tipo="e">Equipos</button></div>';
    var opts = tipo === 'j' ? Object.keys(S.jug).map(function (id) { return [id, S.jug[id].nombre_completo + ' (' + eqNombre(S.jug[id].equipo_id) + ')']; }).sort(function (x, y) { return x[1] < y[1] ? -1 : 1; })
                            : Object.keys(S.eq).map(function (id) { return [id, S.eq[id].nombre]; });
    function sl(idn, val) { return '<select id="' + idn + '" aria-label="Elegir"><option value="">Elegir…</option>' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === val ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; }
    h += '<div class="sel2">' + sl('cmpA', a) + sl('cmpB', b) + '</div>';
    if (a && b && a !== b) {
      var fn1 = function (v) { return n1(v); }, fn0 = function (v) { return n0(v); };
      if (tipo === 'j') {
        var sa = S.statsJ.filter(function (x) { return x.jugador_id === a; })[0] || {}, sb2 = S.statsJ.filter(function (x) { return x.jugador_id === b; })[0] || {};
        var ja = S.jug[a], jb = S.jug[b];
        h += '<div class="barra" style="margin-top:14px"><div class="lado a"><b>' + esc(ja.nombre_completo) + '</b></div><div class="et"></div><div class="lado"><b>' + esc(jb.nombre_completo) + '</b></div></div>';
        h += barras([['Puntos', sa.pts_prom, sb2.pts_prom, false, fn1], ['Rebotes', sa.reb_prom, sb2.reb_prom, false, fn1], ['Asistencias', sa.ast_prom, sb2.ast_prom, false, fn1], ['Robos', sa.rob_prom, sb2.rob_prom, false, fn1],
          ['Pérdidas<br>(menos es mejor)', sa.per_prom, sb2.per_prom, true, fn1], ['Faltas<br>(menos es mejor)', sa.faltas_prom, sb2.faltas_prom, true, fn1], ['Minutos', sa.min_prom, sb2.min_prom, false, fn1], ['Altura (cm)', ja.altura_cm, jb.altura_cm, false, fn0]], ja.nombre_completo, jb.nombre_completo, eqColor(ja.equipo_id), eqColor(jb.equipo_id));
      } else {
        var ea = S.statsE.filter(function (x) { return x.equipo_id === a; })[0] || {}, eb = S.statsE.filter(function (x) { return x.equipo_id === b; })[0] || {};
        var ta = S.tabla.filter(function (x) { return x.equipo_id === a; })[0] || {}, tb = S.tabla.filter(function (x) { return x.equipo_id === b; })[0] || {};
        h += '<div class="barra" style="margin-top:14px"><div class="lado a"><b>' + mark(a, eqColor(a)) + esc(eqNombre(a)) + '</b></div><div class="et"></div><div class="lado"><b>' + esc(eqNombre(b)) + mark(b, eqColor(b)) + '</b></div></div>';
        h += barras([['Puntos', ea.pts_prom, eb.pts_prom, false, fn1], ['Rebotes', ea.reb_prom, eb.reb_prom, false, fn1], ['Asistencias', ea.ast_prom, eb.ast_prom, false, fn1], ['Robos', ea.rob_prom, eb.rob_prom, false, fn1],
          ['Pérdidas<br>(menos es mejor)', ea.per_prom, eb.per_prom, true, fn1], ['Faltas<br>(menos es mejor)', ea.faltas_prom, eb.faltas_prom, true, fn1], ['Triples %', ea.t3_pct, eb.t3_pct, false, fn0], ['Libres %', ea.tl_pct, eb.tl_pct, false, fn0],
          ['Altura media (cm)', ea.altura_prom, eb.altura_prom, false, fn1], ['Dif. de puntos', ta.dif, tb.dif, false, fn0]], eqNombre(a), eqNombre(b), eqColor(a), eqColor(b));
      }
      h += '<div class="fila-btns"><button class="btn p" data-share="comparar" type="button">⤴ Compartir la comparación</button></div>';
    } else h += '<p class="vacio">Elegí dos para compararlos.</p>';
    return h;
  }

  /* ---------- pintar y enlazar ---------- */
  var ultimaRuta = '';
  function pintar(suave) {
    var r = ruta(), p = r.p, h = '', pant = $('#pantalla'), tab = p[0] === 'partido' ? 'vivo' : p[0] === 'jugador' ? 'jugadores' : (p[0] === 'equipo' || p[0] === 'equipos') ? 'tabla' : p[0];
    if (window.TL_ROLES) tab = TL_ROLES.tab(p[0], tab);
    document.body.classList.toggle('inicio', !S.liga);
    marcarTab(S.liga ? tab : '');
    if (!S.liga) { pant.innerHTML = vInicio(); enlazarInicio(); window.scrollTo(0, 0); return; }
    if (!S.cargado) return;
    var rh = window.TL_ROLES ? TL_ROLES.vista(p, r) : null;
    if (rh != null) h = rh; else switch (p[0]) {
      case 'tabla': h = vTabla(); break;
      case 'partidos': h = vPartidos(r.q); break;
      case 'partido': h = vPartido(p[1]); break;
      case 'jugadores': h = vJugadores(r.q); break;
      case 'jugador': h = vJugador(p[1]); break;
      case 'equipos': h = vEquipos(); break;
      case 'equipo': h = vEquipo(p[1]); break;
      case 'comparar': h = vComparar(r.q); break;
      default: h = vVivo();
    }
    if (rh == null && S.cats.length > 1 && /^(vivo|tabla|partidos|jugadores|comparar|equipos)$/.test(p[0])) h = catBar() + h;
    var y = window.scrollY;
    pant.innerHTML = h;
    if (!suave) { pant.classList.remove('fade'); void pant.offsetWidth; pant.classList.add('fade'); }
    if (suave) window.scrollTo(0, y); else if (ultimaRuta !== location.hash) { window.scrollTo(0, 0); }
    ultimaRuta = location.hash;
    enlazar(r);
    if (window.TL_ROLES) TL_ROLES.despues(r);
  }
  function cambiarQuery(r, cambios) {
    var q = Object.assign({}, r.q, cambios), s = Object.keys(q).filter(function (k) { return q[k] !== '' && q[k] != null; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); }).join('&');
    history.replaceState(null, '', '#/' + r.p.join('/') + (s ? '?' + s : '')); pintar(true);
  }
  function enlazar(r) {
    enlazarCal();
    document.querySelectorAll('[data-orden]').forEach(function (b) { b.onclick = function () { cambiarQuery(r, { orden: b.dataset.orden }); }; });
    document.querySelectorAll('[data-tipo]').forEach(function (b) { b.onclick = function () { cambiarQuery(r, { tipo: b.dataset.tipo, a: '', b: '' }); }; });
    var fe = $('#fEquipo'); if (fe) fe.onchange = function () { cambiarQuery(r, { equipo: fe.value }); };
    var bj = $('#bJug'); if (bj) { bj.oninput = function () { var pos = bj.selectionStart; r.q.q = bj.value; history.replaceState(null, '', '#/jugadores?' + (bj.value ? 'q=' + encodeURIComponent(bj.value) : '') + (r.q.orden ? (bj.value ? '&' : '') + 'orden=' + r.q.orden : '')); pintar(true); var nb = $('#bJug'); if (nb) { nb.focus(); nb.setSelectionRange(pos, pos); } }; }
    var ca = $('#cmpA'), cb = $('#cmpB'); if (ca) ca.onchange = function () { cambiarQuery(r, { a: ca.value }); }; if (cb) cb.onchange = function () { cambiarQuery(r, { b: cb.value }); };
    document.querySelectorAll('[data-share]').forEach(function (b) { b.onclick = function () { compartirDe(b.dataset.share); }; });
    if (r.p[0] === 'jugador') logJugador(r.p[1]).then(function (f) { pintarLog(r.p[1], f); });
    if (r.p[0] === 'partido') cargarPartido(r.p[1]);
  }
  function cargarPartido(id) {
    var p = S.partidos.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    if (PJ[id] && (LV.evs[id] || SELLOG['ev' + id])) return;
    Promise.all([jugadoresDe(id), LV.evs[id] ? Promise.resolve(LV.evs[id]) : eventosDe(id)]).then(function (r) {
      if (p.estado !== 'en_vivo') SELLOG['ev' + id] = r[1]; else if (!LV.evs[id]) LV.evs[id] = r[1];
      pintar(true);
    });
  }
  function compartirDe(que) {
    var liga = $('#ligaNombre').textContent, a = que.split(':'), id = a[1];
    if (a[0] === 'tabla') { compartir('Tabla · ' + liga, 'Tabla de posiciones de ' + liga + ': ' + S.tabla.map(function (t) { return t.posicion + '. ' + t.equipo_nombre + ' (' + t.pts + ')'; }).join(', ')); }
    else if (a[0] === 'jugador') { var s = S.statsJ.filter(function (x) { return x.jugador_id === id; })[0] || {}, j = S.jug[id]; compartir(j.nombre_completo, j.nombre_completo + ' (' + eqNombre(j.equipo_id) + '): ' + n1(s.pts_prom) + ' pts, ' + n1(s.reb_prom) + ' reb, ' + n1(s.ast_prom) + ' ast por partido en ' + liga + '.'); }
    else if (a[0] === 'equipo') { var t = S.tabla.filter(function (x) { return x.equipo_id === id; })[0] || {}; compartir(eqNombre(id), eqNombre(id) + ': ' + (t.posicion || '-') + '.º en ' + liga + ', ' + (t.pg || 0) + ' ganados y ' + (t.pp || 0) + ' perdidos.'); }
    else if (a[0] === 'partido') { var p = S.partidos.filter(function (x) { return x.id === id; })[0], m = marcadorDe(p); compartir(p.local_nombre + ' vs ' + p.visitante_nombre, p.local_nombre + ' ' + m.l + ' - ' + m.v + ' ' + p.visitante_nombre + (p.estado === 'en_vivo' ? ' (EN VIVO)' : '') + ' · ' + liga); }
    else compartir(liga, 'Mirá esta comparación en ' + liga);
  }

  /* ---------- arranque ---------- */
  function aviso(t) {
    var a = $('#aviso'); if (!t || LS.get('aviso_x') === t) { a.hidden = true; return; }
    a.innerHTML = '<span>' + esc(t) + '</span><button type="button" aria-label="Cerrar aviso">✕</button>'; a.hidden = false;
    a.querySelector('button').onclick = function () { a.hidden = true; LS.set('aviso_x', t); };
  }
  function iniciales(n) { var w = String(n).split(/\s+/).filter(function (x) { return x.length > 2 && !/^(del|las|los|liga)$/i.test(x); }); return (w.slice(0, 2).map(function (x) { return x[0]; }).join('') || String(n).slice(0, 2)).toUpperCase(); }
  function logoHTML(l, cls) { return l && l.logo_url ? '<img class="' + cls + '" src="' + esc(l.logo_url) + '" alt="" onerror="this.outerHTML=\'<span class=&quot;' + cls + '&quot;>' + esc(iniciales(l.nombre)) + '</span>\'">' : '<span class="' + cls + '">' + esc(iniciales(l ? l.nombre : '')) + '</span>'; }
  function cabecera() {
    var l = S.liga, c = S.cats.filter(function (x) { return x.id === S.catId; })[0] || {};
    $('#logoLiga').outerHTML = l ? logoHTML(l, 'logoLiga').replace('class="logoLiga"', 'class="logoLiga" id="logoLiga"').replace('<span class="logoLiga"', '<span id="logoLiga" class="logoLiga"') : '<img id="logoLiga" class="logoLiga" src="logo.svg" alt="" style="background:none;border:0;padding:0">';
    $('#ligaNombre').textContent = l ? l.nombre : 'TU LIGA';
    $('#catNombre').textContent = l ? (c.nombre ? c.nombre + ' · ' + c.temporada : 'Sin categorías') : 'Tu liga, al día';
    document.title = (l ? l.nombre + ' · ' : '') + (CFG.nombreApp || 'TU LIGA');
    var cs = $('#catSel'); cs.hidden = true;
    cs.innerHTML = S.cats.map(function (x) { return '<option value="' + x.id + '"' + (x.id === S.catId ? ' selected' : '') + '>' + esc(x.nombre) + '</option>'; }).join('');

    $('#cambiarLiga').hidden = !l || !!CFG.ligaFija;
    if (window.TL_ROLES) TL_ROLES.cabecera();
  }
  /* ---------- pantalla inicial: elegir la liga ---------- */
  function vInicio() {
    var ult = LS.get('liga_slug'), orden = S.ligas.slice().sort(function (a, b) { return (b.slug === ult) - (a.slug === ult); });
    var h = '<div class="hero"><img src="logo.svg" alt="" width="84" height="84"><h1>TU LIGA</h1><p>Tu liga, al día: tabla, estadísticas y partidos en vivo.</p></div>';
    if (!orden.length) return h + '<p class="vacio">Todavía no hay ligas cargadas.</p>';
    h += '<div class="etq">Elegí tu liga</div><div class="ligas">' + orden.map(function (l) {
      return '<a class="liga' + (l.slug === ult ? ' ultima' : '') + '" href="?liga=' + encodeURIComponent(l.slug) + '#/vivo" data-liga="' + esc(l.slug) + '">' + logoHTML(l, 'logoLiga') +
        '<span><b>' + esc(l.nombre) + '</b><small>' + l.categorias + (l.categorias === 1 ? ' categoría' : ' categorías') + (l.en_vivo > 0 ? ' · <span style="color:var(--vivo)">● ' + l.en_vivo + ' en vivo</span>' : '') + (l.slug === ult ? ' · la última que viste' : '') + '</small></span><span class="ir">›</span></a>';
    }).join('') + '</div>';
    return h;
  }
  function enlazarInicio() { document.querySelectorAll('[data-liga]').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); entrarLiga(a.dataset.liga); }; }); }
  function entrarLiga(slug, conservar) {
    var l = S.ligas.filter(function (x) { return x.slug === slug; })[0]; if (!l) return Promise.resolve();
    detenerVivo(); vaciarLiga(); S.liga = l; LS.set('liga_slug', slug);
    var u = new URL(location.href); u.searchParams.set('liga', slug); if (!conservar) u.hash = '#/vivo'; history.replaceState(null, '', u.toString());
    cabecera(); $('#pantalla').innerHTML = '<div class="sk" aria-label="Cargando"><i></i><i></i><i></i></div>'; document.body.classList.remove('inicio');
    return cargar().then(function () { cabecera(); return iniciarVivo(); }).then(function () {
      if (!conservar) { if (!idsVivo().length && S.cats.length) location.hash = '#/tabla'; else location.hash = '#/vivo'; }
      pintar();
    }).catch(function (e) { $('#pantalla').innerHTML = '<p class="vacio">No pude cargar la liga.<br><span class="sm">' + esc(e.message || e) + '</span></p>'; });
  }
  function salirLiga() {
    detenerVivo(); vaciarLiga(); S.liga = null;
    var u = new URL(location.href); u.searchParams.delete('liga'); u.hash = '#/inicio'; history.replaceState(null, '', u.toString());
    cabecera(); pintar();
  }
  function aplicarTema(t) { document.documentElement.setAttribute('data-tema', t === 'claro' ? 'claro' : 'oscuro'); }
  function iniciar() {
    aplicarTema(new URLSearchParams(location.search).get('tema') || LS.get('liga_tema') || 'oscuro');
    $('#btnTema').onclick = function () { var nuevo = document.documentElement.getAttribute('data-tema') === 'claro' ? 'oscuro' : 'claro'; aplicarTema(nuevo); LS.set('liga_tema', nuevo); };
    function medir() { var h = document.querySelector('.top'); if (h) document.documentElement.style.setProperty('--hh', h.offsetHeight + 'px'); }
    medir(); window.addEventListener('resize', medir);
    window.addEventListener('scroll', function () { document.body.classList.toggle('scrolled', window.scrollY > 6); }, { passive: true });
    window.addEventListener('hashchange', function () { if (ruta().p[0] === 'inicio' && S.liga) { salirLiga(); return; } pintar(); });
    $('#btnCompartir').onclick = function () { compartir($('#ligaNombre').textContent, 'Mirá la liga ' + $('#ligaNombre').textContent + ' en TU LIGA'); };
    $('#cambiarLiga').onclick = function (e) { e.preventDefault(); salirLiga(); };
    window.addEventListener('error', function (e) { aviso('Error: ' + (e.message || e)); });
    if (DEMO) aviso('Prototipo · datos inventados · al recargar se pierde todo');
    /* Supabase: la sesión vive solo en esta pestaña y usa un candado propio (el de la librería se cuelga al abrir el archivo con doble clic) */
    var listo = DEMO ? Promise.resolve() : cargarScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js').then(function () { sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { storage: window.sessionStorage, storageKey: 'tl-auth', detectSessionInUrl: false, lock: function (n, t, f) { return f(); } } }); });
    listo.then(function () { return sel('vista_ligas', {}, 'nombre'); }).then(function (ligas) {
      S.ligas = ligas; cabecera();
      var slug = CFG.ligaFija || new URLSearchParams(location.search).get('liga');
      if (slug && ligas.some(function (l) { return l.slug === slug; })) return entrarLiga(slug, ruta().p[0] !== 'inicio' && !!location.hash && location.hash !== '#/vivo');
      if (ruta().p[0] !== 'inicio') history.replaceState(null, '', location.pathname + location.search + '#/inicio');
      pintar();
    }).catch(function (e) { $('#pantalla').innerHTML = '<p class="vacio">No pude cargar las ligas.<br><span class="sm">' + esc(e.message || e) + '</span></p>'; });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.liga && S.cargado && !DEMO) { recargarPartidos().then(function () { iniciarVivoSiCambio(); pintar(true); }); } });
    if ('serviceWorker' in navigator && /^https:|localhost/.test(location.protocol + location.hostname)) navigator.serviceWorker.register('sw.js').catch(function () { /* sin service worker */ });
  }
  window.TL = {
    sb: function () { return sb; }, S: S, DEMO: DEMO, esc: esc, dot: dot, mark: mark, calendario: calendario, CAL: CAL, verDia: verDia,
    recargarTodo: function () { return cargar().then(function () { cabecera(); return iniciarVivo(); }).then(function () { pintar(true); }); }, toast: toast, fecha: fecha, pintar: pintar,
    recargar: function () { return cargarCategoria().then(function () { pintar(true); }); },
    vivo: function (id, evs, pj) { if (pj) PJ[id] = pj; LV.evs[id] = evs; delete SELLOG['ev' + id]; },
    limpiar: function (id) { delete PJ[id]; delete LV.evs[id]; delete SELLOG['ev' + id]; },
    eqColor: eqColor, eqNombre: eqNombre
  };
  iniciar();
})();
