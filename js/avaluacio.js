// =============================================================
// v1 · Pasos 2 i 3 · Mode "Evaluar un local"
// L'usuari clica un punt del mapa; es calcula l'àrea (radi en km)
// sumant les cel·les de la graella de població de 100 m, i es
// compten els clubs de cada segment i els centres propis.
// =============================================================

const avaluacio = {
  punt: null, // L.latLng del local candidat
  radiKm: 1.5,
  edatDes: "e20_24",
  edatFins: "e60_64",
  graella: null, // cel·les de data/poblacio_100m.json
  fontsGraella: [],
  trams: [], // noms dels trams d'edat, en ordre
  clubs: null, // data/clubs_segments.geojson
  limit: null, // contorn de Barcelona (per avisar si el punt hi és fora)
  capa: null, // grup de capes del mode (punt, cercles, clubs)
  capaClubs: null,
};

// Segments de competència: etiqueta i estil al mapa (sense colors nous: grisos i navy)
const SEGMENTS = {
  "low cost": { etiqueta: "Low cost", estil: { fillColor: "#495057", fillOpacity: 1, color: "#ffffff", weight: 1, radius: 5 } },
  "municipal": { etiqueta: "Centros municipales", estil: { fillColor: "#adb5bd", fillOpacity: 1, color: "#ffffff", weight: 1, radius: 4 } },
  "gama media": { etiqueta: "Gama media", estil: { fillColor: "#ffffff", fillOpacity: 1, color: "#495057", weight: 2, radius: 4 } },
  "premium": { etiqueta: "Premium", estil: { fillColor: "#ffffff", fillOpacity: 1, color: "#051C2C", weight: 2.5, radius: 5 } },
};

// Distància aproximada en metres entre dos punts (prou precisa per a pocs km)
function distanciaM(lat1, lon1, lat2, lon2) {
  const radiTerra = 6371000;
  const graus = Math.PI / 180;
  const x = (lon2 - lon1) * graus * Math.cos(((lat1 + lat2) / 2) * graus) * radiTerra;
  const y = (lat2 - lat1) * graus * radiTerra;
  return Math.hypot(x, y);
}

// Cert si el punt és dins del contorn de Barcelona (mètode del raig: es compten els creuaments)
function dinsDelLimit(lat, lon) {
  let dins = false;
  for (const f of avaluacio.limit.features) {
    const g = f.geometry;
    // Polygon → un polígon; MultiPolygon → diversos; qualsevol altra cosa s'ignora
    const poligons = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poligon of poligons) {
      const anell = poligon[0];
      for (let i = 0, j = anell.length - 1; i < anell.length; j = i++) {
        const [xi, yi] = anell[i];
        const [xj, yj] = anell[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dins = !dins;
      }
    }
  }
  return dins;
}

// Converteix el JSON compacte en una llista d'objectes fàcils de fer servir
function preparaGraella(json) {
  const camps = json.camps;
  const i = (nom) => camps.indexOf(nom);
  avaluacio.trams = camps.filter((c) => c.startsWith("e"));
  avaluacio.fontsGraella = json.fonts;
  avaluacio.graella = json.cel_les.map((v) => ({
    lat: v[i("lat")],
    lon: v[i("lon")],
    trams: avaluacio.trams.map((t) => v[i(t)]),
    llars: v[i("llars")],
    rendaPersona: v[i("renda_persona")],
    rendaLlar: v[i("renda_llar")],
  }));
}

// Etiqueta d'un tram: "e20_24" → "20–24"; "e85_mes" → "85 o más"
function etiquetaTram(tram) {
  return tram === "e85_mes" ? "85 o más" : tram.slice(1).replace("_", "–");
}

// Edat inicial i final del rang triat, per als textos: "de 20 a 64 años"
function textEdat() {
  const des = avaluacio.edatDes.slice(1, 3);
  const fins = avaluacio.edatFins === "e85_mes" ? "más de 85" : avaluacio.edatFins.slice(4);
  return `de ${Number(des)} a ${fins === "más de 85" ? fins : Number(fins)} años`;
}

