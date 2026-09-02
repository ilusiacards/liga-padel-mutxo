'use strict';

/* ============================================================
   ESTADO Y PERSISTENCIA
   ============================================================ */

const STORAGE_KEY = 'padel-liga-mutxo-v1';

// Los nombres internos girls/boys, girlIdx/boyIdx y los ids g<idx>/b<idx> son
// legado del modelo mixto original de la liga (dos columnas por género). La
// UI ya no muestra esa semántica ("Columna 1"/"Columna 2"), pero estos
// nombres se conservan tal cual por compatibilidad con el estado guardado en
// localStorage y con los JSON ya exportados — cambiarlos rompería ambos.
function estadoInicial() {
  return {
    girls: Array(8).fill(''),
    boys: Array(8).fill(''),
    jornadas: [],
    liveGenerated: false,
  };
}

/* ------------------------------------------------------------
   VARIAS LIGAS EN EL MISMO NAVEGADOR

   Bajo la MISMA clave de localStorage (`padel-liga-mutxo-v1`, sin cambiar
   de nombre) ya no vive una liga suelta sino el contenedor completo:

     appState = {
       ligas: [ { id, nombre, creadaEl, liga: <estado de UNA liga> } ],
       activaId: <id de la liga seleccionada>
     }

   `ligaState` sigue existiendo y sigue siendo el estado PLANO de UNA liga
   (girls/boys/jornadas/liveGenerated), pero ahora es una REFERENCIA al
   objeto `liga` de la entrada activa. Gracias a eso todas las funciones que
   leen o escriben `ligaState` (render, clasificación, resultados, export,
   enlace…) siguen funcionando sin enterarse de que hay varias ligas:
   cambiar de liga activa es reasignar `ligaState` y volver a renderizar.

   El formato de UNA liga (el del export, el del enlace de la Fase 2 y el de
   los JSON antiguos) NO cambia: sigue siendo el objeto plano.
   ------------------------------------------------------------ */

let appState = { ligas: [], activaId: null };
let ligaState = estadoInicial();

// Modo consulta (Fase 4, enlaces #ver=): cuando es true, `ligaState` apunta
// al estado descomprimido del enlace, SIN relación alguna con `appState` (el
// contenedor cargado de localStorage se queda exactamente como estaba). Es
// la variable que activa todas las salvaguardas de solo lectura: bloquea
// guardarEstado() (ver más abajo) y hace que render()/crearInputSet()/
// crearPartidoCard() no generen ningún camino de edición.
//
// `jugador.html` (app de jugador) reutiliza EXACTAMENTE estas salvaguardas:
// la activa al arrancar y nunca la desactiva (ver initJugador()).
let modoConsulta = false;

function crearIdLiga() {
  let id;
  do {
    id = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  } while (appState.ligas.some((entrada) => entrada.id === id));
  return id;
}

// Envuelve un estado plano de liga en una entrada del contenedor.
function nuevaEntradaLiga(nombre, estadoLiga) {
  return {
    id: crearIdLiga(),
    nombre,
    creadaEl: new Date().toISOString(),
    liga: normalizarLiga(estadoLiga),
  };
}

// Red de seguridad mínima para estados que vienen de fuera (localStorage,
// archivo, enlace): no cambia el formato, solo garantiza que `jornadas` es
// un array para que el render no reviente con datos manipulados a mano.
function normalizarLiga(estadoLiga) {
  if (!formaValidaLiga(estadoLiga)) return estadoInicial();
  if (!Array.isArray(estadoLiga.jornadas)) estadoLiga.jornadas = [];
  return estadoLiga;
}

function appStateInicial() {
  const contenedor = { ligas: [], activaId: null };
  appState = contenedor;
  const entrada = nuevaEntradaLiga('Liga 1', estadoInicial());
  contenedor.ligas.push(entrada);
  contenedor.activaId = entrada.id;
  return contenedor;
}

// Forma del contenedor multi-liga (lo que se guarda desde la Fase 3).
function formaValidaAppState(parsed) {
  return Boolean(parsed) && Array.isArray(parsed.ligas) && 'activaId' in parsed;
}

// Entrada de la liga activa. Si `activaId` apunta a algo que ya no existe
// (estado manipulado a mano), se recompone sobre la primera liga.
function entradaActiva() {
  let entrada = appState.ligas.find((l) => l.id === appState.activaId);
  if (!entrada) {
    entrada = appState.ligas[0];
    if (entrada) appState.activaId = entrada.id;
  }
  return entrada;
}

// Punto único de escritura: antes de serializar se vuelca `ligaState` en la
// entrada activa, así cualquier reasignación de `ligaState` seguida de
// guardarEstado() queda persistida sin tocar el resto de ligas.
function guardarEstado() {
  // Salvaguarda central del modo consulta: pase lo que pase más arriba
  // (colapsar una jornada, un listener que se escape, lo que sea), en modo
  // consulta NUNCA se escribe en localStorage ni se toca `appState`. Es el
  // único punto de escritura de toda la app, así que basta con cortarlo aquí.
  if (modoConsulta) return;
  const entrada = entradaActiva();
  if (entrada) entrada.liga = ligaState;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
}

// Reconstruye una lista de entradas saneada a partir de lo guardado:
// descarta entradas irreconocibles y rellena los campos que falten.
function normalizarEntradas(ligas) {
  const usados = new Set();
  const entradas = [];
  ligas.forEach((entrada, idx) => {
    if (!entrada || !formaValidaLiga(entrada.liga)) return;
    let id = typeof entrada.id === 'string' && entrada.id && !usados.has(entrada.id)
      ? entrada.id
      : `liga${idx}-${Math.random().toString(36).slice(2, 8)}`;
    usados.add(id);
    entradas.push({
      id,
      nombre: typeof entrada.nombre === 'string' && entrada.nombre.trim() ? entrada.nombre : `Liga ${idx + 1}`,
      creadaEl: typeof entrada.creadaEl === 'string' ? entrada.creadaEl : new Date().toISOString(),
      liga: normalizarLiga(entrada.liga),
    });
  });
  return entradas;
}

// Migración interna y silenciosa: un valor guardado con la forma "plana" de
// antes de la Fase 3 se envuelve como única liga ("Liga 1") y se reescribe
// ya envuelto. Sin pérdida de datos y sin preguntar nada al usuario.
function cargarEstado() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    appStateInicial();
    ligaState = entradaActiva().liga;
    return;
  }

  let migrado = false;
  try {
    const parsed = JSON.parse(raw);
    if (formaValidaAppState(parsed)) {
      const ligas = normalizarEntradas(parsed.ligas);
      if (!ligas.length) throw new Error('sin ligas utilizables');
      appState = { ligas, activaId: parsed.activaId };
    } else if (formaValidaLiga(parsed)) {
      appState = { ligas: [], activaId: null }; // lista vacía para generar el id
      const entrada = nuevaEntradaLiga('Liga 1', parsed);
      appState.ligas.push(entrada);
      appState.activaId = entrada.id;
      migrado = true;
    } else {
      throw new Error('forma invalida');
    }
  } catch (e) {
    console.warn('Estado corrupto en localStorage, usando estado inicial.', e);
    appStateInicial();
    migrado = true;
  }

  ligaState = entradaActiva().liga;
  if (migrado) guardarEstado();
}

/* ------------------------------------------------------------
   ACCIONES SOBRE LA LISTA DE LIGAS
   ------------------------------------------------------------ */

// "Liga N" con el primer N libre, para no repetir nombres por defecto.
function nombrePorDefectoLiga() {
  const nombres = new Set(appState.ligas.map((entrada) => entrada.nombre));
  let n = appState.ligas.length + 1;
  while (nombres.has(`Liga ${n}`)) n++;
  return `Liga ${n}`;
}

// Crea una liga (vacía o con un estado importado), la activa y renderiza.
function crearLiga(nombre, estadoLiga) {
  const entrada = nuevaEntradaLiga(nombre, estadoLiga || estadoInicial());
  appState.ligas.push(entrada);
  appState.activaId = entrada.id;
  ligaState = entrada.liga;
  guardarEstado();
  render();
  return entrada;
}

function activarLiga(id) {
  const entrada = appState.ligas.find((l) => l.id === id);
  if (!entrada || id === appState.activaId) return;
  guardarEstado(); // deja consolidada la liga que se abandona
  appState.activaId = id;
  ligaState = entrada.liga;
  guardarEstado();
  render();
}

function nuevaLiga() {
  mostrarModalTexto('Nombre de la liga nueva', nombrePorDefectoLiga(), (nombre) => {
    crearLiga(nombre, estadoInicial());
  });
}

function renombrarLigaActiva() {
  const entrada = entradaActiva();
  if (!entrada) return;
  mostrarModalTexto('Nuevo nombre de la liga', entrada.nombre, (nombre) => {
    entrada.nombre = nombre;
    guardarEstado();
    render();
  });
}

// Mínimo de 1 liga: sin ninguna no habría estado que mostrar ni editar.
function eliminarLigaActiva() {
  if (appState.ligas.length <= 1) return;
  const entrada = entradaActiva();
  if (!entrada) return;
  mostrarModal(`Se eliminará la liga "${entrada.nombre}" con todos sus datos. ¿Continuar?`, () => {
    appState.ligas = appState.ligas.filter((l) => l.id !== entrada.id);
    const primera = appState.ligas[0];
    appState.activaId = primera.id;
    ligaState = primera.liga;
    guardarEstado();
    render();
  });
}

