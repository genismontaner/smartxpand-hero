// =============================================================
// v1 · Pasos 2, 3 i 6 · Mode "Evaluar un local"
// L'usuari clica un punt del mapa; es calcula l'àrea (radi en km o
// isòcrona en minuts, js/isocrones.js) sumant les cel·les de la
// graella de població de 100 m, i es compten els clubs de cada
// segment i els centres propis.
// =============================================================

const avaluacio = {
  punt: null, // L.latLng del local candidat
  tipusArea: "radi", // "radi" o "isocrona"
  radiKm: 1.5,
  modeIso: "a_pie", // "a_pie" o "coche"
  minuts: 10,
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

// Cert si el punt és dins d'un polígon GeoJSON (mètode del raig: es compten els creuaments
// d'una línia horitzontal amb les vores; senar = dins). Mirar tots els anells resol els forats.
function dinsPoligon(g, lat, lon) {
  // Polygon → un polígon; MultiPolygon → diversos; qualsevol altra cosa s'ignora
  const poligons = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  let dins = false;
  for (const poligon of poligons) {
    for (const anell of poligon) {
      for (let i = 0, j = anell.length - 1; i < anell.length; j = i++) {
        const [xi, yi] = anell[i];
        const [xj, yj] = anell[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dins = !dins;
      }
    }
  }
  return dins;
}

// Cert si el punt és dins del contorn de Barcelona
function dinsDelLimit(lat, lon) {
  return avaluacio.limit.features.some((f) => dinsPoligon(f.geometry, lat, lon));
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

// Càlcul principal: tot el que hi ha dins d'una àrea (radi o isòcrona, js/isocrones.js).
// 'excloure' ([lat, lon]): un centre propi que no compta per al solapament (ell mateix)
function calculaArea(area, excloure = null) {
  const { lat, lon } = area;
  const iDes = avaluacio.trams.indexOf(avaluacio.edatDes);
  const iFins = avaluacio.trams.indexOf(avaluacio.edatFins);
  const propis = avaluacio.clubs.features.filter((c) => {
    if (c.properties.segment !== "propia" || c.properties.estat !== "obert") return false;
    const [plon, plat] = c.geometry.coordinates;
    return !(excloure && distanciaM(excloure[0], excloure[1], plat, plon) < 1);
  });

  // Àrees dels centres propis amb el mateix tipus d'àrea; només les que toquen la del candidat
  const areesPropies = propis.map(areaPropi).filter((a) => a && caixesEsToquen(a, area));

  const r = { pobTotal: 0, pobObjectiu: 0, llars: 0, compartida: 0, rpSuma: 0, rpPes: 0, rlSuma: 0, rlPes: 0 };
  for (const c of avaluacio.graella) {
    if (!conte(area, c.lat, c.lon)) continue;
    const total = c.trams.reduce((a, b) => a + b, 0);
    const objectiu = c.trams.slice(iDes, iFins + 1).reduce((a, b) => a + b, 0);
    r.pobTotal += total;
    r.pobObjectiu += objectiu;
    r.llars += c.llars;
    if (c.rendaPersona) { r.rpSuma += c.rendaPersona * total; r.rpPes += total; }
    if (c.rendaLlar) { r.rlSuma += c.rendaLlar * c.llars; r.rlPes += c.llars; }
    // Població compartida: la cel·la també és dins de l'àrea d'algun centre propi
    if (areesPropies.some((a) => conte(a, c.lat, c.lon))) r.compartida += objectiu;
  }
  r.rendaPersona = r.rpPes ? r.rpSuma / r.rpPes : null;
  r.rendaLlar = r.rlPes ? r.rlSuma / r.rlPes : null;

  // Clubs dins de l'àrea, per segment (la distància és en línia recta)
  r.clubs = {};
  for (const c of avaluacio.clubs.features) {
    const [clon, clat] = c.geometry.coordinates;
    if (!conte(area, clat, clon)) continue;
    const s = c.properties.segment;
    (r.clubs[s] = r.clubs[s] || []).push({ ...c.properties, distancia: distanciaM(lat, lon, clat, clon) });
  }
  for (const llista of Object.values(r.clubs)) llista.sort((a, b) => a.distancia - b.distancia);

  // Centre propi més proper (encara que sigui fora de l'àrea)
  r.propiMesProper = Math.min(...propis.map((p) => {
    const [plon, plat] = p.geometry.coordinates;
    return distanciaM(lat, lon, plat, plon);
  }));
  return r;
}

// Solapament detallat d'una àrea amb els centres propis, per dibuixar-lo i explicar-lo:
// - celles: cada cel·la de 100 m amb públic objectiu, i si també és dins d'algun centre propi
// - centres: per a cada centre propi, quant públic objectiu comparteix amb l'àrea (de més a menys)
// Una cel·la pot ser dins de diversos centres: la suma dels centres pot superar el total compartit.
function solapamentDetallat(area) {
  const iDes = avaluacio.trams.indexOf(avaluacio.edatDes);
  const iFins = avaluacio.trams.indexOf(avaluacio.edatFins);
  const arees = avaluacio.clubs.features
    .filter((c) => c.properties.segment === "propia" && c.properties.estat === "obert")
    .map((club) => ({ club, area: areaPropi(club), persones: 0 }))
    .filter((x) => x.area && caixesEsToquen(x.area, area));

  const celles = [];
  for (const c of avaluacio.graella) {
    if (!conte(area, c.lat, c.lon)) continue;
    const objectiu = c.trams.slice(iDes, iFins + 1).reduce((a, b) => a + b, 0);
    if (!objectiu) continue;
    let compartida = false;
    for (const x of arees) {
      if (conte(x.area, c.lat, c.lon)) {
        compartida = true;
        x.persones += objectiu;
      }
    }
    celles.push({ lat: c.lat, lon: c.lon, compartida });
  }
  const centres = arees.filter((x) => x.persones > 0).sort((a, b) => b.persones - a.persones);
  return { celles, centres };
}

// Llegenda del mapa d'avaluació: quina part del públic és només d'aquest local
function htmlLlegendaSolapament(r) {
  const pctCompartida = r.pobObjectiu ? (r.compartida / r.pobObjectiu) * 100 : 0;
  return `<p class="llegenda-solapament">
    <span><i class="mostra-cella exclusiva"></i>Solo de este local: <strong>${decimal(100 - pctCompartida)} %</strong></span>
    <span><i class="mostra-cella compartida"></i>Compartido con tus centros: <strong>${decimal(pctCompartida)} %</strong></span>
  </p>`;
}

// Petit text de font sota cada xifra
function font(text) {
  return `<span class="font-dada">${text}</span>`;
}

// Controls de l'àrea de captació: radi en km o isòcrona en minuts (principi 2: tria l'usuari).
// Si cap de les dues portes té isòcrones, només es mostra el radi (cap control que no funcioni).
function htmlControlsArea() {
  const radi = `
    <div class="criteri" id="control-radi">
      <div class="linia"><label for="radi-km">Radio de captación</label>
        <span class="valor" id="valor-radi"></span></div>
      <input type="range" id="radi-km" min="0.5" max="3" step="0.1" value="${avaluacio.radiKm}">
    </div>`;
  if (!isocronesEnAlgunMode()) return radi;

  const modes = Object.entries(MODES_ISOCRONA)
    .map(([id, m]) => `<button type="button" class="pindola" data-mode-iso="${id}">${m.etiqueta}</button>`).join("");
  const minuts = [5, 10, 15]
    .map((m) => `<button type="button" class="pindola" data-minuts="${m}">${m} min</button>`).join("");
  return `
    <div class="criteri" id="grup-tipus-area">
      <label>Área de captación</label>
      <div class="pindoles" role="group" aria-label="Tipo de área">
        <button type="button" class="pindola" data-tipus-area="radi">Radio (km)</button>
        <button type="button" class="pindola" data-tipus-area="isocrona">Isócrona (min)</button>
      </div>
    </div>
    ${radi}
    <div class="criteri" id="control-isocrona">
      <div class="pindoles" role="group" aria-label="Modo de desplazamiento" id="grup-mode-iso">${modes}</div>
      <p class="nota-relativa" id="nota-zones-a-peu">En el mapa de zonas, isócronas a pie
        (precalculadas para cada zona).</p>
      <div class="pindoles" role="group" aria-label="Minutos" style="margin-top:8px">${minuts}</div>
      <p class="nota-relativa" id="nota-cotxe">En coche, 10 y 15 min salen de la zona con datos
        (Barcelona + 3 km) y no se ofrecen.</p>
    </div>`;
}

// Marca els botons actius i amaga el que no toca segons l'estat i el mode.
// Al mapa de zones, isòcrona només a peu i només si estan precalculades (js/isocrones.js)
function actualitzaControlsArea() {
  const esRadi = avaluacio.tipusArea === "radi";
  const avaluar = document.body.classList.contains("mode-avaluar");
  document.getElementById("valor-radi").textContent = `${decimal(avaluacio.radiKm)} km`;
  if (!isocronesEnAlgunMode()) return;
  document.getElementById("grup-tipus-area").hidden = !isocronesDisponibles();
  document.getElementById("grup-mode-iso").hidden = !avaluar;
  document.getElementById("nota-zones-a-peu").hidden = avaluar;
  document.getElementById("control-radi").hidden = !esRadi;
  document.getElementById("control-isocrona").hidden = esRadi;
  document.getElementById("nota-cotxe").hidden = avaluacio.modeIso !== "coche";
  const permesos = MODES_ISOCRONA[avaluacio.modeIso].minuts;
  document.querySelectorAll("[data-tipus-area]").forEach((b) => b.classList.toggle("activa", b.dataset.tipusArea === avaluacio.tipusArea));
  document.querySelectorAll("[data-mode-iso]").forEach((b) => b.classList.toggle("activa", b.dataset.modeIso === avaluacio.modeIso));
  document.querySelectorAll("[data-minuts]").forEach((b) => {
    b.hidden = !permesos.includes(Number(b.dataset.minuts));
    b.classList.toggle("activa", Number(b.dataset.minuts) === avaluacio.minuts);
  });
}

function connectaControlsArea() {
  // Qualsevol canvi d'àrea: es recalcula el mode actiu (js/app.js)
  const aplica = () => {
    actualitzaControlsArea();
    actualitzaAtribucio();
    recalculaTot();
  };
  document.getElementById("radi-km").addEventListener("input", (e) => {
    avaluacio.radiKm = Number(e.target.value);
    aplica();
  });
  document.querySelectorAll("[data-tipus-area]").forEach((b) => b.addEventListener("click", () => {
    avaluacio.tipusArea = b.dataset.tipusArea;
    aplica();
  }));
  document.querySelectorAll("[data-mode-iso]").forEach((b) => b.addEventListener("click", () => {
    avaluacio.modeIso = b.dataset.modeIso;
    // Si el temps triat no existeix en aquest mode (cotxe: només 5 min), es pren el primer
    if (!MODES_ISOCRONA[avaluacio.modeIso].minuts.includes(avaluacio.minuts)) {
      avaluacio.minuts = MODES_ISOCRONA[avaluacio.modeIso].minuts[0];
    }
    aplica();
  }));
  document.querySelectorAll("[data-minuts]").forEach((b) => b.addEventListener("click", () => {
    avaluacio.minuts = Number(b.dataset.minuts);
    aplica();
  }));
  actualitzaControlsArea();
}

// Controls comuns a les dues portes d'entrada (àrea, edat, pesos, segments, llindar i
// calibratge). N'hi ha una sola còpia: es mou a la vista que es mostra (colocaControls)
function dibuixaControlsComuns() {
  let caixa = document.getElementById("controls-comuns");
  if (!caixa) {
    caixa = document.createElement("div");
    caixa.id = "controls-comuns";
    // Ha de ser a la pàgina abans de connectar els controls (es busquen per id)
    document.querySelector(".ranura-controls").appendChild(caixa);
  }
  const opcions = (seleccionat) => avaluacio.trams
    .map((t) => `<option value="${t}"${t === seleccionat ? " selected" : ""}>${etiquetaTram(t)}</option>`)
    .join("");

  caixa.innerHTML = `
    ${htmlControlsArea()}
    <div class="criteri">
      <label for="edat-des">Público objetivo (edad, tramos de 5 años)</label>
      <div class="selector-edat">
        <select id="edat-des" aria-label="Edad desde">${opcions(avaluacio.edatDes)}</select>
        <span>a</span>
        <select id="edat-fins" aria-label="Edad hasta">${opcions(avaluacio.edatFins)}</select>
      </div>
    </div>
    ${htmlControlsMirroring()}
    ${htmlCalibratge()}
  `;
  connectaControlsMirroring(recalculaTot); // js/mirroring.js
  connectaCalibratge(); // js/calibratge.js
  connectaControlsArea();

  const desSelect = caixa.querySelector("#edat-des");
  const finsSelect = caixa.querySelector("#edat-fins");
  desSelect.addEventListener("change", () => {
    avaluacio.edatDes = desSelect.value;
    // L'edat final no pot ser anterior a la inicial
    if (avaluacio.trams.indexOf(avaluacio.edatFins) < avaluacio.trams.indexOf(avaluacio.edatDes)) {
      avaluacio.edatFins = avaluacio.edatDes;
      finsSelect.value = avaluacio.edatFins;
    }
    recalculaTot();
  });
  finsSelect.addEventListener("change", () => {
    avaluacio.edatFins = finsSelect.value;
    if (avaluacio.trams.indexOf(avaluacio.edatFins) < avaluacio.trams.indexOf(avaluacio.edatDes)) {
      avaluacio.edatDes = avaluacio.edatFins;
      desSelect.value = avaluacio.edatDes;
    }
    recalculaTot();
  });
  return caixa;
}

// Mou els controls comuns a la vista indicada. appendChild amb un element que ja és a la
// pàgina no el copia: el treu d'on era i el posa aquí, amb els seus esdeveniments
function colocaControls(idVista) {
  const ranura = document.querySelector(`#${idVista} .ranura-controls`);
  const controls = document.getElementById("controls-comuns");
  if (ranura && controls && controls.parentElement !== ranura) ranura.appendChild(controls);
}

// Vista "Evaluar un local" (es dibuixa una vegada). Ordre: cercador, resultat (puntuació, sí/no i
// per què), paràmetres plegats i, a sota, les dades detallades i el comparador
function dibuixaVistaAvaluacio() {
  const vista = document.getElementById("avaluacio");
  vista.innerHTML = `
    <h2>Evaluar un local</h2>
    <p class="subtitol">Busca una dirección o haz clic en el mapa</p>
    <form class="cercador" id="cercador-adreca">
      <input type="search" id="text-adreca" placeholder="Calle, número y municipio" aria-label="Dirección del local">
      <button type="submit">Buscar</button>
    </form>
    <div id="resultats-cerca"></div>
    <div id="resultats-avaluacio"></div>
    <details class="plegable plegable-parametres">
      <summary>Ajustar parámetros <span class="resum-parametres"></span></summary>
      <div class="ranura-controls"></div>
    </details>
    <div id="detall-avaluacio"></div>
  `;
  // Cerca d'adreces: el formulari no recarrega la pàgina (preventDefault)
  vista.querySelector("#cercador-adreca").addEventListener("submit", (e) => {
    e.preventDefault();
    cercaAdreca(vista.querySelector("#text-adreca").value);
  });
}

// Col·loca el punt candidat, el dibuixa i en calcula l'àrea.
// 'nom': l'adreça trobada (si el punt ve del cercador)
function situaPunt(latlng, centrar = false, nom = null) {
  avaluacio.punt = L.latLng(latlng);
  // Els errors d'ORS no es guarden per sempre: en tornar a triar un punt, es pot reintentar
  for (const [clau, valor] of isocrones.memoria) if (valor.error) isocrones.memoria.delete(clau);
  avaluacio.nomPunt = nom || `Punto ${avaluacio.punt.lat.toFixed(4)}, ${avaluacio.punt.lng.toFixed(4)}`;
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
        const triat = dades.features[Number(boto.dataset.i)];
        const [lon, lat] = triat.geometry.coordinates;
        caixa.innerHTML = "";
        situaPunt([lat, lon], true, triat.properties.etiqueta);
      });
    });
  } catch (error) {
    caixa.innerHTML = `<p class="nota-relativa">El buscador de direcciones no responde. Puedes hacer clic en el mapa.</p>`;
  }
}