// Càlcul principal: tot el que hi ha dins del radi d'un punt.
// 'excloure' ([lat, lon]): un centre propi que no compta per al solapament (ell mateix)
function calculaArea(lat, lon, radiM, excloure = null) {
  const iDes = avaluacio.trams.indexOf(avaluacio.edatDes);
  const iFins = avaluacio.trams.indexOf(avaluacio.edatFins);
  const propis = avaluacio.clubs.features.filter((c) => {
    if (c.properties.segment !== "propia" || c.properties.estat !== "obert") return false;
    const [plon, plat] = c.geometry.coordinates;
    return !(excloure && distanciaM(excloure[0], excloure[1], plat, plon) < 1);
  });

  // Rectangle que conté el cercle: les cel·les de fora es descarten sense calcular distàncies
  const dLat = radiM / 111320;
  const dLon = radiM / (111320 * Math.cos((lat * Math.PI) / 180));

  const r = { pobTotal: 0, pobObjectiu: 0, llars: 0, compartida: 0, rpSuma: 0, rpPes: 0, rlSuma: 0, rlPes: 0 };
  for (const c of avaluacio.graella) {
    if (Math.abs(c.lat - lat) > dLat || Math.abs(c.lon - lon) > dLon) continue;
    if (distanciaM(lat, lon, c.lat, c.lon) > radiM) continue;
    const total = c.trams.reduce((a, b) => a + b, 0);
    const objectiu = c.trams.slice(iDes, iFins + 1).reduce((a, b) => a + b, 0);
    r.pobTotal += total;
    r.pobObjectiu += objectiu;
    r.llars += c.llars;
    if (c.rendaPersona) { r.rpSuma += c.rendaPersona * total; r.rpPes += total; }
    if (c.rendaLlar) { r.rlSuma += c.rendaLlar * c.llars; r.rlPes += c.llars; }
    // Població compartida: la cel·la també és dins del radi d'algun centre propi
    const compartida = propis.some((p) => {
      const [plon, plat] = p.geometry.coordinates;
      return distanciaM(plat, plon, c.lat, c.lon) <= radiM;
    });
    if (compartida) r.compartida += objectiu;
  }
  r.rendaPersona = r.rpPes ? r.rpSuma / r.rpPes : null;
  r.rendaLlar = r.rlPes ? r.rlSuma / r.rlPes : null;

  // Clubs dins del radi, per segment
  r.clubs = {};
  for (const c of avaluacio.clubs.features) {
    const [clon, clat] = c.geometry.coordinates;
    const d = distanciaM(lat, lon, clat, clon);
    if (d > radiM) continue;
    const s = c.properties.segment;
    (r.clubs[s] = r.clubs[s] || []).push({ ...c.properties, distancia: d });
  }
  for (const llista of Object.values(r.clubs)) llista.sort((a, b) => a.distancia - b.distancia);

  // Centre propi més proper (encara que sigui fora del radi)
  r.propiMesProper = Math.min(...propis.map((p) => {
    const [plon, plat] = p.geometry.coordinates;
    return distanciaM(lat, lon, plat, plon);
  }));
  return r;
}

// Petit text de font sota cada xifra
function font(text) {
  return `<span class="font-dada">${text}</span>`;
}

