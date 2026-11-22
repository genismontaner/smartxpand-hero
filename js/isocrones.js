// =============================================================
// v1 · Pas 6 · Àrees de captació: radi o isòcrona
// Una "àrea" és un objecte que diu quines cel·les i quins clubs
// en formen part. Pot ser un radi en línia recta o una isòcrona
// (a peu o en cotxe) calculada amb OpenRouteService (ORS).
//   { tipus: "radi", lat, lon, radiM, caixa }
//   { tipus: "isocrona", lat, lon, geometria, caixa }
// 'caixa' = rectangle que la conté [latMin, lonMin, latMax, lonMax]:
// serveix per descartar ràpidament el que queda lluny.
// =============================================================

const isocrones = {
  clau: null, // clau d'ORS (només en local: config/ors_clau.txt no es publica)
  propies: new Map(), // isòcrones precalculades dels centres propis: "nom|mode|minuts" → àrea
  dataPropies: null, // data de càlcul de les precalculades
  memoria: new Map(), // isòcrones dels locals candidats ja demanades: clau → àrea o { error }
  pendents: new Set(), // peticions en curs (per no repetir-les)
};

// Temps que s'ofereixen per a cada mode (decisió del 22/11/2026: en cotxe, 10 i 15 min
// surten de la zona amb dades)
const MODES_ISOCRONA = {
  a_pie: { etiqueta: "A pie", perfil: "foot-walking", minuts: [5, 10, 15] },
  coche: { etiqueta: "En coche", perfil: "driving-car", minuts: [5] },
};

const ATRIBUCIO_ORS = '<a href="https://openrouteservice.org">© openrouteservice.org by HeiGIT</a> · '
  + 'red viaria © colaboradores de OpenStreetMap';

// Carrega la clau (si n'hi ha) i les isòcrones dels centres propis
async function carregaIsocrones() {
  try {
    const resposta = await fetch("config/ors_clau.txt", { cache: "no-cache" });
    const text = resposta.ok ? (await resposta.text()).trim() : "";
    // Una clau és un text llarg sense espais; si el servidor torna una pàgina d'error, no ho és
    isocrones.clau = text && !/\s|</.test(text) ? text : null;
  } catch {
    isocrones.clau = null;
  }
  if (!isocrones.clau) return; // sense clau no es mostren les isòcrones

  const json = await carregaGeoJSON("data/isocrones_propis.geojson");
  for (const f of json.features) {
    const p = f.properties;
    isocrones.propies.set(`${p.nom}|${p.mode}|${p.minuts}`, areaIsocrona(p.lat, p.lon, f.geometry));
    isocrones.dataPropies = p.data_consulta;
  }
}

function isocronesDisponibles() {
  return Boolean(isocrones.clau) && isocrones.propies.size > 0;
}

// --- Construcció d'àrees ---

function areaRadi(lat, lon, radiM) {
  const dLat = radiM / 111320;
  const dLon = radiM / (111320 * Math.cos((lat * Math.PI) / 180));
  return { tipus: "radi", lat, lon, radiM, caixa: [lat - dLat, lon - dLon, lat + dLat, lon + dLon] };
}

function areaIsocrona(lat, lon, geometria) {
  const caixa = [Infinity, Infinity, -Infinity, -Infinity];
  const anells = geometria.type === "Polygon" ? geometria.coordinates : geometria.coordinates.flat();
  for (const anell of anells) {
    for (const [x, y] of anell) {
      caixa[0] = Math.min(caixa[0], y); caixa[1] = Math.min(caixa[1], x);
      caixa[2] = Math.max(caixa[2], y); caixa[3] = Math.max(caixa[3], x);
    }
  }
  return { tipus: "isocrona", lat, lon, geometria, caixa };
}

// Cert si el punt (lat, lon) és dins de l'àrea
function conte(area, lat, lon) {
  const c = area.caixa;
  if (lat < c[0] || lat > c[2] || lon < c[1] || lon > c[3]) return false;
  if (area.tipus === "radi") return distanciaM(area.lat, area.lon, lat, lon) <= area.radiM;
  return dinsPoligon(area.geometria, lat, lon); // js/avaluacio.js
}

// Cert si els rectangles de dues àrees es toquen (abans de mirar res més)
function caixesEsToquen(a, b) {
  return a.caixa[0] <= b.caixa[2] && b.caixa[0] <= a.caixa[2]
    && a.caixa[1] <= b.caixa[3] && b.caixa[1] <= a.caixa[3];
}

// --- Àrea segons els paràmetres actuals ---

// Àrea d'un centre propi (radi, o la seva isòcrona precalculada)
function areaPropi(club) {
  const [lon, lat] = club.geometry.coordinates;
  if (avaluacio.tipusArea === "radi") return areaRadi(lat, lon, avaluacio.radiKm * 1000);
  return isocrones.propies.get(`${club.properties.nom}|${avaluacio.modeIso}|${avaluacio.minuts}`);
}

