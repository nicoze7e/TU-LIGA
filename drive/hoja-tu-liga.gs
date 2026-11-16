/**
 * TU LIGA · Hoja administrativa de la liga (Google Apps Script, va DENTRO de la hoja de cálculo)
 *
 * Concepto: TU LIGA (la plataforma) es la base de toda la información. Esta hoja es el espejo administrativo y PRIVADO:
 *   IDA     TU LIGA → hoja:  plantel con datos de regularidad, fixture oficial, resultados, tabla, estadísticas y jugadas.
 *   VUELTA  hoja → TU LIGA:  lo que se carga en las pestañas "Cargar …" (plantel, fixture y resultados) se valida y se aplica.
 *
 * Cómo se usa: menú "🏀 TU LIGA" que aparece arriba en la hoja. Guía completa en GUIA-DRIVE.md.
 * Seguridad: la clave de Drive de la liga se guarda en las propiedades del script (nunca en el código ni en las celdas).
 *            Es una clave propia de esta hoja, revocable. No es la clave secreta de Supabase.
 * Quién manda: TU LIGA. Las pestañas Plantel, Equipos, Fixture, Resultados, Tabla, Estadísticas y Jugadas se reescriben en
 *              cada actualización: no las edites a mano. Para cambiar datos desde acá, usá las pestañas "Cargar …".
 */

const CONFIG = {
  SUPABASE_URL: 'https://czlfrjgvcndqoviuubwz.supabase.co',
  CLAVE_PUBLICA: 'sb_publishable_YjpVLjtcdFyTh44yE_IEQw_YH_KnaTu',   // pública: segura de compartir
  LIGA: 'mar-y-sierra',                                              // slug de la liga de esta hoja
  ZONA: 'America/Argentina/Buenos_Aires'
};

const TIPOS = {
  P1: 'Libre convertido', P2: 'Doble', P3: 'Triple', E1: 'Libre errado', E2: 'Doble errado', E3: 'Triple errado',
  REB: 'Rebote', AST: 'Asistencia', ROB: 'Robo', PER: 'Pérdida', FALTA: 'Falta', TM: 'Tiempo muerto',
  QUINTETO: 'Quinteto inicial', CAMBIO: 'Cambio', CUARTO_INICIO: 'Inicio de cuarto', CUARTO_FIN: 'Fin de cuarto', RELOJ: 'Reloj', ANULA: 'Anulación'
};

const CARGAS = {
  plantel: { hoja: 'Cargar plantel', cols: ['Categoría', 'Equipo', 'Camiseta', 'Nombre', 'Apellido', 'Altura (cm)', 'Posición (B, E, A, AP, P)', 'Documento', 'Fecha de nacimiento', 'Habilitado (sí/no)', 'Observaciones'] },
  fixture: { hoja: 'Cargar fixture', cols: ['Fecha', 'Hora (hh:mm)', 'Cancha', 'Categoría', 'Fase', 'Grupo', 'Fecha nº', 'Local', 'Visitante'] },
  resultados: { hoja: 'Cargar resultados', cols: ['Fecha', 'Categoría', 'Local', 'Visitante', 'Pts local', 'Pts visitante'] }
};

/* ---------------------------------------------------------------- menú ---------------------------------------------------------------- */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🏀 TU LIGA')
    .addItem('Actualizar desde TU LIGA ahora', 'sincronizar')
    .addSeparator()
    .addItem('1 · Validar lo que cargué (no guarda nada)', 'validarCarga')
    .addItem('2 · Importar a TU LIGA', 'importarCarga')
    .addSeparator()
    .addItem('Primera vez: preparar la hoja', 'prepararHoja')
    .addItem('Primera vez: guardar la clave de Drive', 'guardarClave')
    .addItem('Activar la actualización automática (cada 5 min)', 'instalarDisparador')
    .addToUi();
}

