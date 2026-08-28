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

function importarJSON(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!formaValidaLiga(parsed)) {
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
   COMPARTIR POR ENLACE (estado comprimido en el fragmento de la URL,
   sin servidor: CompressionStream/DecompressionStream nativas del
   navegador + base64url)
   ============================================================ */

const URL_PUBLICA_LIGA = 'https://ilusiacards.github.io/liga-padel-mutxo/';

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

  const btn = document.getElementById('btn-compartir');
  try {
    const datos = await comprimirEstadoABase64Url(ligaState);
    const url = `${location.origin}${location.pathname}#liga=${datos}`;
    await navigator.clipboard.writeText(url);

    const textoOriginal = btn.textContent;
    btn.textContent = '¡Enlace copiado!';
    btn.disabled = true;
    setTimeout(() => {
      btn.textContent = textoOriginal;
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error('Error al generar el enlace compartible', err);
    mostrarModal('No se ha podido generar el enlace compartible.', () => {});
  }
}

// Al cargar la página con un hash "#liga=...": descomprime, valida con la
// MISMA validación de forma que importarJSON, y pregunta antes de sustituir
// el estado actual. El hash se limpia SIEMPRE (enlace válido o no, se acepte
// o se cancele) para que un refresco de página no vuelva a disparar la
// importación ni deje el enlace "colgado" en la barra de direcciones.
async function manejarHashCompartido() {
  const hash = location.hash;
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
  mostrarModal('¿Importar la liga del enlace? Sustituirá a la actual.', () => {
    ligaState = estado;
    guardarEstado();
    render();
  });
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

  document.getElementById('btn-agregar-fila').addEventListener('click', agregarFila);
  document.getElementById('btn-generar-liga').addEventListener('click', generarLiga);
  document.getElementById('loading-aceptar').addEventListener('click', ocultarGenerando);
  document.getElementById('btn-exportar').addEventListener('click', exportarJSON);
  document.getElementById('btn-compartir').addEventListener('click', compartirEnlace);
  document.getElementById('btn-imagen-clasificacion').addEventListener('click', () => {
    const fecha = new Date().toISOString().slice(0, 10);
    capturarImagen(document.getElementById('clasificacion-capturable'), `clasificacion-padel-mutxo-${fecha}`);
  });
  document.getElementById('input-importar').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importarJSON(file);
    e.target.value = '';
  });

  manejarHashCompartido();
}

document.addEventListener('DOMContentLoaded', init);