/* ============================================================
   ALGORITMO DE GENERACIÓN DE CALENDARIO (round-robin / método del polígono
   + agrupamiento de partidos que maximiza la cobertura de rivales)
   Funciones puras, sin efectos secundarios — testeables desde la consola:
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

// Clave canónica (sin importar el orden) para un par de índices del mismo grupo.
function clavePar(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

// Método del círculo clásico de programación de round-robin (1-factorización
// de K_n): produce n-1 rondas de n/2 emparejamientos de POSICIONES 0..n-1
// donde cada par de posiciones aparece emparejado exactamente una vez.
// Es la misma construcción determinista que ya se usaba para las parejas
// chica-chico, aplicada ahora también al agrupamiento en partidos — sirve
// como punto de partida de altísima calidad para la fase de refinamiento,
// en vez de arrancar desde un agrupamiento puramente al azar.
function metodoDelCirculo(n) {
  const rondas = [];
  const fijo = n - 1;
  for (let r = 0; r < n - 1; r++) {
    const pares = [[fijo, r]];
    for (let k = 1; k < n / 2; k++) {
      const a = (((r - k) % (n - 1)) + (n - 1)) % (n - 1);
      const b = (r + k) % (n - 1);
      pares.push([a, b]);
    }
    rondas.push(pares);
  }
  return rondas;
}

// Agrupa las n parejas de una jornada en n/2 partidos, con un orden aleatorio.
function agrupamientoAleatorio(pares) {
  const barajado = shuffle(pares);
  const partidos = [];
  for (let p = 0; p < barajado.length / 2; p++) {
    partidos.push([barajado[p * 2], barajado[p * 2 + 1]]);
  }
  return partidos;
}

// Historial de cruces de rivalidad ya jugados: Map clave -> nº de veces.
// Se usan contadores (no un simple Set) porque la fase de refinamiento
// necesita poder "retirar" la contribución de una jornada y volver a
// calcularla sin perder la cuenta de lo que aportan las demás.
function contarClave(mapa, clave) {
  return mapa.get(clave) || 0;
}

// Nº de claves realmente cubiertas ahora mismo (valor > 0). NO se puede usar
// mapa.size: el refinamiento decrementa claves a 0 sin borrarlas (para poder
// volver a incrementarlas), así que .size cuenta también pares "desregistrados".
function contarCubiertos(mapa) {
  let cubiertos = 0;
  for (const valor of mapa.values()) {
    if (valor > 0) cubiertos++;
  }
  return cubiertos;
}

function registrarAgrupamiento(agrupamiento, rivalesGG, rivalesBB, rivalesGB, delta) {
  for (const [parejaA, parejaB] of agrupamiento) {
    const claves = [
      [rivalesGG, clavePar(parejaA.girlIdx, parejaB.girlIdx)],
      [rivalesBB, clavePar(parejaA.boyIdx, parejaB.boyIdx)],
      [rivalesGB, `g${parejaA.girlIdx}-b${parejaB.boyIdx}`],
      [rivalesGB, `g${parejaB.girlIdx}-b${parejaA.boyIdx}`],
    ];
    for (const [mapa, clave] of claves) {
      mapa.set(clave, contarClave(mapa, clave) + delta);
    }
  }
}

// Cuenta cuántos de los 4 cruces de rivalidad (chica-chica, chico-chico,
// chica-chico ×2) de cada partido son NUEVOS (cuenta 0) respecto al resto
// del calendario ya generado.
function puntuarAgrupamiento(agrupamiento, rivalesGG, rivalesBB, rivalesGB) {
  let nuevos = 0;
  for (const [parejaA, parejaB] of agrupamiento) {
    if (contarClave(rivalesGG, clavePar(parejaA.girlIdx, parejaB.girlIdx)) === 0) nuevos++;
    if (contarClave(rivalesBB, clavePar(parejaA.boyIdx, parejaB.boyIdx)) === 0) nuevos++;
    if (contarClave(rivalesGB, `g${parejaA.girlIdx}-b${parejaB.boyIdx}`) === 0) nuevos++;
    if (contarClave(rivalesGB, `g${parejaB.girlIdx}-b${parejaA.boyIdx}`) === 0) nuevos++;
  }
  return nuevos;
}

const INTENTOS_AGRUPAMIENTO = 500;

// El presupuesto de refinamiento escala con n: grupos grandes tienen mucho
// más espacio de combinaciones que cubrir, así que necesitan más pasadas
// para acercarse a su techo de cobertura; grupos pequeños ya lo alcanzan
// con pocas. Medido en la práctica (ver notas de la sesión): más allá de
// esto los rendimientos son marginales frente al coste en tiempo, y esto
// mantiene la generación bien por debajo de 5s incluso con n=16.
function pasadasRefinamiento(n) {
  return Math.max(8, n);
}

// Prueba varios agrupamientos aleatorios de las parejas de la jornada y se
// queda con el que más cruces de rivalidad nuevos aporta (nunca reintenta de
// forma indefinida: número de intentos acotado, siempre converge).
function mejorAgrupamientoPartidos(pares, rivalesGG, rivalesBB, rivalesGB) {
  const puntuacionMaxima = (pares.length / 2) * 4;
  let mejor = null;
  let mejorPuntuacion = -1;
  for (let intento = 0; intento < INTENTOS_AGRUPAMIENTO && mejorPuntuacion < puntuacionMaxima; intento++) {
    const candidato = agrupamientoAleatorio(pares);
    const puntuacion = puntuarAgrupamiento(candidato, rivalesGG, rivalesBB, rivalesGB);
    if (puntuacion > mejorPuntuacion) {
      mejorPuntuacion = puntuacion;
      mejor = candidato;
    }
  }
  return mejor;
}

// Construye UN calendario candidato completo: fase 1 (parejas chica-chico,
// método del polígono) + fase 2 (agrupamiento en partidos). La fase 2 arranca
// desde el método del círculo aplicado a las posiciones (garantiza de
// entrada cobertura óptima de rivalidad chica-chica) y luego aplica varias
// pasadas de refinamiento por coordenadas, cada una recalculando una jornada
// contra el resto del calendario ya fijado, para acercar también la
// cobertura chico-chico y chica-chico a la totalidad. Devuelve además el nº
// total de cruces de rivalidad distintos cubiertos, para comparar candidatos.
//
// Si n es impar, cada jornada sobra una pareja (no se puede repartir un
// número impar de parejas en partidos de 2 en 2): descansa la pareja de la
// posición r en la jornada r. Como 2 es invertible módulo n cuando n es
// impar, rotar el descanso por posición garantiza que cada chica Y cada
// chico descansan exactamente una jornada en toda la liga (nunca más de
// una vez, nunca ninguna).
function generarCandidato(n) {
  const girlsOrder = shuffle([...Array(n).keys()]);
  const boysOrder = shuffle([...Array(n).keys()]);
  const esImpar = n % 2 !== 0;
  const posicionesRondas = esImpar ? null : metodoDelCirculo(n); // n-1 rondas de posiciones

  const paresPorJornada = [];
  for (let r = 0; r < n; r++) {
    const pares = [];
    for (let i = 0; i < n; i++) {
      pares.push({ girlIdx: girlsOrder[i], boyIdx: boysOrder[(i + r) % n] });
    }
    paresPorJornada.push(pares);
  }

  // Con n impar, la pareja que descansa en la jornada r es la de la
  // posición r (girlsOrder[r] junto con el chico que le toque esa jornada).
  const parejaActiva = (pares, r) => (esImpar ? pares.filter((_, idx) => idx !== r) : pares);

  const rivalesGG = new Map();
  const rivalesBB = new Map();
  const rivalesGB = new Map();

  const agrupamientos = paresPorJornada.map((pares, r) => {
    const activos = parejaActiva(pares, r);
    let agrupamiento;
    if (esImpar) {
      // Sin tabla algebraica fija posible (el conjunto activo cambia de
      // posiciones cada jornada): se arranca desde un agrupamiento aleatorio
      // y se confía en las pasadas de refinamiento de más abajo.
      agrupamiento = agrupamientoAleatorio(activos);
    } else {
      const posiciones = posicionesRondas[r % (n - 1)];
      agrupamiento = posiciones.map(([p, q]) => [pares[p], pares[q]]);
    }
    registrarAgrupamiento(agrupamiento, rivalesGG, rivalesBB, rivalesGB, 1);
    return agrupamiento;
  });

  // Importante: la reoptimización de una jornada solo mira cuántos cruces
  // NUEVOS aporta el candidato, sin saber cuántos cruces únicos aportaba la
  // jornada anterior que ahora se pierden. Sin comparar contra quedarse como
  // estaba, una pasada podía cambiar una jornada por otra "mejor" en
  // aislado pero peor en total (deshacía cobertura ya conseguida). Por eso
  // se compara explícitamente contra el agrupamiento anterior y solo se
  // sustituye si es estrictamente mejor — la cobertura total nunca baja.
  const pasadas = pasadasRefinamiento(n);
  for (let pasada = 0; pasada < pasadas; pasada++) {
    for (const r of shuffle([...Array(n).keys()])) {
      const anterior = agrupamientos[r];
      const activos = parejaActiva(paresPorJornada[r], r);
      registrarAgrupamiento(anterior, rivalesGG, rivalesBB, rivalesGB, -1);
      const candidato = mejorAgrupamientoPartidos(activos, rivalesGG, rivalesBB, rivalesGB);
      const puntuacionCandidato = puntuarAgrupamiento(candidato, rivalesGG, rivalesBB, rivalesGB);
      const puntuacionAnterior = puntuarAgrupamiento(anterior, rivalesGG, rivalesBB, rivalesGB);
      agrupamientos[r] = puntuacionCandidato > puntuacionAnterior ? candidato : anterior;
      registrarAgrupamiento(agrupamientos[r], rivalesGG, rivalesBB, rivalesGB, 1);
    }
  }

  const cobertura = contarCubiertos(rivalesGG) + contarCubiertos(rivalesBB) + contarCubiertos(rivalesGB);
  const descansaPorJornada = esImpar ? paresPorJornada.map((pares, r) => pares[r]) : paresPorJornada.map(() => null);
  return { agrupamientos, cobertura, descansaPorJornada };
}

const CANDIDATOS_CALENDARIO = 6;

/* ============================================================
   REPARACIÓN DE EQUIDAD: tras elegir el mejor calendario, en vez de seguir
   optimizando el total a ciegas, se identifica a la persona con MENOS
   rivales distintos y se busca un intercambio concreto entre dos partidos
   de una misma jornada que le añada uno de sus rivales que le faltan — solo
   se aplica si no empeora a nadie más. Ataca directamente el peor caso
   (fairness), no la media.
   ============================================================ */