// Resultats de l'àrea del punt candidat (es redibuixen a cada canvi)
// Paràmetres actuals en una línia, a la capçalera de "Ajustar parámetros"
function resumCurtParametres() {
  return `${textArea()} · ${textEdat()} · umbral ${mirroring.llindar}`;
}

function mostraResultatsAvaluacio() {
  mostraCalibratge(); // el calibratge també es recalcula amb els paràmetres nous
  const caixa = document.getElementById("resultats-avaluacio");
  if (!caixa) return;
  const detall = document.getElementById("detall-avaluacio");
  document.querySelector(".resum-parametres").textContent = resumCurtParametres();
  detall.innerHTML = "";

  if (!avaluacio.punt) {
    caixa.innerHTML = `<p class="nota-relativa">El área es un ${textArea()} desde el punto.
      El local se puntúa comparándolo con tus centros, con la misma área y los mismos parámetros.</p>`;
    return;
  }

  const { lat, lng } = avaluacio.punt;
  const capcalera = `<p class="nota-relativa">${avaluacio.nomPunt} · ${textArea()}</p>`;
  const area = areaCandidat(lat, lng);
  // La isòcrona encara no ha arribat, o ORS ha tornat un error
  if (!area || area.error) {
    caixa.innerHTML = `${capcalera}<p class="${area ? "avis" : "nota-relativa"}">
      ${area ? area.error : "Calculando la isócrona…"}</p>`;
    return;
  }
  const r = calculaArea(area);
  const incomplet = foraZonaDades(area);
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
  // Amb quins centres comparteix públic, i quant (els 5 primers)
  const { centres } = solapamentDetallat(area);
  const comparteix = centres.slice(0, 5).map((x) => `<li>${x.club.properties.nom}: <strong>${numero(x.persones)}</strong>
    (${decimal(r.pobObjectiu ? (x.persones / r.pobObjectiu) * 100 : 0)} %)</li>`).join("");
  const pctCompartida = r.pobObjectiu ? (r.compartida / r.pobObjectiu) * 100 : 0;
  const fora = !dinsDelLimit(lat, lng);
  // Numeració de seccions: 1 = desglossament; 2 = comparador (només si hi ha locals desats)
  const n = comparador.locals.length ? 2 : 1;

  caixa.innerHTML = `
    ${capcalera}
    ${area.tipus === "isocrona" ? font(fontIsocrones()) : ""}
    ${incomplet ? `<p class="avis">El área supera la zona con datos (Barcelona + 3 km): cifras
      incompletas. No se responde sí o no.</p>` : ""}
    ${fora ? `<p class="avis">El punto está fuera de Barcelona: los centros municipales solo están
      recogidos dentro de la ciudad.</p>` : ""}

    ${htmlMirroring(valorsCriteris(r), incomplet, "Este local", incomplet ? ""
      : `<strong>Por qué:</strong> ${notaDecisio(puntuaMirroring(valorsCriteris(r)), null, avaluacio.config)}`)}
    ${htmlLlegendaSolapament(r)}
    ${htmlBotoGuardar()}
  `;
  // Sota els paràmetres plegats: comparador i dades detallades
  detall.innerHTML = `
    ${htmlComparador(2)}

    ${titolSeccio(n + 1, "Población")}
    <ul class="dades">
      <li>Población total: <strong>${numero(r.pobTotal)}</strong></li>
      <li>Público objetivo (${textEdat()}): <strong>${numero(r.pobObjectiu)}</strong></li>
      <li>Hogares: <strong>${numero(r.llars)}</strong></li>
    </ul>
    ${font(fontsPob)}

    ${titolSeccio(n + 2, "Renta")}
    <ul class="dades">
      <li>Renta neta media por persona: <strong>${r.rendaPersona ? numero(r.rendaPersona) + " €" : "sin dato"}</strong></li>
      <li>Renta neta media por hogar: <strong>${r.rendaLlar ? numero(r.rendaLlar) + " €" : "sin dato"}</strong></li>
    </ul>
    ${font(fontsRenda)}

    ${titolSeccio(n + 3, "Competencia en el área")}
    <ul class="dades llista-competencia">${files}</ul>
    ${font("Webs oficiales de las marcas, Open Data BCN y OpenStreetMap · consulta octubre–noviembre 2026")}

    ${titolSeccio(n + 4, `Centros propios (${marcaPropia})`)}
    <ul class="dades">
      <li>Centros propios en el área: <strong>${(r.clubs.propia || []).length}</strong>${propis ? `<br><small>${propis}</small>` : ""}</li>
      <li>Centro propio más cercano: <strong>${numero(r.propiMesProper)} m</strong></li>
      <li>Público objetivo compartido con centros propios: <strong>${numero(r.compartida)}</strong>
        (${decimal(pctCompartida)} % del público objetivo del área)</li>
    </ul>
    ${centres.length ? `<p class="subtitol-llista">Comparte público con ${centres.length} centro(s)${centres.length > 5 ? "; los 5 que más" : ""}:</p>
    <ul class="dades">${comparteix}</ul>` : ""}
    ${font(`Personas del área que también viven dentro del área de algún centro propio
      (${avaluacio.tipusArea === "radi" ? "mismo radio" : "misma isócrona"})`)}

    ${htmlNoCobertes(avaluacio.config, n + 5)}
  `;
  connectaComparador(); // js/comparador.js
}

