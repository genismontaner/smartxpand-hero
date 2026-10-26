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

// Colors provisionals (al pas 5 els hexàgons es pintaran per classe)
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

  L.geoJSON(hexagons, {
    // 'style' també pot ser una funció: Leaflet la crida per a cada hexàgon
    style: (hex) => estilHexagon(hex, colors),
  }).addTo(mapa);

  // Límit municipal: només la línia, sense farciment
  const capaLimit = L.geoJSON(limit, {
    style: { color: NAVY, weight: 2, fill: false },
  }).addTo(mapa);

  // Clubs: cada punt es dibuixa com un cercle
  L.geoJSON(clubs, {
    pointToLayer: (club, posicio) => L.circleMarker(posicio, estilClub(club)),
  }).addTo(mapa);

  // Ajusta la vista perquè es vegi tota la ciutat
  mapa.fitBounds(capaLimit.getBounds());
}

inicia();