function idsPersonas(n) {
  const ids = [];
  for (let i = 0; i < n; i++) ids.push(`g${i}`);
  for (let i = 0; i < n; i++) ids.push(`b${i}`);
  return ids;
}

// Localiza en qué partido de una jornada (y en qué lado, A o B) juega una
// persona. Devuelve null si esa jornada la persona descansa.
function localizarEnAgrupamiento(agrupamiento, personId) {
  const tipo = personId[0];
  const idx = Number(personId.slice(1));
  for (let i = 0; i < agrupamiento.length; i++) {
    const [parejaA, parejaB] = agrupamiento[i];
    for (const lado of ['A', 'B']) {
      const pareja = lado === 'A' ? parejaA : parejaB;
      const coincide = tipo === 'g' ? pareja.girlIdx === idx : pareja.boyIdx === idx;
      if (coincide) return { partidoIdx: i, lado };
    }
  }
  return null;
}

// Contador incremental de rivalidades persona-a-persona: contador[id] es un
// Map oponente -> nº de veces que se han enfrentado. Se usa (en vez de
// recontar todo el calendario en cada intento) porque un solo intercambio
// entre dos partidos solo puede afectar a las 4 parejas implicadas — de
// lo contrario, para N grande, repasar toda la liga en cada intento de
// intercambio es demasiado lento (llegó a tardar >30s con N=16).
function crearContadorRivales(agrupamientos, n) {
  const contador = {};
  for (const id of idsPersonas(n)) contador[id] = new Map();
  for (const agrupamiento of agrupamientos) {
    for (const [parejaA, parejaB] of agrupamiento) {
      ajustarContadorPartido(contador, parejaA, parejaB, 1);
    }
  }
  return contador;
}

function ajustarContadorPartido(contador, parejaA, parejaB, delta) {
  const gA = `g${parejaA.girlIdx}`, bA = `b${parejaA.boyIdx}`;
  const gB = `g${parejaB.girlIdx}`, bB = `b${parejaB.boyIdx}`;
  for (const [x, y] of [[gA, bB], [bA, gB], [gA, gB], [bA, bB]]) {
    contador[x].set(y, (contador[x].get(y) || 0) + delta);
    contador[y].set(x, (contador[y].get(x) || 0) + delta);
  }
}

function distintosCubiertos(mapaOponentes) {
  let cubiertos = 0;
  for (const veces of mapaOponentes.values()) {
    if (veces > 0) cubiertos++;
  }
  return cubiertos;
}

// Acotado por construcción: como máximo RONDAS_MAXIMAS_EQUIDAD vueltas
// completas, y se para en cuanto una vuelta entera no logra ningún arreglo
// — nunca reintenta de forma indefinida. Recorre a TODAS las personas con
// hueco en cada vuelta (no solo a la peor cubierta): que una no tenga
// arreglo disponible no debe impedir arreglar a otras.
const RONDAS_MAXIMAS_EQUIDAD = 20;

function repararEquidad(agrupamientos, n) {
  const maxPosibles = 2 * n - 1;
  const contador = crearContadorRivales(agrupamientos, n);

  for (let ronda = 0; ronda < RONDAS_MAXIMAS_EQUIDAD; ronda++) {
    let algunArreglo = false;
    const necesitados = shuffle(
      idsPersonas(n).filter((id) => distintosCubiertos(contador[id]) < maxPosibles)
    );
    if (necesitados.length === 0) break; // todo el mundo cubre a todos

    for (const persona of necesitados) {
      if (distintosCubiertos(contador[persona]) >= maxPosibles) continue; // ya se arregló esta vuelta

      const faltantes = shuffle(
        idsPersonas(n).filter((id) => id !== persona && (contador[persona].get(id) || 0) === 0)
      );

      let arreglado = false;
      for (const candidato of faltantes) {
        for (let r = 0; r < agrupamientos.length && !arreglado; r++) {
          const locPersona = localizarEnAgrupamiento(agrupamientos[r], persona);
          const locCandidato = localizarEnAgrupamiento(agrupamientos[r], candidato);
          if (!locPersona || !locCandidato || locPersona.partidoIdx === locCandidato.partidoIdx) continue;

          const agrupamiento = agrupamientos[r];
          const partidoX = agrupamiento[locPersona.partidoIdx];
          const partidoY = agrupamiento[locCandidato.partidoIdx];
          const parejaX = locPersona.lado === 'A' ? partidoX[0] : partidoX[1];
          const parejaXop = locPersona.lado === 'A' ? partidoX[1] : partidoX[0];
          const parejaY = locCandidato.lado === 'A' ? partidoY[0] : partidoY[1];
          const parejaYop = locCandidato.lado === 'A' ? partidoY[1] : partidoY[0];

          const afectados = [parejaX, parejaXop, parejaY, parejaYop].flatMap((p) => [
            `g${p.girlIdx}`,
            `b${p.boyIdx}`,
          ]);
          const antes = {};
          for (const id of afectados) antes[id] = distintosCubiertos(contador[id]);

          ajustarContadorPartido(contador, parejaX, parejaXop, -1);
          ajustarContadorPartido(contador, parejaY, parejaYop, -1);
          ajustarContadorPartido(contador, parejaX, parejaY, 1);
          ajustarContadorPartido(contador, parejaXop, parejaYop, 1);

          const empeoraAAlguien = afectados.some((id) => distintosCubiertos(contador[id]) < antes[id]);
          if (empeoraAAlguien) {
            ajustarContadorPartido(contador, parejaX, parejaY, -1);
            ajustarContadorPartido(contador, parejaXop, parejaYop, -1);
            ajustarContadorPartido(contador, parejaX, parejaXop, 1);
            ajustarContadorPartido(contador, parejaY, parejaYop, 1);
          } else {
            agrupamiento[locPersona.partidoIdx] = [parejaX, parejaY];
            agrupamiento[locCandidato.partidoIdx] = [parejaXop, parejaYop];
            arreglado = true;
            algunArreglo = true;
          }
        }
        if (arreglado) break;
      }
    }

    if (!algunArreglo) break; // vuelta completa sin ningún arreglo: converge, parar
  }
}