// Controls del mode (es dibuixen una sola vegada, perquè no es perdin mentre s'arrosseguen)
function dibuixaControlsAvaluacio() {
  const vista = document.getElementById("avaluacio");
  const opcions = (seleccionat) => avaluacio.trams
    .map((t) => `<option value="${t}"${t === seleccionat ? " selected" : ""}>${etiquetaTram(t)}</option>`)
    .join("");

  vista.innerHTML = `
    <h2>Evaluar un local</h2>
    <p class="subtitol">Busca una dirección o haz clic en el mapa</p>
    <form class="cercador" id="cercador-adreca">
      <input type="search" id="text-adreca" placeholder="Calle, número y municipio" aria-label="Dirección del local">
      <button type="submit">Buscar</button>
    </form>
    <div id="resultats-cerca"></div>
    <div class="criteri">
      <div class="linia"><label for="radi-km">Radio de captación</label>
        <span class="valor" id="valor-radi"></span></div>
      <input type="range" id="radi-km" min="0.5" max="3" step="0.1" value="${avaluacio.radiKm}">
    </div>
    <div class="criteri">
      <label for="edat-des">Público objetivo (edad, tramos de 5 años)</label>
      <div class="selector-edat">
        <select id="edat-des" aria-label="Edad desde">${opcions(avaluacio.edatDes)}</select>
        <span>a</span>
        <select id="edat-fins" aria-label="Edad hasta">${opcions(avaluacio.edatFins)}</select>
      </div>
    </div>
    ${htmlControlsMirroring()}
    <div id="resultats-avaluacio"></div>
  `;
  connectaControlsMirroring(mostraResultatsAvaluacio); // js/mirroring.js

  // Cerca d'adreces: el formulari no recarrega la pàgina (preventDefault)
  vista.querySelector("#cercador-adreca").addEventListener("submit", (e) => {
    e.preventDefault();
    cercaAdreca(vista.querySelector("#text-adreca").value);
  });

  const desSelect = vista.querySelector("#edat-des");
  const finsSelect = vista.querySelector("#edat-fins");
  vista.querySelector("#radi-km").addEventListener("input", (e) => {
    avaluacio.radiKm = Number(e.target.value);
    actualitzaMapaAvaluacio();
    mostraResultatsAvaluacio();
  });
  desSelect.addEventListener("change", () => {
    avaluacio.edatDes = desSelect.value;
    // L'edat final no pot ser anterior a la inicial
    if (avaluacio.trams.indexOf(avaluacio.edatFins) < avaluacio.trams.indexOf(avaluacio.edatDes)) {
      avaluacio.edatFins = avaluacio.edatDes;
      finsSelect.value = avaluacio.edatFins;
    }
    mostraResultatsAvaluacio();
  });
  finsSelect.addEventListener("change", () => {
    avaluacio.edatFins = finsSelect.value;
    if (avaluacio.trams.indexOf(avaluacio.edatFins) < avaluacio.trams.indexOf(avaluacio.edatDes)) {
      avaluacio.edatDes = avaluacio.edatFins;
      desSelect.value = avaluacio.edatDes;
    }
    mostraResultatsAvaluacio();
  });
}

// Col·loca el punt candidat, el dibuixa i en calcula l'àrea
function situaPunt(latlng, centrar = false) {
  avaluacio.punt = L.latLng(latlng);
  actualitzaMapaAvaluacio();
  mostraResultatsAvaluacio();
  if (centrar) {
    mapa.setView(avaluacio.punt, 14);
    mapa.panInside(avaluacio.punt, margesMapa());
  }
}

// Busca una adreça amb el geocodificador de l'ICGC (només Catalunya) i en mostra fins a 5
async function cercaAdreca(text) {
  const caixa = document.getElementById("resultats-cerca");
  if (!text.trim()) return;
  caixa.innerHTML = `<p class="nota-relativa">Buscando…</p>`;
  try {
    const url = `https://eines.icgc.cat/geocodificador/cerca?text=${encodeURIComponent(text)}&size=5`;
    const resposta = await fetch(url);
    const dades = await resposta.json();
    // Si hi ha adreces amb portal, només es mostren aquestes (no municipis ni llocs llunyans)
    const adreces = dades.features.filter((f) => f.properties.layer === "address");
    if (adreces.length) dades.features = adreces;
    if (!dades.features.length) {
      caixa.innerHTML = `<p class="nota-relativa">No se ha encontrado esa dirección.</p>`;
      return;
    }
    caixa.innerHTML = `<ul class="llista-adreces">${dades.features
      .map((f, i) => `<li><button data-i="${i}">${f.properties.etiqueta}</button></li>`)
      .join("")}</ul>${font("Geocodificador del ICGC")}`;
    caixa.querySelectorAll("button").forEach((boto) => {
      boto.addEventListener("click", () => {
        const [lon, lat] = dades.features[Number(boto.dataset.i)].geometry.coordinates;
        caixa.innerHTML = "";
        situaPunt([lat, lon], true);
      });
    });
  } catch (error) {
    caixa.innerHTML = `<p class="nota-relativa">El buscador de direcciones no responde. Puedes hacer clic en el mapa.</p>`;
  }
}

