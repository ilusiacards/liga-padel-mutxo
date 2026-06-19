'use strict';

/* ============================================================
   ESTADO Y PERSISTENCIA
   ============================================================ */

const STORAGE_KEY = 'padel-liga-mutxo-v1';

function estadoInicial() {
  return {
    girls: Array(8).fill(''),
    boys: Array(8).fill(''),
    jornadas: [],
    liveGenerated: false,
  };
}

let ligaState = estadoInicial();

function guardarEstado() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ligaState));
}

function cargarEstado() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    ligaState = estadoInicial();
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.girls) || !Array.isArray(parsed.boys)) {
      throw new Error('forma invalida');
    }
    ligaState = parsed;
  } catch (e) {
    console.warn('Estado corrupto en localStorage, usando estado inicial.', e);
    ligaState = estadoInicial();
  }
}

/* ============================================================
   ALGORITMO DE GENERACIÓN DE CALENDARIO (round-robin / método del polígono)
   Función pura, sin efectos secundarios — testeable desde la consola:
     generarCalendario()
   ============================================================ */

function shuffle(array) {
  const copia = array.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function generarCalendario(numGirls = 8, numBoys = 8) {
  const girlsOrder = shuffle([...Array(numGirls).keys()]);
  const boysOrder = shuffle([...Array(numBoys).keys()]);
  const jornadas = [];

  for (let r = 0; r < numGirls; r++) {
    const pares = [];
    for (let i = 0; i < numGirls; i++) {
      const girlIdx = girlsOrder[i];
      const boyIdx = boysOrder[(i + r) % numBoys];
      pares.push({ girlIdx, boyIdx });
    }
    const paresBarajados = shuffle(pares);
    const partidos = [];
    for (let p = 0; p < paresBarajados.length / 2; p++) {
      partidos.push({
        id: `j${r + 1}-p${p + 1}`,
        parejaA: paresBarajados[p * 2],
        parejaB: paresBarajados[p * 2 + 1],
        sets: [
          { a: null, b: null },
          { a: null, b: null },
          { a: null, b: null },
        ],
        completado: false,
        ganadorPareja: null,
      });
    }
    jornadas.push({ numero: r + 1, partidos, colapsada: false });
  }

  return jornadas;
}

/* ============================================================
   LÓGICA DE PARTIDOS (sets, ganador)
   ============================================================ */

function setJugado(set) {
  return !(set.a === 0 && set.b === 0) && set.a !== null && set.b !== null;
}

function ganadorSet(set) {
  if (!setJugado(set)) return null;
  if (set.a > set.b) return 'A';
  if (set.b > set.a) return 'B';
  return null;
}

function calcularGanadorPartido(partido) {
  let setsA = 0;
  let setsB = 0;
  for (const set of partido.sets) {
    const g = ganadorSet(set);
    if (g === 'A') setsA++;
    else if (g === 'B') setsB++;
  }
  if (setsA >= 2) return 'A';
  if (setsB >= 2) return 'B';
  return null;
}

/* ============================================================
   CLASIFICACIÓN
   ============================================================ */

function personaId(tipo, idx) {
  return `${tipo}${idx}`;
}

function nombrePersona(id) {
  const tipo = id[0];
  const idx = Number(id.slice(1));
  return tipo === 'g' ? ligaState.girls[idx] : ligaState.boys[idx];
}

function personasDePareja(pareja) {
  return [personaId('g', pareja.girlIdx), personaId('b', pareja.boyIdx)];
}

function todasLasPersonas() {
  const ids = [];
  for (let i = 0; i < ligaState.girls.length; i++) ids.push(personaId('g', i));
  for (let i = 0; i < ligaState.boys.length; i++) ids.push(personaId('b', i));
  return ids;
}

function partidosCompletados() {
  const resultado = [];
  for (const jornada of ligaState.jornadas) {
    for (const partido of jornada.partidos) {
      if (partido.completado) resultado.push(partido);
    }
  }
  return resultado;
}

function calcularClasificacion() {
  const stats = {};
  for (const id of todasLasPersonas()) {
    stats[id] = {
      id,
      nombre: nombrePersona(id),
      pj: 0,
      pg: 0,
      setsG: 0,
      setsP: 0,
      juegG: 0,
      juegP: 0,
      puntos: 0,
    };
  }

  for (const partido of partidosCompletados()) {
    const idsA = personasDePareja(partido.parejaA);
    const idsB = personasDePareja(partido.parejaB);

    let setsA = 0;
    let setsB = 0;
    let juegA = 0;
    let juegB = 0;
    for (const set of partido.sets) {
      if (!setJugado(set)) continue;
      juegA += set.a;
      juegB += set.b;
      const g = ganadorSet(set);
      if (g === 'A') setsA++;
      else if (g === 'B') setsB++;
    }

    for (const id of idsA) {
      stats[id].pj++;
      stats[id].setsG += setsA;
      stats[id].setsP += setsB;
      stats[id].juegG += juegA;
      stats[id].juegP += juegB;
    }
    for (const id of idsB) {
      stats[id].pj++;
      stats[id].setsG += setsB;
      stats[id].setsP += setsA;
      stats[id].juegG += juegB;
      stats[id].juegP += juegA;
    }

    if (partido.ganadorPareja === 'A') {
      for (const id of idsA) { stats[id].pg++; stats[id].puntos += 3; }
      for (const id of idsB) { stats[id].puntos += 1; }
    } else if (partido.ganadorPareja === 'B') {
      for (const id of idsB) { stats[id].pg++; stats[id].puntos += 3; }
      for (const id of idsA) { stats[id].puntos += 1; }
    }
    // sin ganador claro: 0 puntos para ambos, ya por defecto
  }

  return Object.values(stats);
}

function enfrentamientoDirecto(idJugadorA, idJugadorB) {
  let victoriasA = 0;
  let victoriasB = 0;
  for (const partido of partidosCompletados()) {
    const idsA = personasDePareja(partido.parejaA);
    const idsB = personasDePareja(partido.parejaB);
    const aEnA = idsA.includes(idJugadorA);
    const aEnB = idsB.includes(idJugadorA);
    const bEnA = idsA.includes(idJugadorB);
    const bEnB = idsB.includes(idJugadorB);

    const enfrentados = (aEnA && bEnB) || (aEnB && bEnA);
    if (!enfrentados) continue;

    if (partido.ganadorPareja === 'A') {
      if (aEnA) victoriasA++;
      else victoriasB++;
    } else if (partido.ganadorPareja === 'B') {
      if (aEnB) victoriasA++;
      else victoriasB++;
    }
  }
  return victoriasA - victoriasB;
}

function ordenarClasificacion(stats) {
  return stats.slice().sort((a, b) => {
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    const h2h = enfrentamientoDirecto(a.id, b.id);
    if (h2h !== 0) return -h2h;
    return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
  });
}

/* ============================================================
   RENDER
   ============================================================ */

function render() {
  renderJugadores();
  renderJornadas();
  renderClasificacion();
}

function renderJugadores() {
  renderColumnaJugadores('inputs-girls', ligaState.girls, 'girls');
  renderColumnaJugadores('inputs-boys', ligaState.boys, 'boys');
}

function renderColumnaJugadores(contenedorId, lista, campo) {
  const contenedor = document.getElementById(contenedorId);
  contenedor.innerHTML = '';
  lista.forEach((nombre, idx) => {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input-jugador';
    input.placeholder = `Jugador ${idx + 1}`;
    input.value = nombre;
    input.addEventListener('input', (e) => {
      ligaState[campo][idx] = e.target.value;
      guardarEstado();
      renderJornadas();
      renderClasificacion();
    });
    contenedor.appendChild(input);
  });
}

function nombrePareja(pareja) {
  const girl = ligaState.girls[pareja.girlIdx] || `Girl ${pareja.girlIdx + 1}`;
  const boy = ligaState.boys[pareja.boyIdx] || `Boy ${pareja.boyIdx + 1}`;
  return `${girl} / ${boy}`;
}

function renderJornadas() {
  const contenedor = document.getElementById('jornadas-container');
  const vacio = document.getElementById('jornadas-vacio');

  if (!ligaState.jornadas.length) {
    contenedor.innerHTML = '';
    vacio.style.display = 'block';
    return;
  }
  vacio.style.display = 'none';

  contenedor.innerHTML = '';
  ligaState.jornadas.forEach((jornada) => {
    const card = document.createElement('div');
    card.className = 'jornada-card' + (jornada.colapsada ? ' colapsada' : '');

    const header = document.createElement('div');
    header.className = 'jornada-header';
    header.innerHTML = `<h3>Jornada ${jornada.numero}</h3>`;

    const btnImagen = document.createElement('button');
    btnImagen.className = 'btn btn-small btn-imagen no-captura';
    btnImagen.textContent = 'Sacar imagen';
    btnImagen.addEventListener('click', (e) => {
      e.stopPropagation();
      const estabaColapsada = jornada.colapsada;
      if (estabaColapsada) card.classList.remove('colapsada');
      capturarImagen(card, `jornada-${jornada.numero}-padel-mutxo`).finally(() => {
        if (estabaColapsada) card.classList.add('colapsada');
      });
    });
    header.appendChild(btnImagen);

    const toggle = document.createElement('span');
    toggle.className = 'jornada-toggle';
    toggle.textContent = '▾';
    header.appendChild(toggle);

    header.addEventListener('click', (e) => {
      if (e.target.closest('.btn-imagen')) return;
      jornada.colapsada = !jornada.colapsada;
      guardarEstado();
      renderJornadas();
    });
    card.appendChild(header);

    const partidosWrap = document.createElement('div');
    partidosWrap.className = 'jornada-partidos';
    jornada.partidos.forEach((partido) => {
      partidosWrap.appendChild(crearPartidoCard(partido));
    });
    card.appendChild(partidosWrap);

    contenedor.appendChild(card);
  });
}

function crearPartidoCard(partido) {
  const card = document.createElement('div');
  card.className = 'partido-card' + (partido.completado ? ' completado' : '');

  const parejas = document.createElement('div');
  parejas.className = 'partido-parejas';
  const ganaA = partido.ganadorPareja === 'A';
  const ganaB = partido.ganadorPareja === 'B';

  const divA = document.createElement('div');
  divA.className = 'pareja pareja-a' + (ganaA ? ' ganadora' : '');
  divA.textContent = nombrePareja(partido.parejaA);

  const vs = document.createElement('span');
  vs.className = 'vs-label';
  vs.textContent = 'VS';

  const divB = document.createElement('div');
  divB.className = 'pareja pareja-b' + (ganaB ? ' ganadora' : '');
  divB.textContent = nombrePareja(partido.parejaB);

  parejas.appendChild(divA);
  parejas.appendChild(vs);
  parejas.appendChild(divB);
  card.appendChild(parejas);

  const setsGrid = document.createElement('div');
  setsGrid.className = 'sets-grid';
  for (let i = 0; i < 3; i++) {
    const col = document.createElement('div');
    col.className = 'set-col';
    col.innerHTML = `<span class="set-label">Set ${i + 1}</span>`;

    const inputA = crearInputSet(partido, i, 'a');
    const inputB = crearInputSet(partido, i, 'b');
    col.appendChild(inputA);
    col.appendChild(inputB);
    setsGrid.appendChild(col);
  }
  card.appendChild(setsGrid);

  const acciones = document.createElement('div');
  acciones.className = 'partido-acciones';
  const btn = document.createElement('button');
  btn.className = 'btn btn-small btn-completar' + (partido.completado ? ' completado' : '');
  btn.textContent = partido.completado ? 'Editar resultado' : 'Partido completado';
  btn.addEventListener('click', () => {
    partido.ganadorPareja = calcularGanadorPartido(partido);
    partido.completado = true;
    guardarEstado();
    render();
  });
  acciones.appendChild(btn);
  card.appendChild(acciones);

  return card;
}

function crearInputSet(partido, setIdx, lado) {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.max = '7';
  input.className = 'input-set';
  input.value = partido.sets[setIdx][lado] ?? '';
  input.addEventListener('input', (e) => {
    const valorCrudo = e.target.value;
    if (valorCrudo === '') {
      partido.sets[setIdx][lado] = null;
      input.classList.remove('invalido');
    } else {
      let n = parseInt(valorCrudo, 10);
      if (Number.isNaN(n)) {
        input.classList.add('invalido');
        return;
      }
      if (n < 0) n = 0;
      if (n > 7) n = 7;
      input.value = String(n);
      partido.sets[setIdx][lado] = n;
      input.classList.remove('invalido');
    }
    guardarEstado();
  });
  return input;
}

function renderClasificacion() {
  const body = document.getElementById('clasificacion-body');
  const stats = ordenarClasificacion(calcularClasificacion());
  body.innerHTML = '';
  stats.forEach((s, idx) => {
    const tr = document.createElement('tr');
    const valores = [idx + 1, s.nombre || '—', s.pj, s.pg, s.setsG, s.setsP, s.juegG, s.juegP, s.puntos];
    valores.forEach((valor, col) => {
      const td = document.createElement('td');
      if (col === 8) td.className = 'col-puntos';
      td.textContent = String(valor);
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

/* ============================================================
   MODAL DE CONFIRMACIÓN
   ============================================================ */

function mostrarModal(mensaje, onConfirmar) {
  const overlay = document.getElementById('modal-overlay');
  const mensajeEl = document.getElementById('modal-mensaje');
  mensajeEl.textContent = mensaje;
  overlay.hidden = false;

  const btnConfirmar = document.getElementById('modal-confirmar');
  const btnCancelar = document.getElementById('modal-cancelar');

  const cerrar = () => {
    overlay.hidden = true;
    btnConfirmar.removeEventListener('click', onConfirmarHandler);
    btnCancelar.removeEventListener('click', cerrar);
  };
  function onConfirmarHandler() {
    cerrar();
    onConfirmar();
  }

  btnConfirmar.addEventListener('click', onConfirmarHandler);
  btnCancelar.addEventListener('click', cerrar);
}

/* ============================================================
   ACCIONES DE UI
   ============================================================ */

function nombresCompletos() {
  return ligaState.girls.every((n) => n.trim() !== '') &&
         ligaState.boys.every((n) => n.trim() !== '');
}

function generarLiga() {
  if (!nombresCompletos()) {
    alert('Rellena los 16 nombres (8 chicas y 8 chicos) antes de generar la liga.');
    return;
  }

  const ejecutar = () => {
    ligaState.jornadas = generarCalendario();
    ligaState.liveGenerated = true;
    guardarEstado();
    render();
  };

  if (ligaState.liveGenerated) {
    mostrarModal('Esto borrará los resultados actuales. ¿Continuar?', ejecutar);
  } else {
    ejecutar();
  }
}

/* ============================================================
   SACAR IMAGEN (captura de DOM a PNG descargable)
   ============================================================ */

function capturarImagen(elemento, nombreArchivo) {
  return html2canvas(elemento, {
    backgroundColor: '#0a0e1a',
    scale: 2,
    ignoreElements: (el) => el.classList && el.classList.contains('no-captura'),
  }).then((canvas) => {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${nombreArchivo}.png`;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      }, 'image/png');
    });
  }).catch((err) => {
    console.error('Error al generar la imagen', err);
    alert('No se ha podido generar la imagen.');
  });
}

function exportarJSON() {
  const fecha = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(ligaState, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `liga-padel-mutxo-${fecha}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importarJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed || !Array.isArray(parsed.girls) || !Array.isArray(parsed.boys) || !('jornadas' in parsed)) {
        throw new Error('forma invalida');
      }
      mostrarModal('Esto sobrescribirá los datos actuales con el archivo importado. ¿Continuar?', () => {
        ligaState = parsed;
        guardarEstado();
        render();
      });
    } catch (err) {
      alert('El archivo no tiene un formato válido de liga.');
    }
  };
  reader.readAsText(file);
}

/* ============================================================
   TABS
   ============================================================ */

function activarTab(nombreTab) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === nombreTab);
  });
  document.querySelectorAll('.tab-section').forEach((section) => {
    section.classList.toggle('active', section.id === `tab-${nombreTab}`);
  });
}

/* ============================================================
   INICIALIZACIÓN
   ============================================================ */

function init() {
  cargarEstado();
  render();

  document.getElementById('tab-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    activarTab(btn.dataset.tab);
  });

  document.getElementById('btn-generar-liga').addEventListener('click', generarLiga);
  document.getElementById('btn-exportar').addEventListener('click', exportarJSON);
  document.getElementById('btn-imagen-clasificacion').addEventListener('click', () => {
    const fecha = new Date().toISOString().slice(0, 10);
    capturarImagen(document.getElementById('clasificacion-capturable'), `clasificacion-padel-mutxo-${fecha}`);
  });
  document.getElementById('input-importar').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importarJSON(file);
    e.target.value = '';
  });
}

document.addEventListener('DOMContentLoaded', init);