// numGirls debe ser igual a numBoys (soporte para grupos desiguales, con
// distinto nº de chicas que de chicos, no implementado: requeriría decidir
// qué pasa con las personas sobrantes de más de un tipo cada jornada).
// numGirls/numBoys ya no están fijados a 8: cualquier tamaño funciona igual,
// par o impar — con n impar, una pareja descansa cada jornada por turnos
// (ver generarCandidato).
//
// Criterio de cobertura total de rivales: dado que la fase 2 es una búsqueda
// heurística (no existe una fórmula cerrada que garantice el óptimo para
// cualquier n), se generan varios calendarios candidatos completos y se
// devuelve el de mayor cobertura de rivalidad — acotado a
// CANDIDATOS_CALENDARIO intentos, siempre converge.
// Nota de extensión futura (sin implementar): un hipotético modo de "parejas
// fijas" (la pareja se decide una vez, no cada jornada) necesitaría un
// generador de calendario distinto — round-robin directo entre las parejas
// ya formadas, no entre personas de columnas separadas — y una clasificación
// por pareja en vez de por persona. Ver el detalle en README.md.
function generarCalendario(numGirls = 8, numBoys = 8) {
  if (numGirls !== numBoys) {
    throw new Error('generarCalendario requiere el mismo número de personas en cada columna.');
  }
  const n = numGirls;
  const coberturaMaxima = (n * (n - 1)) / 2 /* GG */ + (n * (n - 1)) / 2 /* BB */ + n * n /* GB */;

  let mejorCandidato = null;
  for (let intento = 0; intento < CANDIDATOS_CALENDARIO; intento++) {
    const candidato = generarCandidato(n);
    if (!mejorCandidato || candidato.cobertura > mejorCandidato.cobertura) {
      mejorCandidato = candidato;
    }
    if (mejorCandidato.cobertura === coberturaMaxima) break;
  }

  repararEquidad(mejorCandidato.agrupamientos, n);

  return mejorCandidato.agrupamientos.map((agrupamiento, r) => {
    const partidos = agrupamiento.map(([parejaA, parejaB], p) => ({
      id: `j${r + 1}-p${p + 1}`,
      parejaA,
      parejaB,
      sets: [
        { a: null, b: null },
        { a: null, b: null },
        { a: null, b: null },
      ],
      completado: false,
      ganadorPareja: null,
    }));
    return {
      numero: r + 1,
      partidos,
      colapsada: false,
      descansa: mejorCandidato.descansaPorJornada[r],
    };
  });
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

function victoriasEnGrupo(idJugador, idsGrupo) {
  let victorias = 0;
  for (const partido of partidosCompletados()) {
    const idsA = personasDePareja(partido.parejaA);
    const idsB = personasDePareja(partido.parejaB);
    const enA = idsA.includes(idJugador);
    const enB = idsB.includes(idJugador);
    if (!enA && !enB) continue;

    const rivales = enA ? idsB : idsA;
    const rivalDelGrupo = rivales.some((id) => idsGrupo.includes(id));
    if (!rivalDelGrupo) continue;

    if ((enA && partido.ganadorPareja === 'A') || (enB && partido.ganadorPareja === 'B')) {
      victorias++;
    }
  }
  return victorias;
}

function ordenarClasificacion(stats) {
  const grupos = new Map();
  for (const s of stats) {
    if (!grupos.has(s.puntos)) grupos.set(s.puntos, []);
    grupos.get(s.puntos).push(s);
  }

  const resultado = [];
  for (const puntos of [...grupos.keys()].sort((a, b) => b - a)) {
    const grupo = grupos.get(puntos);
    const idsGrupo = grupo.map((s) => s.id);

    grupo.sort((a, b) => {
      const victA = victoriasEnGrupo(a.id, idsGrupo);
      const victB = victoriasEnGrupo(b.id, idsGrupo);
      if (victB !== victA) return victB - victA;
      const diffSetsA = a.setsG - a.setsP;
      const diffSetsB = b.setsG - b.setsP;
      if (diffSetsB !== diffSetsA) return diffSetsB - diffSetsA;
      const diffJuegosA = a.juegG - a.juegP;
      const diffJuegosB = b.juegG - b.juegP;
      if (diffJuegosB !== diffJuegosA) return diffJuegosB - diffJuegosA;
      return a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
    });

    resultado.push(...grupo);
  }

  return resultado;
}

/* ============================================================
   RENDER
   ============================================================ */

function render() {
  // En modo consulta no se renderizan ni la barra de ligas ni la pestaña
  // Jugadores: así los contenedores de inputs (inputs-girls/inputs-boys) y el
  // <select> de ligas se quedan vacíos, sin generar ningún input editable.
  if (modoConsulta) {
    renderJornadas();
    renderClasificacion();
    return;
  }
  renderSelectorLigas();
  renderJugadores();
  renderJornadas();
  renderClasificacion();
}

// Los nombres de liga los escribe el usuario: siempre con textContent,
// nunca por innerHTML (tampoco en los <option>).
function renderSelectorLigas() {
  const select = document.getElementById('selector-liga');
  if (!select) return;
  select.innerHTML = '';
  appState.ligas.forEach((entrada) => {
    const option = document.createElement('option');
    option.value = entrada.id;
    option.textContent = entrada.nombre;
    select.appendChild(option);
  });
  select.value = appState.activaId;
  document.getElementById('btn-liga-eliminar').disabled = appState.ligas.length <= 1;
}

function renderJugadores() {
  renderColumnaJugadores('inputs-girls', ligaState.girls, 'girls');
  renderColumnaJugadores('inputs-boys', ligaState.boys, 'boys');
}

function renderColumnaJugadores(contenedorId, lista, campo) {
  const contenedor = document.getElementById(contenedorId);
  contenedor.innerHTML = '';
  lista.forEach((nombre, idx) => {
    const fila = document.createElement('div');
    fila.className = 'fila-jugador';

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

    const btnEliminar = document.createElement('button');
    btnEliminar.type = 'button';
    btnEliminar.className = 'btn-eliminar-fila';
    btnEliminar.textContent = '×';
    btnEliminar.setAttribute('aria-label', `Eliminar pareja ${idx + 1}`);
    btnEliminar.disabled = lista.length <= MIN_PAREJAS;
    btnEliminar.addEventListener('click', () => eliminarFila(idx));

    fila.appendChild(input);
    fila.appendChild(btnEliminar);
    contenedor.appendChild(fila);
  });
}

function nombrePareja(pareja) {
  const girl = ligaState.girls[pareja.girlIdx] || `Columna 1 · ${pareja.girlIdx + 1}`;
  const boy = ligaState.boys[pareja.boyIdx] || `Columna 2 · ${pareja.boyIdx + 1}`;
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

    if (jornada.descansa) {
      const descansa = document.createElement('p');
      descansa.className = 'jornada-descansa';
      descansa.textContent = `Pareja ${nombrePareja(jornada.descansa)} descansan`;
      card.appendChild(descansa);
    }

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

  // Modo consulta: sin botón "Partido completado"/"Editar resultado" — no se
  // crea en absoluto, así no hay ningún camino de edición que ocultar a
  // medias (ni siquiera queda en el DOM deshabilitado).
  if (!modoConsulta) {
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
  }

  return card;
}

function crearInputSet(partido, setIdx, lado) {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.max = '7';
  input.className = 'input-set';
  input.value = partido.sets[setIdx][lado] ?? '';
  // Modo consulta: input deshabilitado y sin listener — ni siquiera queda un
  // camino de edición inerte a medias.
  if (modoConsulta) {
    input.disabled = true;
    return input;
  }
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
      if (col === 1) {
        // Fase 5: el nombre es un <button> real (accesible por teclado sin
        // roles/tabindex extra) que abre la ficha de ese jugador. Funciona
        // igual en modo consulta: la ficha es pura consulta, no toca estado.
        const btnNombre = document.createElement('button');
        btnNombre.type = 'button';
        btnNombre.className = 'nombre-jugador-btn';
        btnNombre.textContent = String(valor);
        btnNombre.addEventListener('click', () => abrirFichaJugador(s.id));
        td.appendChild(btnNombre);
      } else {
        td.textContent = String(valor);
      }
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

/* ============================================================
   FICHA DE JUGADOR (Fase 5)

   Modal de solo consulta con el detalle de un jugador: resumen (mismos
   números que la tabla, reutilizando calcularClasificacion/
   ordenarClasificacion), historial de partidos completados, compañeros/
   rivales aún pendientes según el calendario completo, y evolución de
   posición jornada a jornada. Ninguna función de esta sección llama a
   guardarEstado() ni muta ligaState de forma persistente: es pura consulta,
   funciona igual con modoConsulta activado.
   ============================================================ */

// Partido completado o no en el que participa personId, con quién jugó de
// compañero y contra quién, tal cual lo ve ese partido concreto. Se comparte
// entre historialDeJugador() y pendientesDeJugador() para no repetir la
// lógica de "¿en qué lado juega esta persona y quién más hay en ese partido?".
function participacionEnPartido(partido, personId) {
  const idsA = personasDePareja(partido.parejaA);
  const idsB = personasDePareja(partido.parejaB);
  const enA = idsA.includes(personId);
  const enB = idsB.includes(personId);
  if (!enA && !enB) return null;
  const propios = enA ? idsA : idsB;
  const rivales = enA ? idsB : idsA;
  const companeroId = propios.find((id) => id !== personId) || null;
  const lado = enA ? 'A' : 'B';
  return { lado, companeroId, rivalesIds: rivales };
}

// Historial de partidos COMPLETADOS de un jugador, ordenado por jornada.
// Cada entrada: { jornadaNumero, companeroId, rivalesIds, sets, gano, perdio }.
// Función pura, testeable desde consola: historialDeJugador('g0').
function historialDeJugador(personId) {
  const historial = [];
  for (const jornada of ligaState.jornadas) {
    for (const partido of jornada.partidos) {
      if (!partido.completado) continue;
      const participacion = participacionEnPartido(partido, personId);
      if (!participacion) continue;
      const gano = partido.ganadorPareja === participacion.lado;
      const perdio = partido.ganadorPareja !== null && partido.ganadorPareja !== participacion.lado;
      historial.push({
        jornadaNumero: jornada.numero,
        companeroId: participacion.companeroId,
        rivalesIds: participacion.rivalesIds,
        sets: partido.sets,
        gano,
        perdio,
      });
    }
  }
  historial.sort((a, b) => a.jornadaNumero - b.jornadaNumero);
  return historial;
}

// Compañeros/as y rivales con los que personId TODAVÍA no ha coincidido,
// recorriendo TODO el calendario (partidos completados o no: el calendario ya
// fija quién juega con quién). "Compañero posible" se limita a la columna
// opuesta (la única con la que se puede formar pareja); "rival posible"
// incluye a cualquier otra persona, de cualquier columna. Función pura,
// testeable desde consola: pendientesDeJugador('g0').
function pendientesDeJugador(personId) {
  const tipo = personId[0];
  const companerosPosibles = tipo === 'g'
    ? ligaState.boys.map((_, i) => personaId('b', i))
    : ligaState.girls.map((_, i) => personaId('g', i));

  const companerosVistos = new Set();
  const rivalesVistos = new Set();

  for (const jornada of ligaState.jornadas) {
    for (const partido of jornada.partidos) {
      const participacion = participacionEnPartido(partido, personId);
      if (!participacion) continue;
      if (participacion.companeroId) companerosVistos.add(participacion.companeroId);
      participacion.rivalesIds.forEach((id) => rivalesVistos.add(id));
    }
  }

  const pendientesPareja = companerosPosibles.filter((id) => !companerosVistos.has(id));
  const pendientesRival = todasLasPersonas()
    .filter((id) => id !== personId)
    .filter((id) => !rivalesVistos.has(id));

  return { pendientesPareja, pendientesRival };
}

// Ejecuta fn() con `ligaState` apuntando temporalmente a las mismas columnas
// pero con `jornadas` sustituido, y lo restaura después SIEMPRE (incluso si
// fn lanza). Es el mecanismo que usa evolucionPosiciones() para reutilizar
// calcularClasificacion()/ordenarClasificacion() tal cual —sin duplicar sus
// fórmulas— recalculando la clasificación como si solo existieran las
// jornadas pasadas hasta un punto dado. Seguro porque es 100% síncrono (sin
// await de por medio): no hay manejador de evento que pueda colarse y ver el
// ligaState sustituido a medio camino.
function conJornadasTemporales(jornadasTemporales, fn) {
  const original = ligaState;
  ligaState = { ...original, jornadas: jornadasTemporales };
  try {
    return fn();
  } finally {
    ligaState = original;
  }
}

// Posición de personId en cada jornada que ya tiene al menos un partido
// completado, recalculando la clasificación acumulada (jornadas 1..k) en
// cada punto. [{ jornadaNumero, posicion }]. Función pura, testeable desde
// consola: evolucionPosiciones('g0').
function evolucionPosiciones(personId) {
  const evolucion = [];
  for (let k = 0; k < ligaState.jornadas.length; k++) {
    const jornada = ligaState.jornadas[k];
    if (!jornada.partidos.some((p) => p.completado)) continue;
    const jornadasHastaAqui = ligaState.jornadas.slice(0, k + 1);
    const posicion = conJornadasTemporales(jornadasHastaAqui, () => {
      const stats = ordenarClasificacion(calcularClasificacion());
      return stats.findIndex((s) => s.id === personId) + 1;
    });
    evolucion.push({ jornadaNumero: jornada.numero, posicion });
  }
  return evolucion;
}

function crearElementoFicha(tag, className, texto) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (texto !== undefined) el.textContent = texto;
  return el;
}

function construirCabeceraFicha(personId, nombre, posicion) {
  const cabecera = crearElementoFicha('div', 'ficha-cabecera');
  cabecera.appendChild(crearElementoFicha('h2', 'ficha-nombre', nombre || '—'));
  cabecera.appendChild(crearElementoFicha('p', 'ficha-posicion', `${posicion}º en la clasificación`));
  return cabecera;
}

function construirResumenFicha(datos) {
  const resumen = crearElementoFicha('div', 'ficha-resumen');
  const pp = datos.pj - datos.pg;
  const items = [
    ['PJ', datos.pj],
    ['PG', datos.pg],
    ['PP', pp],
    ['Sets a favor', datos.setsG],
    ['Sets en contra', datos.setsP],
    ['Juegos a favor', datos.juegG],
    ['Juegos en contra', datos.juegP],
    ['Puntos', datos.puntos],
  ];
  items.forEach(([etiqueta, valor]) => {
    const tile = crearElementoFicha('div', 'ficha-stat');
    tile.appendChild(crearElementoFicha('span', 'ficha-stat-valor', String(valor)));
    tile.appendChild(crearElementoFicha('span', 'ficha-stat-etiqueta', etiqueta));
    resumen.appendChild(tile);
  });
  return resumen;
}

function construirHistorialFicha(personId) {
  const seccion = crearElementoFicha('div', 'ficha-seccion');
  seccion.appendChild(crearElementoFicha('h3', null, 'Historial de partidos'));

  const historial = historialDeJugador(personId);
  if (!historial.length) {
    seccion.appendChild(crearElementoFicha('p', 'ficha-vacio', 'Aún no ha completado ningún partido.'));
    return seccion;
  }

  const lista = crearElementoFicha('ul', 'ficha-historial-lista');
  historial.forEach((h) => {
    const li = document.createElement('li');
    li.className = 'ficha-historial-item' + (h.gano ? ' ganado' : h.perdio ? ' perdido' : '');

    const cabeceraLi = crearElementoFicha('div', 'ficha-historial-cabecera');
    cabeceraLi.appendChild(crearElementoFicha('span', 'ficha-historial-jornada', `Jornada ${h.jornadaNumero}`));
    cabeceraLi.appendChild(crearElementoFicha(
      'span',
      'ficha-historial-resultado',
      h.gano ? 'Ganado' : h.perdio ? 'Perdido' : 'Sin decidir'
    ));
    li.appendChild(cabeceraLi);

    const companeroNombre = (h.companeroId && nombrePersona(h.companeroId)) || '—';
    const rivalesNombres = h.rivalesIds.map((id) => nombrePersona(id) || '—').join(' / ');
    li.appendChild(crearElementoFicha('p', 'ficha-historial-detalle', `Con ${companeroNombre} vs ${rivalesNombres}`));

    const marcador = h.sets.filter(setJugado).map((s) => `${s.a}-${s.b}`).join(', ') || 'Sin sets registrados';
    li.appendChild(crearElementoFicha('p', 'ficha-historial-marcador', marcador));

    lista.appendChild(li);
  });
  seccion.appendChild(lista);
  return seccion;
}

function construirPendientesFicha(personId) {
  const seccion = crearElementoFicha('div', 'ficha-seccion');
  seccion.appendChild(crearElementoFicha('h3', null, 'Pendientes'));

  const { pendientesPareja, pendientesRival } = pendientesDeJugador(personId);

  const bloquePareja = crearElementoFicha('div', 'ficha-pendientes-bloque');
  bloquePareja.appendChild(crearElementoFicha('p', 'ficha-pendientes-titulo', 'Pendientes como pareja'));
  bloquePareja.appendChild(crearElementoFicha(
    'p',
    'ficha-pendientes-lista',
    pendientesPareja.length ? pendientesPareja.map((id) => nombrePersona(id) || '—').join(', ') : 'Nadie pendiente'
  ));
  seccion.appendChild(bloquePareja);

  const bloqueRival = crearElementoFicha('div', 'ficha-pendientes-bloque');
  bloqueRival.appendChild(crearElementoFicha('p', 'ficha-pendientes-titulo', 'Pendientes como rival'));
  bloqueRival.appendChild(crearElementoFicha(
    'p',
    'ficha-pendientes-lista',
    pendientesRival.length ? pendientesRival.map((id) => nombrePersona(id) || '—').join(', ') : 'Nadie pendiente'
  ));
  seccion.appendChild(bloqueRival);

  return seccion;
}

function construirEvolucionFicha(personId) {
  const seccion = crearElementoFicha('div', 'ficha-seccion');
  seccion.appendChild(crearElementoFicha('h3', null, 'Evolución de posición'));

  const evolucion = evolucionPosiciones(personId);
  if (!evolucion.length) {
    seccion.appendChild(crearElementoFicha('p', 'ficha-vacio', 'Aún no hay ninguna jornada completada.'));
    return seccion;
  }

  const texto = evolucion.map((e) => `J${e.jornadaNumero}: ${e.posicion}º`).join(' · ');
  seccion.appendChild(crearElementoFicha('p', 'ficha-evolucion-lista', texto));
  return seccion;
}

// Id de la persona cuya ficha está abierta ahora mismo (para el botón "Sacar
// imagen"). null cuando el modal está cerrado.
let fichaAbiertaPersonId = null;

function abrirFichaJugador(personId) {
  const stats = ordenarClasificacion(calcularClasificacion());
  const posicion = stats.findIndex((s) => s.id === personId) + 1;
  const datos = stats.find((s) => s.id === personId);
  if (!datos) return; // persona inexistente (estado manipulado a mano): no hay ficha que abrir

  const nombre = nombrePersona(personId);
  const cuerpo = document.getElementById('modal-ficha-cuerpo');
  cuerpo.innerHTML = '';
  cuerpo.appendChild(construirCabeceraFicha(personId, nombre, posicion));
  cuerpo.appendChild(construirResumenFicha(datos));
  cuerpo.appendChild(construirHistorialFicha(personId));
  cuerpo.appendChild(construirPendientesFicha(personId));
  cuerpo.appendChild(construirEvolucionFicha(personId));

  fichaAbiertaPersonId = personId;
  document.getElementById('modal-ficha-overlay').hidden = false;
}

function cerrarFichaJugador() {
  document.getElementById('modal-ficha-overlay').hidden = true;
  fichaAbiertaPersonId = null;
}

// Nombre de archivo apto para descarga a partir del nombre del jugador (sin
// acentos ni caracteres raros); si queda vacío (nombre en blanco), usa un
// nombre genérico para no producir un archivo sin extensión visible.
function slugArchivo(texto) {
  const slug = String(texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  return slug || 'jugador';
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

// Variante del modal con un campo de texto (nombres de liga, y desde la
// publicación de resultados también el token de GitHub). Devuelve el valor
// recortado por callback; el botón de confirmar queda deshabilitado mientras
// el campo esté vacío, así que nunca sale un valor en blanco.
//
// `opciones.password` (opcional, por defecto false) pone el input en
// type="password" para no dejar el token a la vista, y sube su maxlength
// (los tokens de GitHub superan los 40 caracteres del nombre de liga); al
// cerrar el modal se restaura SIEMPRE a type="text"/maxlength="40", así que
// la siguiente llamada (p. ej. "Nombre de la liga nueva") no hereda nada.
function mostrarModalTexto(mensaje, valorInicial, onConfirmar, opciones = {}) {
  const overlay = document.getElementById('modal-texto-overlay');
  const mensajeEl = document.getElementById('modal-texto-mensaje');
  const input = document.getElementById('modal-texto-input');
  const btnConfirmar = document.getElementById('modal-texto-confirmar');
  const btnCancelar = document.getElementById('modal-texto-cancelar');

  const esPassword = Boolean(opciones.password);
  input.type = esPassword ? 'password' : 'text';
  input.setAttribute('maxlength', esPassword ? '255' : '40');

  mensajeEl.textContent = mensaje;
  input.value = valorInicial;
  overlay.hidden = false;

  const sincronizar = () => {
    btnConfirmar.disabled = input.value.trim() === '';
  };
  sincronizar();

  const cerrar = () => {
    overlay.hidden = true;
    input.removeEventListener('input', sincronizar);
    input.removeEventListener('keydown', onTecla);
    btnConfirmar.removeEventListener('click', onConfirmarHandler);
    btnCancelar.removeEventListener('click', cerrar);
    input.type = 'text';
    input.setAttribute('maxlength', '40');
  };
  function onConfirmarHandler() {
    const valor = input.value.trim();
    if (!valor) return;
    cerrar();
    onConfirmar(valor);
  }
  function onTecla(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirmarHandler();
    } else if (e.key === 'Escape') {
      cerrar();
    }
  }

  input.addEventListener('input', sincronizar);
  input.addEventListener('keydown', onTecla);
  btnConfirmar.addEventListener('click', onConfirmarHandler);
  btnCancelar.addEventListener('click', cerrar);
  input.focus();
  input.select();
}

/* ============================================================
   ACCIONES DE UI
   ============================================================ */

// Mínimo funcional, no arbitrario: con 1 sola pareja por grupo no hay nadie
// contra quien jugar (generarCalendario produciría una liga con 0 partidos
// reales — ver notas de la sesión). 2 es el mínimo que da al menos 1 partido.
const MIN_PAREJAS = 2;

function nombresCompletos() {
  return ligaState.girls.every((n) => n.trim() !== '') &&
         ligaState.boys.every((n) => n.trim() !== '');
}

// Añadir/eliminar fila cambia cuántas personas hay, así que cualquier
// calendario ya generado queda con índices que no corresponden a nada —
// si ya había una liga generada, se avisa (mismo mecanismo que regenerar)
// antes de invalidarla.
function conConfirmacionSiHayLiga(mensaje, accion) {
  if (ligaState.liveGenerated) {
    mostrarModal(mensaje, accion);
  } else {
    accion();
  }
}

function agregarFila() {
  conConfirmacionSiHayLiga(
    'Añadir una pareja invalida el calendario ya generado y borrará los resultados actuales. ¿Continuar?',
    () => {
      ligaState.girls.push('');
      ligaState.boys.push('');
      ligaState.jornadas = [];
      ligaState.liveGenerated = false;
      guardarEstado();
      render();
    }
  );
}

function eliminarFila(idx) {
  if (ligaState.girls.length <= MIN_PAREJAS) return;
  conConfirmacionSiHayLiga(
    'Eliminar una pareja invalida el calendario ya generado y borrará los resultados actuales. ¿Continuar?',
    () => {
      ligaState.girls.splice(idx, 1);
      ligaState.boys.splice(idx, 1);
      ligaState.jornadas = [];
      ligaState.liveGenerated = false;
      guardarEstado();
      render();
    }
  );
}

function generarLiga() {
  if (!nombresCompletos()) {
    const total = ligaState.girls.length + ligaState.boys.length;
    alert(`Rellena los ${total} nombres (${ligaState.girls.length} en la Columna 1 y ${ligaState.boys.length} en la Columna 2) antes de generar la liga.`);
    return;
  }

  const ejecutar = () => {
    mostrarGenerando();
    // setTimeout con delay > 0 (no 0) para dar tiempo real al navegador a
    // pintar el overlay antes de que el cálculo síncrono bloquee el hilo
    // principal; el spinner (animación CSS de solo transform) sigue
    // corriendo en el compositor mientras tanto.
    setTimeout(() => {
      ligaState.jornadas = generarCalendario(ligaState.girls.length, ligaState.boys.length);
      ligaState.liveGenerated = true;
      guardarEstado();
      render();
      mostrarGenerado();
    }, 50);
  };

  if (ligaState.liveGenerated) {
    mostrarModal('Esto borrará los resultados actuales. ¿Continuar?', ejecutar);
  } else {
    ejecutar();
  }
}

/* ============================================================
   OVERLAY DE CARGA (generación de liga)
   ============================================================ */

function mostrarGenerando() {
  document.getElementById('loading-spinner').hidden = false;
  document.getElementById('loading-check').hidden = true;
  document.getElementById('loading-mensaje').innerHTML =
    'Generando<span class="puntos"><span>.</span><span>.</span><span>.</span></span>';
  document.getElementById('loading-aceptar').hidden = true;
  document.getElementById('loading-overlay').hidden = false;
}

function mostrarGenerado() {
  document.getElementById('loading-spinner').hidden = true;
  document.getElementById('loading-check').hidden = false;
  document.getElementById('loading-mensaje').textContent = 'Liga generada';
  document.getElementById('loading-aceptar').hidden = false;
}

function ocultarGenerando() {
  document.getElementById('loading-overlay').hidden = true;
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

// Validación de forma compartida entre importar JSON e importar por enlace:
// un objeto de liga válido tiene las columnas de nombres y una lista de
// jornadas (aunque esté vacía).
function formaValidaLiga(parsed) {
  return Boolean(parsed) &&
    Array.isArray(parsed.girls) &&
    Array.isArray(parsed.boys) &&
    ('jornadas' in parsed);
}

// Nombre para la liga que se crea al importar: el del archivo sin extensión
// si dice algo, y si no un nombre genérico.
function nombreLigaDesdeArchivo(nombreArchivo) {
  const base = String(nombreArchivo || '').replace(/\.json$/i, '').trim();
  return base ? base.slice(0, 40) : 'Liga importada';
}

// Importar ya no sobrescribe la liga activa: añade una liga nueva a la lista
// y la activa, así se pueden traer ligas de otros dispositivos sin perder
// las que ya hay en este navegador.
function importarJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!formaValidaLiga(parsed)) {
        throw new Error('forma invalida');
      }
      const nombre = nombreLigaDesdeArchivo(file.name);
      mostrarModal(`El archivo se añadirá como una liga nueva ("${nombre}") sin tocar las que ya tienes. ¿Continuar?`, () => {
        crearLiga(nombre, parsed);
      });
    } catch (err) {
      alert('El archivo no tiene un formato válido de liga.');
    }
  };
  reader.readAsText(file);
}