/** Primera vez: crea todas las pestañas y deja la hoja en hora de Argentina. */
function prepararHoja() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(CONFIG.ZONA);
  const leeme = ss.getSheetByName('LEEME') || ss.insertSheet('LEEME', 0);
  leeme.clear();
  leeme.getRange('A1:B8').setValues([
    ['TU LIGA · hoja administrativa', ''],
    ['Qué es', 'Espejo PRIVADO de la liga. TU LIGA (la plataforma) es la base de toda la información.'],
    ['Última actualización', ''],
    ['Datos de regularidad', ''],
    ['No editar', 'Plantel, Equipos, Fixture, Resultados, Tabla, Estadísticas y Jugadas se reescriben solas.'],
    ['Cargar datos', 'Completá "Cargar plantel", "Cargar fixture" o "Cargar resultados" → menú 🏀 TU LIGA → 1 · Validar → 2 · Importar.'],
    ['Horarios', 'Todas las horas son de Argentina.'],
    ['Privacidad', 'Esta hoja contiene datos privados (documento, nacimiento). No la compartas fuera de la administración de la liga.']
  ]);
  leeme.getRange('A1').setFontSize(16).setFontWeight('bold');
  leeme.getRange('A2:A8').setFontWeight('bold');
  leeme.getRange('B3').setNumberFormat('dd/mm/yyyy hh:mm');
  leeme.setColumnWidth(1, 190); leeme.setColumnWidth(2, 700);
  Object.keys(CARGAS).forEach(function (k) { plantillaCarga_(ss, CARGAS[k]); });
  const hoja1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hoja1 && ss.getSheets().length > 1) ss.deleteSheet(hoja1);
  SpreadsheetApp.getUi().alert('Hoja preparada ✅\n\nSiguiente: menú 🏀 TU LIGA → "Primera vez: guardar la clave de Drive".');
}

function plantillaCarga_(ss, c) {
  const h = ss.getSheetByName(c.hoja) || ss.insertSheet(c.hoja);
  if (h.getLastRow() === 0) {
    h.getRange(1, 1, 1, c.cols.length + 1).setValues([c.cols.concat(['Estado'])]).setFontWeight('bold').setBackground('#2f80ed').setFontColor('#ffffff');
    h.setFrozenRows(1);
    c.cols.forEach(function (n, i) {
      if (/^Hora/.test(n)) h.getRange(2, i + 1, 500, 1).setNumberFormat('@');                    // texto: así "21:30" no se convierte en otra cosa
      if (/^Fecha$|nacimiento/.test(n)) h.getRange(2, i + 1, 500, 1).setNumberFormat('dd/mm/yyyy');
    });
    h.autoResizeColumns(1, c.cols.length + 1);
    h.setColumnWidth(c.cols.length + 1, 380);
  }
}

/** Primera vez: guarda la clave de Drive de la liga (queda en las propiedades del script, no en la hoja). */
function guardarClave() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Clave de Drive de la liga', 'Pegá la clave de Drive (la misma que pusiste en Supabase). Queda guardada de forma privada en este script.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK || !r.getResponseText().trim()) return;
  PropertiesService.getScriptProperties().setProperty('CLAVE_DRIVE', r.getResponseText().trim());
  try { rpc_('drive_exportar', { p_slug: CONFIG.LIGA, p_token: r.getResponseText().trim() }); ui.alert('Clave guardada y verificada ✅'); }
  catch (e) { PropertiesService.getScriptProperties().deleteProperty('CLAVE_DRIVE'); ui.alert('La clave no coincide con la de Supabase ❌\n\n' + e.message); }
}

function instalarDisparador() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sincronizar') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getUi().alert('Listo ✅ La hoja se actualiza sola cada 5 minutos.');
}

/* ---------------------------------------------------------------- IDA: TU LIGA → hoja ---------------------------------------------------------------- */