// Resultats de l'àrea del punt candidat (es redibuixen a cada canvi)
function mostraResultatsAvaluacio() {
  document.getElementById("valor-radi").textContent = `${decimal(avaluacio.radiKm)} km`;
  const caixa = document.getElementById("resultats-avaluacio");

  if (!avaluacio.punt) {
    caixa.innerHTML = `<p class="nota-relativa">El área es un radio en línea recta desde el punto.
      El local se puntúa comparándolo con tus centros, con los mismos parámetros.</p>`;
    return;
  }

  const { lat, lng } = avaluacio.punt;
  const r = calculaArea(lat, lng, avaluacio.radiKm * 1000);
  const fontsPob = "INE, Censo Anual de Población 2024 · reparto en rejilla de 100 m";
  const fontsRenda = "INE, Atlas de Distribución de Renta de los Hogares 2024";

  // Competència: una fila per segment
  const files = Object.entries(SEGMENTS).map(([id, s]) => {
    const llista = r.clubs[id] || [];
    const oberts = llista.filter((c) => c.estat === "obert");
    const previstos = llista.length - oberts.length;
    const noms = oberts.map((c) => `${c.nom} (${numero(c.distancia)} m)`).join(", ");
    return `<li><strong>${s.etiqueta}: ${oberts.length}</strong>${previstos ? ` · ${previstos} apertura(s) prevista(s)` : ""}
      ${noms ? `<br><small>${noms}</small>` : ""}</li>`;
  }).join("");

  const marcaPropia = avaluacio.clubs.features.find((c) => c.properties.segment === "propia").properties.marca;
  const propis = (r.clubs.propia || []).map((c) => `${c.nom} (${numero(c.distancia)} m)`).join(", ");
  const pctCompartida = r.pobObjectiu ? (r.compartida / r.pobObjectiu) * 100 : 0;
  const fora = !dinsDelLimit(lat, lng);

  caixa.innerHTML = `
    <p class="nota-relativa">Punto ${lat.toFixed(5)}, ${lng.toFixed(5)} · radio de
      ${decimal(avaluacio.radiKm)} km en línea recta</p>
    ${fora ? `<p class="avis">El punto está fuera de Barcelona: la competencia low cost y municipal
      solo está recogida dentro de la ciudad y en una franja de 800 m.</p>` : ""}

    ${htmlMirroring(valorsCriteris(r))}

    ${titolSeccio(2, "Población")}
    <ul class="dades">
      <li>Población total: <strong>${numero(r.pobTotal)}</strong></li>
      <li>Público objetivo (${textEdat()}): <strong>${numero(r.pobObjectiu)}</strong></li>
      <li>Hogares: <strong>${numero(r.llars)}</strong></li>
    </ul>
    ${font(fontsPob)}

    ${titolSeccio(3, "Renta")}
    <ul class="dades">
      <li>Renta neta media por persona: <strong>${r.rendaPersona ? numero(r.rendaPersona) + " €" : "sin dato"}</strong></li>
      <li>Renta neta media por hogar: <strong>${r.rendaLlar ? numero(r.rendaLlar) + " €" : "sin dato"}</strong></li>
    </ul>
    ${font(fontsRenda)}

    ${titolSeccio(4, "Competencia en el área")}
    <ul class="dades llista-competencia">${files}</ul>
    ${font("Webs oficiales de las marcas, Open Data BCN y OpenStreetMap · consulta octubre–noviembre 2026")}

    ${titolSeccio(5, `Centros propios (${marcaPropia})`)}
    <ul class="dades">
      <li>Centros propios en el área: <strong>${(r.clubs.propia || []).length}</strong>${propis ? `<br><small>${propis}</small>` : ""}</li>
      <li>Centro propio más cercano: <strong>${numero(r.propiMesProper)} m</strong></li>
      <li>Público objetivo compartido con centros propios: <strong>${numero(r.compartida)}</strong>
        (${decimal(pctCompartida)} % del público objetivo del área)</li>
    </ul>
    ${font("Personas del área que también viven dentro del mismo radio de algún centro propio")}
  `;
}