/* ============================================================
   COMPARTIR POR ENLACE (estado comprimido en el fragmento de la URL,
   sin servidor: CompressionStream/DecompressionStream nativas del
   navegador + base64url)
   ============================================================ */

const URL_PUBLICA_LIGA = 'https://mutxopadel.github.io/liga-padel-mutxo/';

// ArrayBuffer -> base64url (sin '+', '/' ni '=', apto para un fragmento de URL).
function bufferABase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binario = '';
  for (let i = 0; i < bytes.length; i++) binario += String.fromCharCode(bytes[i]);
  const base64 = btoa(binario);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// base64url -> ArrayBuffer (inverso de bufferABase64Url).
function base64UrlABuffer(base64url) {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) base64 += '=';
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes.buffer;
}

// Comprime un texto con deflate-raw y devuelve el ArrayBuffer resultante.
// Función pura además de asíncrona: no toca el DOM ni el estado global,
// testeable directamente desde Node (ver notas de verificación).
async function comprimirTexto(texto) {
  const stream = new Blob([texto]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Response(stream).arrayBuffer();
}

// Descomprime un ArrayBuffer/Uint8Array deflate-raw y devuelve el texto.
async function descomprimirABuffer(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const buffer = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buffer);
}

// Serializa un estado de liga a base64url comprimido, listo para meter en el hash.
async function comprimirEstadoABase64Url(estado) {
  const buffer = await comprimirTexto(JSON.stringify(estado));
  return bufferABase64Url(buffer);
}