function sincronizar() {
  const cerrojo = LockService.getScriptLock();
  if (!cerrojo.tryLock(30000)) return;
  try {
    const ss = SpreadsheetApp.getActive();
    const liga = consultar_('vista_ligas?select=*&slug=eq.' + CONFIG.LIGA)[0];
    if (!liga) throw new Error('No existe la liga ' + CONFIG.LIGA);
    const categorias = consultar_('vista_categorias?select=*&liga_id=eq.' + liga.id + '&order=nombre');
    const idsCat = categorias.map(function (c) { return c.id; });
    const enCat = idsCat.length ? '&categoria_id=in.(' + idsCat.join(',') + ')' : '&categoria_id=eq.00000000-0000-0000-0000-000000000000';
    const d = {
      liga: liga, categorias: categorias,
      equipos: consultar_('vista_equipos?select=*' + enCat + '&order=nombre'),
      jugadores: consultar_('vista_jugadores?select=*&liga_id=eq.' + liga.id + '&order=apellido'),
      partidos: consultar_('vista_partidos?select=*&liga_id=eq.' + liga.id + '&order=fecha_hora'),
      tabla: consultar_('vista_tabla?select=*' + enCat + '&order=posicion'),
      stats: consultar_('vista_stats_jugador?select=*' + enCat + '&order=pts.desc'),
      privados: [], jugadas: {}
    };
    let aviso = 'Completos.';
    const clave = PropertiesService.getScriptProperties().getProperty('CLAVE_DRIVE');
    if (clave) { try { d.privados = rpc_('drive_exportar', { p_slug: CONFIG.LIGA, p_token: clave }).privados || []; } catch (e) { aviso = 'Faltan (la clave de Drive no es válida: ' + e.message + ').'; } }
    else aviso = 'Faltan: guardá la clave de Drive (menú 🏀 TU LIGA → Primera vez).';

    const jugados = d.partidos.filter(function (p) { return p.estado === 'en_vivo' || p.estado === 'cerrado'; });
    for (let i = 0; i < jugados.length; i += 10) {
      const tanda = jugados.slice(i, i + 10), pedidos = [];
      tanda.forEach(function (p) { pedidos.push(pedido_('eventos?select=*&partido_id=eq.' + p.id + '&order=seq')); pedidos.push(pedido_('vista_partido_jugadores?select=*&partido_id=eq.' + p.id)); });
      const resp = UrlFetchApp.fetchAll(pedidos);
      tanda.forEach(function (p, k) { d.jugadas[p.id] = { eventos: JSON.parse(resp[2 * k].getContentText()), plantel: JSON.parse(resp[2 * k + 1].getContentText()) }; });
    }
    const hojas = armarHojas_(d);
    Object.keys(hojas).forEach(function (n) { escribirHoja_(ss, n, hojas[n]); });
    const leeme = ss.getSheetByName('LEEME');
    if (leeme) { leeme.getRange('B3').setValue(new Date()); leeme.getRange('B4').setValue(aviso); }
  } finally { cerrojo.releaseLock(); }
}

/** La web puede pedir una actualización al instante (?accion=sincronizar). Máximo una por minuto. Solo lee y copia. */
function doGet(e) {
  const cache = CacheService.getScriptCache();
  if (e && e.parameter && e.parameter.accion === 'sincronizar') {
    if (cache.get('reciente')) return salida_({ ok: true, nota: 'ya estaba reciente' });
    cache.put('reciente', '1', 60);
    sincronizar();
    return salida_({ ok: true });
  }
  return salida_({ ok: true, nota: 'TU LIGA · hoja administrativa' });
}