// Àrea d'un local candidat. Retorna l'àrea, { error } o null si la isòcrona encara s'està calculant
function areaCandidat(lat, lon) {
  if (avaluacio.tipusArea === "radi") return areaRadi(lat, lon, avaluacio.radiKm * 1000);
  const clau = `${avaluacio.modeIso}|${avaluacio.minuts}|${lat.toFixed(5)}|${lon.toFixed(5)}`;
  if (isocrones.memoria.has(clau)) return isocrones.memoria.get(clau);
  demanaIsocrones(lat, lon, avaluacio.modeIso);
  return null;
}

// Demana a ORS totes les isòcrones d'un mode per a un punt (una sola petició: 5, 10 i 15 min
// a peu). Quan arriben, es redibuixa el mapa i el panell.
async function demanaIsocrones(lat, lon, mode) {
  const posicio = `${lat.toFixed(5)}|${lon.toFixed(5)}`;
  const pendent = `${mode}|${posicio}`;
  if (isocrones.pendents.has(pendent)) return;
  isocrones.pendents.add(pendent);
  const minuts = MODES_ISOCRONA[mode].minuts;
  const desa = (min, valor) => isocrones.memoria.set(`${mode}|${min}|${posicio}`, valor);

  try {
    const resposta = await fetch(`https://api.openrouteservice.org/v2/isochrones/${MODES_ISOCRONA[mode].perfil}`, {
      method: "POST",
      headers: { Authorization: isocrones.clau, "Content-Type": "application/json" },
      body: JSON.stringify({ locations: [[lon, lat]], range: minuts.map((m) => m * 60) }),
    });
    if (!resposta.ok) throw new Error(resposta.status);
    const dades = await resposta.json();
    for (const f of dades.features) desa(Math.round(f.properties.value / 60), areaIsocrona(lat, lon, f.geometry));
  } catch (error) {
    // 400/404: punt sense carrers a prop; 403/429: quota exhaurida. Atenció: quan la quota
    // s'esgota, ORS respon sense capçaleres CORS i el navegador només veu "Failed to fetch"
    // (no se'n pot llegir el codi): per això el missatge general també esmenta el cupo.
    const codi = error.message;
    const text = codi === "403" || codi === "429"
      ? "Se ha agotado el cupo de isócronas de OpenRouteService. Usa el radio o vuelve a intentarlo más tarde."
      : codi === "400" || codi === "404"
        ? "No se puede calcular la isócrona desde este punto (no hay calles cerca)."
        : "OpenRouteService no responde o se ha agotado el cupo de isócronas. Usa el radio o vuelve a intentarlo más tarde.";
    for (const m of minuts) desa(m, { error: text });
  }
  isocrones.pendents.delete(pendent);
  if (!document.body.classList.contains("mode-avaluar")) return;
  actualitzaMapaAvaluacio();
  mostraResultatsAvaluacio();
}

// --- Textos ---

// Descripció de l'àrea, per a tots els textos: "radio de 1,5 km en línea recta"
function textArea() {
  if (avaluacio.tipusArea === "radi") return `radio de ${decimal(avaluacio.radiKm)} km en línea recta`;
  return `isócrona de ${avaluacio.minuts} min ${MODES_ISOCRONA[avaluacio.modeIso].etiqueta.toLowerCase()}`;
}

function fontIsocrones() {
  const [any, mes, dia] = (isocrones.dataPropies || "").split("-");
  return `Isócronas: openrouteservice.org (HeiGIT), red viaria de OpenStreetMap.
    Centros propios calculados el ${dia}/${mes}/${any}; este local, al seleccionarlo.`;
}

// Atribució obligatòria d'ORS al mapa, només quan es fan servir isòcrones
function actualitzaAtribucio() {
  const usa = document.body.classList.contains("mode-avaluar") && avaluacio.tipusArea === "isocrona";
  mapa.attributionControl.removeAttribution(ATRIBUCIO_ORS);
  if (usa) mapa.attributionControl.addAttribution(ATRIBUCIO_ORS);
}

// --- Zona amb dades ---

// Distància en metres d'un punt al segment AB (en un pla local, prou precís a pocs km)
function distanciaSegmentM(lat, lon, a, b) {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180);
  const ky = 110540;
  const ax = (a[0] - lon) * kx, ay = (a[1] - lat) * ky;
  const bx = (b[0] - lon) * kx, by = (b[1] - lat) * ky;
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

// Cert si alguna part de la isòcrona queda més enllà de la zona amb dades (Barcelona + 3 km)
function foraZonaDades(area, franjaM = 3000) {
  if (area.tipus !== "isocrona") return false;
  const vores = [];
  for (const f of avaluacio.limit.features) {
    const g = f.geometry;
    const poligons = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poligon of poligons) vores.push(poligon[0]);
  }
  const anells = area.geometria.type === "Polygon" ? area.geometria.coordinates : area.geometria.coordinates.flat();
  for (const [lon, lat] of anells[0]) {
    if (dinsDelLimit(lat, lon)) continue;
    let minim = Infinity;
    for (const anell of vores) {
      for (let i = 1; i < anell.length && minim > franjaM; i++) {
        minim = Math.min(minim, distanciaSegmentM(lat, lon, anell[i - 1], anell[i]));
      }
    }
    if (minim > franjaM) return true;
  }
  return false;
}