// Dibuix d'una àrea: cercle si és un radi, polígon si és una isòcrona
function capaArea(area, estil) {
  return area.tipus === "radi"
    ? L.circle([area.lat, area.lon], { radius: area.radiM, ...estil, interactive: false })
    : L.geoJSON(area.geometria, { style: estil, interactive: false });
}

// Un sol "llenç" (canvas) per a les cel·les: dibuixar-ne centenars com a elements SVG seria lent
const LLENC_CELLES = L.canvas({ padding: 0.5 });

// Dibuixa el punt i l'àrea del candidat, pintada per cel·les de 100 m: en daurat el públic que
// només arriba a aquest local; en navy suau, el que ja és dins de l'àrea d'algun centre propi.
// Els centres propis que comparteixen públic porten un anell (amb les persones compartides).
// Abans es dibuixaven els cercles de tots aquests centres i el mapa quedava atapeït.
function actualitzaMapaAvaluacio() {
  avaluacio.capa.clearLayers();
  if (!avaluacio.punt) return;
  const area = areaCandidat(avaluacio.punt.lat, avaluacio.punt.lng);

  if (area && !area.error) {
    const { celles, centres } = solapamentDetallat(area);
    const mitja = 50; // metres: mitja cel·la
    for (const c of celles) {
      const dLat = mitja / 111320;
      const dLon = mitja / (111320 * Math.cos((c.lat * Math.PI) / 180));
      L.rectangle([[c.lat - dLat, c.lon - dLon], [c.lat + dLat, c.lon + dLon]], {
        renderer: LLENC_CELLES, stroke: false, interactive: false,
        fillColor: c.compartida ? NAVY : "#c8a96e", fillOpacity: c.compartida ? 0.4 : 0.7,
      }).addTo(avaluacio.capa);
    }
    for (const x of centres) {
      const [lon, lat] = x.club.geometry.coordinates;
      L.circleMarker([lat, lon], { radius: 11, color: NAVY, weight: 2, fill: false, pane: "superior" })
        .bindTooltip(`${x.club.properties.nom}<br>comparte <strong>${numero(x.persones)}</strong> personas`,
          { direction: "top", offset: [0, -10] })
        .addTo(avaluacio.capa);
    }
    capaArea(area, { color: NAVY, weight: 2, dashArray: "6 6", fill: false, pane: "superior" })
      .addTo(avaluacio.capa);
  }
  L.circleMarker(avaluacio.punt, { radius: 8, color: "#ffffff", weight: 2, fillColor: "#c8a96e",
    fillOpacity: 1, interactive: false, pane: "superior" }).addTo(avaluacio.capa);
}