/** Transforma los datos de TU LIGA en las filas de cada pestaña. Función pura (no toca Drive ni la red): se puede probar con datos de ejemplo. */
function armarHojas_(d) {
  const nombreCat = {}; d.categorias.forEach(function (c) { nombreCat[c.id] = c.nombre; });
  const jug = {}; d.jugadores.forEach(function (j) { jug[j.id] = j; });
  const priv = {}; (d.privados || []).forEach(function (p) { priv[p.jugador_id] = p; });
  const st = {}; d.stats.forEach(function (s) { st[s.jugador_id] = s; });
  const fecha = function (iso) { return iso ? new Date(iso) : ''; };
  const dia = function (s) { return s ? new Date(s + 'T12:00:00Z') : ''; };
  const edad = function (s) { if (!s) return ''; const n = new Date(s + 'T12:00:00Z'), h = new Date(); let a = h.getUTCFullYear() - n.getUTCFullYear(); if (h.getUTCMonth() < n.getUTCMonth() || (h.getUTCMonth() === n.getUTCMonth() && h.getUTCDate() < n.getUTCDate())) a--; return a; };
  const hojas = {};

  hojas['Plantel'] = {
    enc: ['Categoría', 'Equipo', 'Camiseta', 'Nombre', 'Apellido', 'Documento', 'Fecha de nacimiento', 'Edad', 'Altura (cm)', 'Posición', 'Habilitado', 'Partidos jugados', 'Faltas', 'Observaciones', 'Id'],
    filas: d.jugadores.map(function (j) {
      const p = priv[j.id] || {}, s = st[j.id] || {};
      return [nombreCat[j.categoria_id] || '', j.equipo_nombre || '(sin equipo)', j.camiseta_habitual == null ? '' : j.camiseta_habitual, j.nombre, j.apellido,
        p.documento || '', dia(p.fecha_nacimiento), edad(p.fecha_nacimiento), j.altura_cm == null ? '' : j.altura_cm, p.posicion || '',
        p.habilitado === false ? 'No' : (p.jugador_id ? 'Sí' : ''), s.pj || 0, s.faltas || 0, p.notas || '', j.id];
    }),
    formatos: { 7: 'dd/mm/yyyy' }
  };

  hojas['Equipos'] = {
    enc: ['Categoría', 'Equipo', 'Color principal', 'Color alternativo', 'Logo (enlace)', 'Jugadores', 'Id'],
    filas: d.equipos.map(function (e) {
      return [nombreCat[e.categoria_id] || '', e.nombre, e.color_principal, e.color_alternativo, e.logo_url || '', d.jugadores.filter(function (j) { return j.equipo_id === e.id; }).length, e.id];
    })
  };

  hojas['Fixture'] = {
    enc: ['Día y hora', 'Fecha nº', 'Categoría', 'Fase', 'Grupo', 'Cancha', 'Local', 'Visitante', 'Estado', 'Marcador', 'Id'],
    filas: d.partidos.map(function (p) {
      return [fecha(p.fecha_hora), p.nro_fecha == null ? '' : p.nro_fecha, p.categoria_nombre, p.fase || '', p.grupo || '', p.cancha || '', p.local_nombre, p.visitante_nombre, p.estado,
        p.estado === 'programado' ? '' : p.marcador_local + ' - ' + p.marcador_visitante, p.id];
    }),
    formatos: { 1: 'dd/mm/yyyy hh:mm' }
  };

  hojas['Resultados'] = {
    enc: ['Día y hora', 'Categoría', 'Local', 'Pts local', 'Pts visitante', 'Visitante', 'Ganó', 'Árbitros', 'Cronometrista', 'Origen', 'Id'],
    filas: d.partidos.filter(function (p) { return p.estado === 'cerrado'; }).map(function (p) {
      const gano = p.marcador_local === p.marcador_visitante ? 'Empate' : (p.marcador_local > p.marcador_visitante ? p.local_nombre : p.visitante_nombre);
      const origen = d.jugadas[p.id] && d.jugadas[p.id].eventos.length ? 'Planilla' : 'Cargado a mano';
      return [fecha(p.fecha_hora), p.categoria_nombre, p.local_nombre, p.marcador_local, p.marcador_visitante, p.visitante_nombre, gano, (p.arbitros || []).join(', '), p.cronometrista || '', origen, p.id];
    }),
    formatos: { 1: 'dd/mm/yyyy hh:mm' }
  };

  hojas['Tabla'] = {
    enc: ['Categoría', 'Pos.', 'Equipo', 'PJ', 'G', 'P', 'PF', 'PC', 'Dif', 'Pts'],
    filas: d.tabla.map(function (t) { return [nombreCat[t.categoria_id] || '', t.posicion, t.equipo_nombre, t.pj, t.pg, t.pp, t.pf, t.pc, t.dif, t.pts]; })
  };

  hojas['Estadísticas'] = {
    enc: ['Categoría', 'Jugador', 'Equipo', 'PJ', 'Pts', 'Pts/partido', 'Reb', 'Ast', 'Rob', 'Per', 'Faltas', 'Min/partido', 'Triples', 'T. libres', 'Máx. pts'],
    filas: d.stats.map(function (s) {
      return [nombreCat[s.categoria_id] || '', s.nombre_completo, s.equipo_nombre, s.pj, s.pts, s.pts_prom, s.reb, s.ast, s.rob, s.per, s.faltas, s.min_prom, s.t3_conv + '/' + s.t3_int, s.tl_conv + '/' + s.tl_int, s.pts_max];
    })
  };

  const filasJ = [];
  d.partidos.forEach(function (p) {
    const j = d.jugadas[p.id]; if (!j) return;
    const cam = {}; j.plantel.forEach(function (x) { cam[x.jugador_id] = x.camiseta; });
    const anuladas = {}; j.eventos.forEach(function (e) { if (e.tipo === 'ANULA' && e.anula) anuladas[e.anula] = true; });
    const nom = function (id) { return id ? ('#' + (cam[id] == null ? '?' : cam[id]) + ' ' + (jug[id] ? jug[id].nombre_completo : '')) : ''; };
    j.eventos.forEach(function (e) {
      filasJ.push([fecha(p.fecha_hora), p.local_nombre + ' vs ' + p.visitante_nombre, e.cuarto > 4 ? 'TS' + (e.cuarto - 4) : (e.cuarto || ''), segundos_(e.reloj_seg), TIPOS[e.tipo] || e.tipo,
        e.equipo === 'local' ? p.local_nombre : e.equipo === 'visitante' ? p.visitante_nombre : '', nom(e.jugador_id), nom(e.jugador2_id), e.detalle || '', anuladas[e.id] ? 'sí' : '', e.seq, p.id]);
    });
  });
  hojas['Jugadas'] = { enc: ['Día del partido', 'Partido', 'Cuarto', 'Reloj', 'Jugada', 'Equipo', 'Jugador', 'Jugador 2 (entra)', 'Detalle', 'Anulada', 'Orden', 'Id partido'], filas: filasJ, formatos: { 1: 'dd/mm/yyyy' } };
  return hojas;
}

