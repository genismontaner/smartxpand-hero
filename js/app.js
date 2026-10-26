// =============================================================
// SmartXpand · Mapa de oportunidad
// Pas 4.2: mapa base amb hexàgons, límit municipal i clubs
// =============================================================

// 1. Crea el mapa dins del <div id="mapa">, centrat a Barcelona
const mapa = L.map("mapa").setView([41.39, 2.16], 12);

// 2. Mapa base gris de l'IGN (Instituto Geográfico Nacional, llicència CC BY 4.0)
//    Servei WMTS: el mapa es demana en "rajoles" (imatges petites) per zoom, columna i fila
L.tileLayer(
  "https://www.ign.es/wmts/ign-base?service=WMTS&request=GetTile&version=1.0.0" +
    "&layer=IGNBase-gris&style=default&tilematrixset=GoogleMapsCompatible&format=image/jpeg" +
    "&TileMatrix={z}&TileRow={y}&TileCol={x}",
  {
    attribution: 'Mapa base: <a href="https://www.ign.es">© Instituto Geográfico Nacional</a>',
    maxZoom: 19,
  }
).addTo(mapa);

// Panell (capa de dibuix) per sobre dels hexàgons: clubs i cercle de 800 m
mapa.createPane("superior");
mapa.getPane("superior").style.zIndex = 450;

const NAVY = "#051C2C";
const GRIS_COMPETENCIA = "#868e96";

// Llegeix un fitxer GeoJSON i el retorna com a objecte de JavaScript
async function carregaGeoJSON(ruta) {
  const resposta = await fetch(ruta);
  return resposta.json();
}

// Estil de cada club: VivaGym en navy i més gran; la competència en gris
function estilClub(club) {
  const esPropi = club.properties.marca === "VivaGym";
  const esPrevist = club.properties.estat === "previst";
  return {
    radius: esPropi ? 6 : 4,
    color: "#ffffff",
    weight: 1,
    fillColor: esPropi ? NAVY : GRIS_COMPETENCIA,
    fillOpacity: esPrevist ? 0.4 : 1,
  };
}

// Estil de cada hexàgon segons la seva classe.
// Els descartats per regla prèvia (Collserola, port...) gairebé transparents perquè no distreguin.
function estilHexagon(hex, colors) {
  const p = hex.properties;
  const perRegla = p.motiu !== null;
  return {
    color: "#ffffff",
    weight: 0.5,
    fillColor: colors[p.classe],
    fillOpacity: perRegla ? 0.15 : 0.7,
  };
}

// Escriu a la consola del navegador quants hexàgons hi ha de cada classe (per revisar)
function resumeixClasses(hexagons) {
  const recompte = {};
  for (const hex of hexagons.features) {
    const p = hex.properties;
    const clau = p.motiu ? `${p.classe} (regla prèvia)` : p.classe;
    recompte[clau] = (recompte[clau] || 0) + 1;
  }
  console.table(recompte);
}

// --- Llegenda ---
// Un "control" de Leaflet és un element HTML col·locat damunt del mapa, en una cantonada
function afegeixLlegenda(config) {
  const llegenda = L.control({ position: "bottomleft" });
  llegenda.onAdd = () => {
    const div = L.DomUtil.create("div", "llegenda");
    const classes = config.classes
      .map((c) => `<div><span class="mostra" style="background:${c.color}"></span>${c.etiqueta[0] + c.etiqueta.slice(1).toLowerCase()}</div>`)
      .join("");
    div.innerHTML = `
      <strong>Clasificación</strong>
      ${classes}
      <div><span class="mostra" style="background:${config.classes.at(-1).color};opacity:0.3"></span>Descartado por regla previa</div>
      <strong>Clubes</strong>
      <div><span class="punt" style="background:${NAVY};width:12px;height:12px"></span>${config.marca_propia}</div>
      <div><span class="punt" style="background:${GRIS_COMPETENCIA}"></span>Competencia</div>
      <div><span class="punt" style="background:${GRIS_COMPETENCIA};opacity:0.4"></span>Apertura prevista</div>
      <div><span class="cercle"></span>Radio de ${config.radi_m} m</div>
    `;
    return div;
  };
  llegenda.addTo(mapa);
}

// --- Selecció d'un hexàgon ---
let seleccionat = null; // capa de l'hexàgon seleccionat
let cercle = null; // cercle de 800 m dibuixat al mapa

function selecciona(capa, capaHexagons, config) {
  desselecciona(capaHexagons, config);
  seleccionat = capa;

  // Ressalta l'hexàgon amb una vora navy gruixuda
  capa.setStyle({ color: NAVY, weight: 3 });
  capa.bringToFront();

  // Cercle de 800 m des del centre de l'hexàgon
  const centre = capa.getBounds().getCenter();
  cercle = L.circle(centre, {
    radius: config.radi_m,
    pane: "superior",
    color: NAVY,
    weight: 1.5,
    dashArray: "6 6",
    fill: false,
    interactive: false, // no captura clics: es pot clicar l'hexàgon de sota
  }).addTo(mapa);

  mostraPanellHexagon(capa.feature.properties, config, () => desselecciona(capaHexagons, config));
}

function desselecciona(capaHexagons, config) {
  if (seleccionat) capaHexagons.resetStyle(seleccionat);
  if (cercle) cercle.remove();
  seleccionat = null;
  cercle = null;
  mostraPanellInicial(config);
}

// 3. Carrega les dades i les afegeix al mapa
async function inicia() {
  const hexagons = await carregaGeoJSON("data/hexagons.geojson");
  const limit = await carregaGeoJSON("data/limit_municipal.geojson");
  const clubs = await carregaGeoJSON("data/clubs.geojson");
  const config = await carregaGeoJSON("config/scoring.json");

  // Puntuació i classe de cada hexàgon (js/puntuacio.js)
  calculaPuntuacions(hexagons, config);
  resumeixClasses(hexagons);

  // Hexàgons pintats segons la classe (colors de scoring.json)
  const colors = {};
  for (const c of config.classes) colors[c.id] = c.color;

  const capaHexagons = L.geoJSON(hexagons, {
    // 'style' també pot ser una funció: Leaflet la crida per a cada hexàgon
    style: (hex) => estilHexagon(hex, colors),
    // 'onEachFeature' s'executa per a cada hexàgon: hi afegim l'esdeveniment de clic
    onEachFeature: (hex, capa) => {
      capa.on("click", () => selecciona(capa, capaHexagons, config));
    },
  }).addTo(mapa);

  // Panell inicial (sense cap hexàgon seleccionat) i llegenda
  mostraPanellInicial(config);
  afegeixLlegenda(config);

  // Límit municipal: només la línia, sense farciment
  const capaLimit = L.geoJSON(limit, {
    style: { color: NAVY, weight: 2, fill: false },
  }).addTo(mapa);

  // Clubs: cada punt es dibuixa com un cercle, al panell superior
  L.geoJSON(clubs, {
    pointToLayer: (club, posicio) =>
      L.circleMarker(posicio, { ...estilClub(club), pane: "superior" }),
  }).addTo(mapa);

  // Ajusta la vista perquè es vegi tota la ciutat
  mapa.fitBounds(capaLimit.getBounds());
}

inicia();