// En obrir la pàgina: carrega les dades comunes a les dues portes (la graella pesa uns 2,8 MB)
async function preparaDades() {
  const [graella, clubs, limit, config] = await Promise.all([
    carregaGeoJSON("data/poblacio_100m.json"),
    carregaGeoJSON("data/clubs_segments.geojson"),
    carregaGeoJSON("data/limit_municipal.geojson"),
    carregaGeoJSON("config/scoring.json"),
    carregaIsocrones(), // js/isocrones.js (només si hi ha clau d'ORS)
  ]);
  avaluacio.config = config;
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

// Entrar i sortir del mode (els clubs es veuen en tots dos modes)
function activaAvaluacio() {
  avaluacio.capa.addTo(mapa);
  comparador.capa?.addTo(mapa);
  // Mapa base esvaït: les cel·les daurades i navy no es confonen amb el beix i el gris del fons
  mapa.getContainer().classList.add("mapa-esvait");
  colocaControls("avaluacio");
  ajustaAreaAlMode(); // sense clau, l'avaluació només fa servir radi (js/isocrones.js)
  actualitzaControlsArea();
  actualitzaAtribucio();
  actualitzaMapaAvaluacio();
  mostraResultatsAvaluacio();
}

function desactivaAvaluacio() {
  avaluacio.capa.remove();
  comparador.capa?.remove();
  mapa.getContainer().classList.remove("mapa-esvait");
  actualitzaAtribucio(); // treu l'atribució d'ORS fora d'aquest mode
}