/* ---------------------------------------------------------------- VUELTA: hoja → TU LIGA ---------------------------------------------------------------- */

/** Valida lo cargado en las pestañas "Cargar …" SIN guardar nada y marca cada fila. */
function validarCarga() { procesarCarga_(false); }

/** Aplica lo cargado: crea y actualiza equipos, jugadores, fixture y resultados en TU LIGA. */
function importarCarga() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.alert('Importar a TU LIGA', 'Se van a guardar en TU LIGA las filas válidas de las pestañas "Cargar …". Las que tengan error se saltean.\n\n¿Ya las validaste y querés continuar?', ui.ButtonSet.YES_NO);
  if (r === ui.Button.YES) procesarCarga_(true);
}

function procesarCarga_(aplicar) {
  const ui = SpreadsheetApp.getUi(), ss = SpreadsheetApp.getActive();
  const clave = PropertiesService.getScriptProperties().getProperty('CLAVE_DRIVE');
  if (!clave) { ui.alert('Falta la clave de Drive: menú 🏀 TU LIGA → "Primera vez: guardar la clave de Drive".'); return; }
  const valores = {};
  Object.keys(CARGAS).forEach(function (k) { const h = ss.getSheetByName(CARGAS[k].hoja); valores[k] = h && h.getLastRow() > 1 ? h.getRange(2, 1, h.getLastRow() - 1, CARGAS[k].cols.length).getValues() : []; });
  const carga = armarCarga_(valores, ss.getSpreadsheetTimeZone());
  const total = carga.plantel.length + carga.fixture.length + carga.resultados.length;
  if (!total) { ui.alert('No hay filas cargadas en las pestañas "Cargar …".'); return; }
  let res;
  try { res = rpc_('drive_importar', { p_slug: CONFIG.LIGA, p_token: clave, p_plantel: carga.plantel, p_fixture: carga.fixture, p_resultados: carga.resultados, p_aplicar: aplicar }); }
  catch (e) { ui.alert('No pude hablar con TU LIGA ❌\n\n' + e.message); return; }
  let ok = 0, mal = 0;
  Object.keys(CARGAS).forEach(function (k) {
    const h = ss.getSheetByName(CARGAS[k].hoja); if (!h) return;
    const col = CARGAS[k].cols.length + 1;
    res.filter(function (x) { return x.tabla === k; }).forEach(function (x) {
      const celda = h.getRange(x.fila, col);
      celda.setValue((x.ok ? (aplicar ? '✅ Cargado · ' : '✅ ') : '❌ ') + x.mensaje).setFontColor(x.ok ? '#16794c' : '#b42318');
      if (x.ok) ok++; else mal++;
    });
  });
  if (aplicar) { try { sincronizar(); } catch (e) { /* la próxima actualización lo muestra */ } }
  ui.alert((aplicar ? 'Importación terminada' : 'Validación terminada') + '\n\n✅ ' + ok + ' filas bien\n❌ ' + mal + ' con error' + (mal ? '\n\nCorregí las ❌ (el motivo está en la columna Estado) y volvé a validar.' : (aplicar ? '\n\nYa están en TU LIGA.' : '\n\nSi todo está bien: menú → 2 · Importar a TU LIGA.')));
}