// Dibuixa el punt, el cercle del candidat i els cercles dels centres propis que el toquen
function actualitzaMapaAvaluacio() {
  avaluacio.capa.clearLayers();
  if (!avaluacio.punt) return;
  const radiM = avaluacio.radiKm * 1000;

  for (const c of avaluacio.clubs.features) {
    if (c.properties.segment !== "propia" || c.properties.estat !== "obert") continue;
    const [lon, lat] = c.geometry.coordinates;
    // Només els que se solapen amb el candidat (centres a menys de dos radis)
    if (distanciaM(avaluacio.punt.lat, avaluacio.punt.lng, lat, lon) < 2 * radiM) {
      L.circle([lat, lon], { radius: radiM, color: NAVY, weight: 1, opacity: 0.4, fillColor: NAVY,
        fillOpacity: 0.06, interactive: false }).addTo(avaluacio.capa);
    }
  }
  L.circle(avaluacio.punt, { radius: radiM, color: NAVY, weight: 2, dashArray: "6 6", fill: false,
    interactive: false, pane: "superior" }).addTo(avaluacio.capa);
  L.circleMarker(avaluacio.punt, { radius: 8, color: "#ffffff", weight: 2, fillColor: "#2bb3c0",
    fillOpacity: 1, interactive: false, pane: "superior" }).addTo(avaluacio.capa);
}

// Primera vegada que s'entra al mode: carrega les dades (la graella pesa uns 2,8 MB)
async function preparaAvaluacio() {
  if (avaluacio.graella) return;
  const vista = document.getElementById("avaluacio");
  vista.innerHTML = `<h2>Evaluar un local</h2><p class="subtitol">Cargando datos de población…</p>`;
  const [graella, clubs, limit] = await Promise.all([
    carregaGeoJSON("data/poblacio_100m.json"),
    carregaGeoJSON("data/clubs_segments.geojson"),
    carregaGeoJSON("data/limit_municipal.geojson"),
  ]);
  preparaGraella(graella);
  avaluacio.clubs = clubs;
  avaluacio.limit = limit;
  avaluacio.capa = L.layerGroup();

  // Clubs per segment (els propis en navy, com al mapa de zones)
  avaluacio.capaClubs = L.geoJSON(clubs, {
    pointToLayer: (club, posicio) => {
      const s = club.properties.segment;
      const estil = s === "propia"
        ? { fillColor: NAVY, fillOpacity: 1, color: "#ffffff", weight: 1, radius: 6 }
        : SEGMENTS[s].estil;
      const previst = club.properties.estat === "previst";
      return L.circleMarker(posicio, { ...estil, fillOpacity: previst ? 0.4 : estil.fillOpacity,
        pane: "superior", interactive: false });
    },
  });

  // Clic al mapa: nou punt candidat (només en aquest mode)
  mapa.on("click", (e) => {
    if (!document.body.classList.contains("mode-avaluar")) return;
    situaPunt(e.latlng);
    if (esMobil()) lateral.classList.remove("desplegada");
  });
}

// Entrar i sortir del mode
async function activaAvaluacio() {
  await preparaAvaluacio();
  avaluacio.capa.addTo(mapa);
  avaluacio.capaClubs.addTo(mapa);
  actualitzaMapaAvaluacio();
  dibuixaControlsAvaluacio();
  mostraResultatsAvaluacio();
}

function desactivaAvaluacio() {
  if (!avaluacio.capa) return;
  avaluacio.capa.remove();
  avaluacio.capaClubs.remove();
}