// Inverso de comprimirEstadoABase64Url: de base64url a objeto de estado.
async function descomprimirBase64UrlAEstado(base64url) {
  const buffer = base64UrlABuffer(base64url);
  const json = await descomprimirABuffer(buffer);
  return JSON.parse(json);
}

function soportaCompressionStream() {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

// Compartir enlace (Fase 4): tras las comprobaciones de siempre (file://,
// soporte de CompressionStream), en vez de generar directamente el enlace
// editable se abre un modal para elegir entre "solo lectura" (#ver=) y
// "copia completa editable" (#liga=, igual que la Fase 2). Ambos usan
// exactamente el mismo payload comprimido — solo cambia el prefijo del hash.
async function compartirEnlace() {
  if (location.protocol === 'file:') {
    mostrarModal(
      `El enlace compartible solo funciona en la versión web publicada, no al abrir el archivo directamente. Usa ${URL_PUBLICA_LIGA} para compartir ligas por enlace.`,
      () => {}
    );
    return;
  }
  if (!soportaCompressionStream()) {
    mostrarModal('Este navegador no soporta la compresión necesaria para generar el enlace compartible.', () => {});
    return;
  }

  try {
    const datos = await comprimirEstadoABase64Url(ligaState);
    mostrarModalCompartir(datos);
  } catch (err) {
    console.error('Error al generar el enlace compartible', err);
    mostrarModal('No se ha podido generar el enlace compartible.', () => {});
  }
}

// Modal de elección de tipo de enlace. Reutiliza el patrón de los demás
// modales (overlay + listeners que se desenganchan al cerrar).
function mostrarModalCompartir(datosBase64) {
  const overlay = document.getElementById('modal-compartir-overlay');
  const btnLectura = document.getElementById('btn-enlace-lectura');
  const btnEditable = document.getElementById('btn-enlace-editable');
  const btnCancelar = document.getElementById('modal-compartir-cancelar');

  overlay.hidden = false;

  const cerrar = () => {
    overlay.hidden = true;
    btnLectura.removeEventListener('click', onLectura);
    btnEditable.removeEventListener('click', onEditable);
    btnCancelar.removeEventListener('click', cerrar);
  };
  function onLectura() {
    cerrar();
    copiarEnlaceGenerado('ver', datosBase64);
  }
  function onEditable() {
    cerrar();
    copiarEnlaceGenerado('liga', datosBase64);
  }

  btnLectura.addEventListener('click', onLectura);
  btnEditable.addEventListener('click', onEditable);
  btnCancelar.addEventListener('click', cerrar);
}

// Copia al portapapeles el enlace ya generado (mismo payload, prefijo según
// el tipo elegido) y da el mismo feedback visual de siempre en el botón.
async function copiarEnlaceGenerado(prefijo, datosBase64) {
  const btn = document.getElementById('btn-compartir');
  try {
    const url = `${location.origin}${location.pathname}#${prefijo}=${datosBase64}`;
    await navigator.clipboard.writeText(url);

    const textoOriginal = btn.textContent;
    btn.textContent = '¡Enlace copiado!';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = textoOriginal;
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error('Error al copiar el enlace compartible', err);
    mostrarModal('No se ha podido copiar el enlace compartible.', () => {});
  }
}

/* ============================================================
   PUBLICAR RESULTADOS (admin, Fase 2): sube la liga activa como
   `liga-oficial.json` al repo vía la API REST de contenidos de GitHub, para
   que `jugador.html` la sirva. El token del admin se guarda SOLO en este
   dispositivo, bajo su propia clave de localStorage (nunca junto al estado
   de las ligas ni en el repo).
   ============================================================ */

const TOKEN_STORAGE_KEY = 'padel-liga-mutxo-token';
const GITHUB_API_LIGA_OFICIAL = 'https://api.github.com/repos/mutxopadel/liga-padel-mutxo/contents/liga-oficial.json';

// Codifica un texto (JSON con acentos/ñ/emojis incluidos) a base64 de forma
// segura para Unicode: TextEncoder → bytes → base64. btoa(texto) a pelo
// revienta con cualquier carácter fuera de Latin1, así que NUNCA se usa
// directo sobre el JSON. Función pura y testeable desde Node: el base64 que
// devuelve, decodificado con Buffer.from(b64, 'base64').toString('utf8'),
// reproduce el texto original byte a byte.
function codificarBase64Utf8(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = '';
  bytes.forEach((byte) => { binario += String.fromCharCode(byte); });
  return btoa(binario);
}

function botonPublicar() {
  return document.getElementById('btn-publicar');
}

// Punto de entrada del botón. No-op en modo consulta (el botón no debería
// ni estar visible ahí, pero se corta también aquí por si acaso, igual que
// guardarEstado() se corta a sí mismo).
function publicarResultados() {
  if (modoConsulta) return;
  if (!localStorage.getItem(TOKEN_STORAGE_KEY)) {
    pedirTokenGitHub();
    return;
  }
  confirmarPublicacion();
}

// Modal de texto en modo password (Fase 2 de mostrarModalTexto) para pedir
// el token la primera vez (o después de que uno guardado quede invalidado).
function pedirTokenGitHub() {
  mostrarModalTexto(
    'Pega tu token de GitHub (se guarda solo en este dispositivo — ver README)',
    '',
    (token) => {
      localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
      confirmarPublicacion();
    },
    { password: true }
  );
}

function confirmarPublicacion() {
  mostrarModal(
    'Se publicará la liga activa como liga oficial, visible para todos. ¿Continuar?',
    ejecutarPublicacion
  );
}

// GET (para el sha si el archivo ya existe) → PUT (crea o sobrescribe) contra
// la API de contenidos de GitHub. Cabeceras y campos exactamente los de la
// API: Authorization Bearer, Accept vnd.github+json, y en el PUT
// message/content/sha.
async function ejecutarPublicacion() {
  const btn = botonPublicar();
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Publicando…';

  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  const cabeceras = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  };

  const restaurarBoton = () => {
    btn.disabled = false;
    btn.textContent = textoOriginal;
  };

  const tokenInvalido = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    restaurarBoton();
    mostrarModal(
      'Token inválido o caducado. Vuelve a pulsar Publicar para introducir uno nuevo.',
      () => {}
    );
  };

  const errorGenerico = (codigo) => {
    restaurarBoton();
    mostrarModal(`No se ha podido publicar (código ${codigo}).`, () => {});
  };

  try {
    const respuestaGet = await fetch(GITHUB_API_LIGA_OFICIAL, { headers: cabeceras });

    let sha;
    if (respuestaGet.status === 200) {
      const datosExistentes = await respuestaGet.json();
      sha = datosExistentes.sha;
    } else if (respuestaGet.status === 401 || respuestaGet.status === 403) {
      tokenInvalido();
      return;
    } else if (respuestaGet.status !== 404) {
      errorGenerico(respuestaGet.status);
      return;
    }

    const publicadoEl = new Date().toISOString();
    const contenido = { ...ligaState, publicadoEl };
    const cuerpoPut = {
      message: `Publica resultados — ${publicadoEl}`,
      content: codificarBase64Utf8(JSON.stringify(contenido, null, 2)),
    };
    if (sha) cuerpoPut.sha = sha;

    const respuestaPut = await fetch(GITHUB_API_LIGA_OFICIAL, {
      method: 'PUT',
      headers: { ...cabeceras, 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpoPut),
    });

    if (respuestaPut.status === 401 || respuestaPut.status === 403) {
      tokenInvalido();
      return;
    }
    if (!respuestaPut.ok) {
      errorGenerico(respuestaPut.status);
      return;
    }

    btn.textContent = 'Publicado ✓ (visible en ~1 min)';
    setTimeout(() => {
      btn.textContent = textoOriginal;
      btn.disabled = false;
    }, 3000);
  } catch (err) {
    console.error('Error al publicar la liga', err);
    restaurarBoton();
    mostrarModal('Sin conexión: no se ha podido publicar.', () => {});
  }
}