/** Convierte lo escrito en las pestañas "Cargar …" en filas para la base. Función pura (probable con datos de ejemplo). */
function armarCarga_(v, zona) {
  const f2 = function (n) { return (n < 10 ? '0' : '') + n; };
  const fecha = function (x) {
    if (x === '' || x == null) return '';
    if (Object.prototype.toString.call(x) === '[object Date]') return Utilities.formatDate(x, zona, 'yyyy-MM-dd');
    const s = String(x).trim(), m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + f2(+m[2]) + '-' + f2(+m[1]);
    return s;
  };
  const hora = function (x) {
    if (x === '' || x == null) return '';
    if (Object.prototype.toString.call(x) === '[object Date]') return Utilities.formatDate(x, zona, 'HH:mm');
    const m = String(x).trim().match(/^(\d{1,2})[:.hH](\d{2})/);
    return m ? f2(+m[1]) + ':' + m[2] : String(x).trim();
  };
  const t = function (x) { return x == null ? '' : String(x).trim(); };
  const vacia = function (r) { return r.every(function (c) { return c === '' || c == null; }); };
  const salida = { plantel: [], fixture: [], resultados: [] };
  v.plantel.forEach(function (r, i) {
    if (vacia(r)) return;
    salida.plantel.push({ fila: i + 2, categoria: t(r[0]), equipo: t(r[1]), camiseta: t(r[2]), nombre: t(r[3]), apellido: t(r[4]), altura: t(r[5]), posicion: t(r[6]), documento: t(r[7]), nacimiento: fecha(r[8]), habilitado: t(r[9]), notas: t(r[10]) });
  });
  v.fixture.forEach(function (r, i) {
    if (vacia(r)) return;
    salida.fixture.push({ fila: i + 2, fecha: fecha(r[0]), hora: hora(r[1]), cancha: t(r[2]), categoria: t(r[3]), fase: t(r[4]), grupo: t(r[5]), nro_fecha: t(r[6]), local: t(r[7]), visitante: t(r[8]) });
  });
  v.resultados.forEach(function (r, i) {
    if (vacia(r)) return;
    salida.resultados.push({ fila: i + 2, fecha: fecha(r[0]), categoria: t(r[1]), local: t(r[2]), visitante: t(r[3]), pts_local: t(r[4]), pts_visitante: t(r[5]) });
  });
  return salida;
}

/* ---------------------------------------------------------------- utilidades ---------------------------------------------------------------- */

function segundos_(s) { if (s == null) return ''; const m = Math.floor(s / 60), r = s % 60; return m + ':' + (r < 10 ? '0' : '') + r; }

function pedido_(ruta, desde) {
  return { url: CONFIG.SUPABASE_URL + '/rest/v1/' + ruta, method: 'get', muteHttpExceptions: true,
    headers: { apikey: CONFIG.CLAVE_PUBLICA, 'Range-Unit': 'items', Range: (desde || 0) + '-' + ((desde || 0) + 999) } };
}

/** Trae TODAS las filas (el servidor entrega de a 1000: se pide por páginas). */
function consultar_(ruta) {
  const filas = []; let desde = 0;
  for (;;) {
    const p = pedido_(ruta, desde), r = UrlFetchApp.fetch(p.url, p), c = r.getResponseCode();
    if (c !== 200 && c !== 206) throw new Error('TU LIGA respondió ' + c + ' en ' + ruta.split('?')[0] + ': ' + r.getContentText().slice(0, 120));
    const t = JSON.parse(r.getContentText());
    t.forEach(function (x) { filas.push(x); });
    if (t.length < 1000) break;
    desde += 1000;
  }
  return filas;
}

/** Llama a una función de la base (RPC). */
function rpc_(nombre, cuerpo) {
  const r = UrlFetchApp.fetch(CONFIG.SUPABASE_URL + '/rest/v1/rpc/' + nombre, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { apikey: CONFIG.CLAVE_PUBLICA }, payload: JSON.stringify(cuerpo)
  });
  const c = r.getResponseCode(), txt = r.getContentText();
  if (c < 200 || c >= 300) { let m = txt; try { m = JSON.parse(txt).message || txt; } catch (e) { /* texto plano */ } throw new Error(m); }
  return JSON.parse(txt);
}

function escribirHoja_(ss, nombre, h) {
  const hoja = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  hoja.clearContents();
  const todas = [h.enc].concat(h.filas);
  hoja.getRange(1, 1, todas.length, h.enc.length).setValues(todas);
  hoja.getRange(1, 1, 1, h.enc.length).setFontWeight('bold').setBackground('#ff8a4c').setFontColor('#1c0f07');
  hoja.setFrozenRows(1);
  if (h.formatos && h.filas.length) Object.keys(h.formatos).forEach(function (c) { hoja.getRange(2, +c, h.filas.length, 1).setNumberFormat(h.formatos[c]); });
  if (h.filas.length < 2000) hoja.autoResizeColumns(1, h.enc.length);
}

function salida_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
