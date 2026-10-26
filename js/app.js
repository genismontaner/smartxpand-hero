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

// 3. Carrega les dades i les afegeix al mapa
async function inicia() {
  const hexagons = await carregaGeoJSON("data/hexagons.geojson");
  const limit = await carregaGeoJSON("data/limit_municipal.geojson");
  const clubs = await carregaGeoJSON("data/clubs.geojson");

  // Hexàgons (de moment, tots del mateix color)
  L.geoJSON(hexagons, {
    style: { color: NAVY, weight: 0.3, fillColor: NAVY, fillOpacity: 0.08 },
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