// Al cargar la página con un hash "#liga=..." o "#ver=...": descomprime y
// valida con la MISMA validación de forma que importarJSON. "#liga=" sigue
// funcionando exactamente igual que en la Fase 2/3 (importa como liga nueva
// tras confirmación). "#ver=" entra en modo consulta (ver manejarHashVer).
async function manejarHashCompartido() {
  const hash = location.hash;

  if (hash.startsWith('#ver=')) {
    await manejarHashVer(hash.slice('#ver='.length));
    return;
  }

  if (!hash.startsWith('#liga=')) return;

  const datosHash = hash.slice('#liga='.length);
  const limpiarHash = () => history.replaceState(null, '', location.pathname + location.search);

  let estado;
  try {
    estado = await descomprimirBase64UrlAEstado(datosHash);
    if (!formaValidaLiga(estado)) throw new Error('forma invalida');
  } catch (err) {
    console.warn('Enlace de liga corrupto o inválido.', err);
    limpiarHash();
    mostrarModal('El enlace no contiene una liga válida; no se ha importado nada.', () => {});
    return;
  }

  limpiarHash();
  mostrarModal('¿Importar la liga del enlace? Se añadirá como una liga nueva sin tocar las que ya tienes.', () => {
    crearLiga('Liga importada', estado);
  });
}

// "#ver=...": modo consulta. A diferencia de "#liga=" NO se pregunta nada,
// NO se toca `appState` ni localStorage, y el hash NO se limpia (así
// recargar la página o reenviar la URL tal cual sigue funcionando). Un
// enlace corrupto recibe el MISMO tratamiento que un "#liga=" corrupto: aviso,
// se limpia el hash y la app queda utilizable en su estado normal.
async function manejarHashVer(datosHash) {
  let estado;
  try {
    estado = await descomprimirBase64UrlAEstado(datosHash);
    if (!formaValidaLiga(estado)) throw new Error('forma invalida');
  } catch (err) {
    console.warn('Enlace de solo lectura corrupto o inválido.', err);
    history.replaceState(null, '', location.pathname + location.search);
    mostrarModal('El enlace no contiene una liga válida; no se ha podido abrir.', () => {});
    return;
  }

  modoConsulta = true;
  ligaState = normalizarLiga(estado);
  activarModoConsulta();
}

// Ajusta la UI para el modo consulta: banner visible, pestaña/sección
// Jugadores y barra de ligas ocultas, pestaña activa inicial = Jornadas, y
// vuelve a renderizar (ya con modoConsulta=true, así que render()/
// crearInputSet()/crearPartidoCard() toman automáticamente el camino de
// solo lectura).
function activarModoConsulta() {
  document.getElementById('banner-modo-consulta').hidden = false;
  document.querySelector('.tab-btn[data-tab="jugadores"]').hidden = true;
  document.getElementById('ligas-barra').hidden = true;
  // Pestaña Jugadores oculta, pero Jornadas sí se ve en consulta — y ahí
  // vive ahora #btn-publicar (Remate). ?. porque jugador.html no tiene esta
  // fila (misma función no se llama ahí, pero por si el selector cambia).
  document.querySelector('.acciones-jornadas')?.setAttribute('hidden', '');
  activarTab('jornadas');
  render();
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
   APP DE JUGADOR (`jugador.html`)

   Misma app, misma lógica: `jugador.html` carga este mismo `app.js` con
   `<body data-pagina="jugador">` y lo único que cambia es el arranque —
   modo consulta desde el primer instante (todas las salvaguardas de la
   Fase 4) y, en vez de leer localStorage, se descarga la liga que el admin
   ha publicado en `liga-oficial.json` dentro del propio sitio.

   Aquí NO se toca en ningún momento la clave `padel-liga-mutxo-v1`: no se
   llama a cargarEstado() y guardarEstado() está cortado por modoConsulta,
   así que las ligas del admin (si este navegador es también el suyo) quedan
   intactas byte a byte.
   ============================================================ */

const ARCHIVO_LIGA_OFICIAL = '../liga-oficial.json';

// Mensajes de la página de jugador. No hay modales de aviso en esta página:
// se escribe en un párrafo fijo bajo la cabecera, siempre con textContent.
function mostrarMensajeJugador(texto) {
  const el = document.getElementById('mensaje-jugador');
  if (!el) return;
  el.textContent = texto;
  el.hidden = false;
}

function ocultarMensajeJugador() {
  const el = document.getElementById('mensaje-jugador');
  if (el) el.hidden = true;
}

// "Actualizado: <fecha legible>" a partir del campo opcional `publicadoEl`
// (ISO) del JSON publicado. Si el campo no viene o no es una fecha válida,
// la línea sencillamente no se muestra.
function mostrarFechaPublicacion(publicadoEl) {
  const linea = document.getElementById('actualizado-jugador');
  if (!linea) return;
  if (typeof publicadoEl !== 'string' || !publicadoEl) return;
  const fecha = new Date(publicadoEl);
  if (Number.isNaN(fecha.getTime())) return;
  linea.textContent = `Actualizado: ${fecha.toLocaleString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
  linea.hidden = false;
}

// Descarga la liga publicada por el admin y la pinta. `cache: 'no-store'`
// para que el navegador no sirva una versión vieja de su propia caché HTTP;
// del respaldo offline se encarga el service worker (red primero con
// fallback a la copia cacheada), así que un fallo de red aquí significa que
// no hay red Y no hay copia guardada.
async function cargarLigaOficial() {
  let respuesta;
  try {
    respuesta = await fetch(ARCHIVO_LIGA_OFICIAL, { cache: 'no-store' });
  } catch (err) {
    console.warn('No se ha podido descargar la liga publicada.', err);
    mostrarMensajeJugador('Sin conexión. Vuelve a intentarlo con internet.');
    return;
  }

  if (respuesta.status === 404) {
    mostrarMensajeJugador('El administrador aún no ha publicado la liga.');
    return;
  }

  let estado;
  try {
    if (!respuesta.ok) throw new Error(`respuesta ${respuesta.status}`);
    estado = await respuesta.json();
    // formaValidaLiga solo exige girls/boys/jornadas: el campo extra
    // `publicadoEl` que añade la publicación pasa sin problema.
    if (!formaValidaLiga(estado)) throw new Error('forma invalida');
  } catch (err) {
    console.warn('La liga publicada no se ha podido leer.', err);
    mostrarMensajeJugador('La liga publicada no se ha podido leer.');
    return;
  }

  ligaState = normalizarLiga(estado);
  ocultarMensajeJugador();
  mostrarFechaPublicacion(estado.publicadoEl);
  render();
}

/* ============================================================
   INICIALIZACIÓN

   Dos arranques distintos sobre el MISMO código: `index.html` (admin) e
   `jugador.html`. Los listeners se registran por página — cada bloque solo
   se llama desde la página cuyos elementos existen — en vez de sembrar
   null-checks por todas partes.
   ============================================================ */

function init() {
  if (document.body.dataset.pagina === 'jugador') {
    initJugador();
    return;
  }
  initAdmin();
}

// Arranque de `index.html`: el de siempre.
function initAdmin() {
  cargarEstado();
  render();

  registrarListenersComunes();
  registrarListenersAdmin();

  manejarHashCompartido();
  registrarServiceWorker();
}

// Arranque de `jugador.html`: solo lectura desde el primer instante y la
// liga viene de `liga-oficial.json`, no de localStorage.
function initJugador() {
  modoConsulta = true;

  registrarListenersComunes();
  registrarListenersJugador();
  registrarServiceWorker();

  cargarLigaOficial();
}

// Listeners de elementos que existen en las DOS páginas.
function registrarListenersComunes() {
  document.getElementById('tab-nav').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    activarTab(btn.dataset.tab);
  });

  document.getElementById('btn-imagen-clasificacion').addEventListener('click', () => {
    const fecha = new Date().toISOString().slice(0, 10);
    capturarImagen(document.getElementById('clasificacion-capturable'), `clasificacion-padel-mutxo-${fecha}`);
  });

  // Ficha de jugador (Fase 5): botón "Cerrar" y clic fuera del cuadro (el
  // resto de modales de la app no cierra con clic fuera; se añade solo aquí).
  document.getElementById('modal-ficha-cerrar').addEventListener('click', cerrarFichaJugador);
  document.getElementById('modal-ficha-overlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) cerrarFichaJugador();
  });
  document.getElementById('modal-ficha-imagen').addEventListener('click', () => {
    if (!fichaAbiertaPersonId) return;
    const nombre = nombrePersona(fichaAbiertaPersonId);
    capturarImagen(document.getElementById('modal-ficha'), `ficha-${slugArchivo(nombre)}-padel-mutxo`);
  });
}

// Listeners de los controles de gestión, que solo existen en `index.html`.
function registrarListenersAdmin() {
  document.getElementById('selector-liga').addEventListener('change', (e) => {
    activarLiga(e.target.value);
  });
  document.getElementById('btn-liga-nueva').addEventListener('click', nuevaLiga);
  document.getElementById('btn-liga-renombrar').addEventListener('click', renombrarLigaActiva);
  document.getElementById('btn-liga-eliminar').addEventListener('click', eliminarLigaActiva);

  document.getElementById('btn-agregar-fila').addEventListener('click', agregarFila);
  document.getElementById('btn-generar-liga').addEventListener('click', generarLiga);
  document.getElementById('loading-aceptar').addEventListener('click', ocultarGenerando);
  document.getElementById('btn-exportar').addEventListener('click', exportarJSON);
  document.getElementById('btn-compartir').addEventListener('click', compartirEnlace);
  document.getElementById('btn-publicar').addEventListener('click', publicarResultados);
  document.getElementById('input-importar').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importarJSON(file);
    e.target.value = '';
  });
}

// Botón "Actualizar" de jugador.html, junto a la línea "Actualizado: …":
// fuerza una nueva descarga de liga-oficial.json sin recargar la página.
// cargarLigaOficial() ya gestiona los mensajes de error y repinta la fecha;
// aquí solo se cuida el estado visual del botón, siempre restaurado al
// terminar (éxito o error) con try/finally.
function registrarListenersJugador() {
  const btnActualizar = document.getElementById('btn-actualizar-jugador');
  const textoOriginal = btnActualizar.textContent;
  btnActualizar.addEventListener('click', async () => {
    btnActualizar.disabled = true;
    btnActualizar.textContent = 'Actualizando…';
    try {
      await cargarLigaOficial();
    } finally {
      btnActualizar.disabled = false;
      btnActualizar.textContent = textoOriginal;
    }
  });
}

// PWA (Fase 6): solo se registra el service worker cuando la app se sirve
// por https o localhost. Por file:// (doble clic) no se registra nada y
// todo sigue funcionando exactamente igual que antes.
function registrarServiceWorker() {
  const protocoloValido = location.protocol === 'https:' ||
    location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if ('serviceWorker' in navigator && protocoloValido) {
    // El SW vive en la raíz del sitio. `index.html` lo registra desde ahí
    // mismo; `jugador/index.html` está una carpeta por debajo y lo registra
    // con ruta relativa '../sw.js' — sigue siendo válido y el scope por
    // defecto (la raíz) cubre igualmente `jugador/`.
    const ruta = document.body.dataset.pagina === 'jugador' ? '../sw.js' : 'sw.js';
    navigator.serviceWorker.register(ruta).catch((err) => {
      console.warn('No se pudo registrar el service worker:', err);
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
