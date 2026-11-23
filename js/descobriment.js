// =============================================================
// v1 · Pas 8 · Mapa de descobriment amb els mateixos paràmetres
// Cada hexàgon es calcula com si fos un local: mateixa funció
// (calculaArea), mateixa graella, mateixos paràmetres i mateixa
// puntuació "mirroring" contra els centres propis.
// =============================================================

const descobriment = {
  hexagons: null, // data/hexagons.geojson (cada hexàgon rep 'calcul')
  config: null, // config/scoring.json
  capa: null, // capa d'hexàgons
  seleccionat: null, // capa de l'hexàgon seleccionat
  capaSeleccio: null, // àrea dibuixada de l'hexàgon seleccionat
  clau: null, // paràmetres amb què s'han calculat els valors bruts
  minimPoblacio: null, // públic objectiu del centre propi amb menys
};

// Centre d'un hexàgon: mitjana dels seus vèrtexs (l'últim repeteix el primer)
function centreHexagon(hex) {
  const vertexs = hex.geometry.coordinates[0].slice(0, -1);
  const lon = vertexs.reduce((suma, v) => suma + v[0], 0) / vertexs.length;
  const lat = vertexs.reduce((suma, v) => suma + v[1], 0) / vertexs.length;
  return { lat, lon };
}

// Àrea d'un hexàgon des del centre: radi, o la seva isòcrona a peu precalculada (pas 8.2).
// Retorna null si l'hexàgon no té isòcrona (sòl no urbanitzable o sense carrers a prop)
function areaHexagon(hex) {
  const { lat, lon } = hex.centre;
  if (avaluacio.tipusArea === "radi") return areaRadi(lat, lon, avaluacio.radiKm * 1000);
  const geometria = isocrones.zones.get(`${hex.properties.hex_id}|${avaluacio.minuts}`);
  return geometria ? areaIsocrona(lat, lon, geometria) : null;
}

// Valors bruts de cada hexàgon. Només depenen de l'àrea, l'edat i els segments:
// si només canvien els pesos o el llindar, no cal tornar-los a calcular
function calculaValorsHexagons() {
  const clau = [avaluacio.tipusArea, avaluacio.radiKm, avaluacio.minuts, avaluacio.edatDes,
    avaluacio.edatFins, JSON.stringify(mirroring.segments)].join("|");
  if (descobriment.clau === clau) return;
  for (const hex of descobriment.hexagons.features) {
    const area = areaHexagon(hex);
    const r = area ? calculaArea(area) : null;
    hex.calcul = { r, valors: r ? valorsCriteris(r) : null };
  }
  descobriment.clau = clau;
}

// "Evaluar este punto como local": l'avaluació reaprofita la isòcrona precalculada de la zona
// (mateixa clau que areaCandidat, js/isocrones.js) i no gasta cap petició a ORS
function passaIsocronesZonaALocal(hex) {
  const { lat, lon } = hex.centre;
  for (const minuts of MODES_ISOCRONA.a_pie.minuts) {
    const geometria = isocrones.zones.get(`${hex.properties.hex_id}|${minuts}`);
    if (geometria) {
      isocrones.memoria.set(`a_pie|${minuts}|${lat.toFixed(5)}|${lon.toFixed(5)}`, areaIsocrona(lat, lon, geometria));
    }
  }
}

// Classe d'una zona: verd si arriba al llindar, ambre si s'hi queda a prop, gris si no
function classeZona(total) {
  if (total >= mirroring.llindar) return "investigar";
  if (total >= mirroring.llindar - descobriment.config.marge_esperar) return "esperar";
  return "descartar";
}

// Regles prèvies, puntuació i classe de cada hexàgon
function puntuaHexagons() {
  calculaValorsHexagons();
  const config = descobriment.config;
  const regla = (id) => config.regles_previes.find((r) => r.id === id);
  descobriment.minimPoblacio = Math.min(...valorsReferencia().map((v) => v.poblacio));

  for (const hex of descobriment.hexagons.features) {
    const c = hex.calcul;
    c.puntuacio = null;
    c.motiu = null;
    if (hex.properties.sol === "no_urbanitzable") {
      c.motiu = regla("sol_no_urbanitzable").motiu;
    } else if (!c.r) {
      c.motiu = regla("sense_isocrona").motiu;
    } else if (c.valors.poblacio < descobriment.minimPoblacio) {
      c.motiu = regla("poblacio_minima").motiu
        .replace("{valor}", numero(c.valors.poblacio))
        .replace("{minim}", numero(descobriment.minimPoblacio));
    } else {
      c.puntuacio = puntuaMirroring(c.valors); // js/mirroring.js
    }
    c.classe = c.puntuacio ? classeZona(c.puntuacio.total) : "descartar";
  }
}

// Recompte de zones per classe (sense les descartades per regla prèvia)
function recompteClasses() {
  const recompte = { investigar: 0, esperar: 0, descartar: 0, regla: 0 };
  for (const hex of descobriment.hexagons.features) {
    if (hex.calcul.motiu) recompte.regla++;
    else recompte[hex.calcul.classe]++;
  }
  return recompte;
}

// Estil de cada hexàgon. Els descartats per regla prèvia, gairebé transparents
function estilHexagon(hex) {
  const color = descobriment.config.classes.find((c) => c.id === hex.calcul.classe).color;
  return { color: "#ffffff", weight: 0.5, fillColor: color, fillOpacity: hex.calcul.motiu ? 0.15 : 0.7 };
}

// Resum dels paràmetres en una frase (per a les captures)
function resumParametres() {
  const suma = mirroring.criteris.reduce((s, c) => s + c.pes, 0);
  const pesos = mirroring.criteris.map((c) => `${c.etiqueta} ${Math.round((c.pes / suma) * 100)} %`).join(", ");
  const segments = Object.entries(mirroring.segments).filter(([, s]) => s)
    .map(([id]) => SEGMENTS[id].etiqueta.toLowerCase()).join(", ");
  return `Parámetros: ${textArea()}; público ${textEdat()}; pesos: ${pesos}; competencia: ${segments || "ninguna"}; ` +
    `umbral ${mirroring.llindar}.`;
}

// Rètol curt d'un hexàgon: barri, puntuació i classe
function textRetolHexagon(hex) {
  const c = hex.calcul;
  const classe = descobriment.config.classes.find((x) => x.id === c.classe);
  const valor = c.motiu ? "descartada por regla previa"
    : `<strong>${Math.round(c.puntuacio.total)}</strong> · ${etiquetaClasse(classe)}`;
  return `${hex.properties.barri}<br>${valor}`;
}

// --- Selecció d'un hexàgon ---

function seleccionaHexagon(capa) {
  desseleccionaHexagon(false);
  descobriment.seleccionat = capa;
  mostraVista("panell");
  dibuixaSeleccio();
  mostraPanellHexagon(capa.feature, descobriment.config); // js/panell.js
  if (esMobil()) lateral.classList.remove("desplegada");
  mapa.panInside([capa.feature.centre.lat, capa.feature.centre.lon], margesMapa());
}

// Vora navy a l'hexàgon i àrea discontínua (mateix dibuix que un local)
function dibuixaSeleccio() {
  const capa = descobriment.seleccionat;
  descobriment.capaSeleccio?.remove();
  capa.setStyle({ color: NAVY, weight: 3 });
  capa.bringToFront();
  const area = areaHexagon(capa.feature);
  if (!area) return; // sense isòcrona no hi ha àrea per dibuixar
  descobriment.capaSeleccio = capaArea(area,
    { color: NAVY, weight: 1.5, dashArray: "6 6", fill: false, pane: "superior" }).addTo(mapa);
}

function desseleccionaHexagon(mostraInicial = true) {
  if (descobriment.seleccionat) descobriment.capa.resetStyle(descobriment.seleccionat);
  descobriment.capaSeleccio?.remove();
  descobriment.seleccionat = null;
  descobriment.capaSeleccio = null;
  if (mostraInicial) mostraPanellInicial(descobriment.config);
}

// --- Recàlcul ---

// Torna a puntuar i a pintar el mapa amb els paràmetres actuals
function recalculaDescobriment() {
  puntuaHexagons();
  descobriment.capa.setStyle(estilHexagon);
  actualitzaLlegenda();
  document.querySelector(".parametres-captura").textContent = resumParametres();
  actualitzaResumClasses();
  if (descobriment.seleccionat) {
    dibuixaSeleccio();
    mostraPanellHexagon(descobriment.seleccionat.feature, descobriment.config);
  } else {
    mostraPanellInicial(descobriment.config);
  }
}

// Recompte a dalt de la pestanya "Parámetros"
function actualitzaResumClasses() {
  const caixa = document.getElementById("resum-classes");
  if (!caixa) return;
  const recompte = recompteClasses();
  caixa.innerHTML = descobriment.config.classes
    .map((c) => `<div><strong style="border-color:${c.color}">${recompte[c.id]}</strong>${etiquetaClasse(c)}</div>`)
    .join("");
}

// "INVESTIGAR" → "Investigar"
function etiquetaClasse(c) {
  return c.etiqueta[0] + c.etiqueta.slice(1).toLowerCase();
}

// Text de cada classe amb el llindar actual: "≥ 50", "40–49", "< 40"
function rangClasse(id) {
  const u = mirroring.llindar;
  const m = u - descobriment.config.marge_esperar;
  if (id === "investigar") return `≥ ${u} (llega al umbral)`;
  if (id === "esperar") return `${Math.max(0, m)}–${u - 1} (a menos de ${descobriment.config.marge_esperar} puntos)`;
  return `< ${Math.max(0, m)}`;
}

// --- Llegenda ---
// Un "control" de Leaflet és un element HTML col·locat damunt del mapa, en una cantonada
function afegeixLlegenda() {
  const llegenda = L.control({ position: "bottomleft" });
  llegenda.onAdd = () => {
    const div = L.DomUtil.create("div", "llegenda");
    div.innerHTML = `<button class="boto-llegenda">Leyenda</button><div class="contingut"></div>`;
    // Oberta d'entrada només en pantalles amples (on no tapa la ciutat)
    if (window.innerWidth >= 1280) div.classList.add("oberta");
    // aria-expanded: diu als lectors de pantalla si la llegenda és oberta o tancada
    const boto = div.querySelector(".boto-llegenda");
    boto.setAttribute("aria-expanded", div.classList.contains("oberta"));
    boto.addEventListener("click", () => {
      div.classList.toggle("oberta");
      boto.setAttribute("aria-expanded", div.classList.contains("oberta"));
    });
    L.DomEvent.disableClickPropagation(div); // els clics a la llegenda no arriben al mapa
    // Caselles dels clubs: un sol "escoltador" per a totes (delegació d'esdeveniments)
    div.addEventListener("change", (e) => {
      const segment = e.target.dataset.segment;
      if (!segment) return;
      if (e.target.checked) avaluacio.segmentsOcults.delete(segment);
      else avaluacio.segmentsOcults.add(segment);
      aplicaVisibilitatClubs(); // js/avaluacio.js
    });
    return div;
  };
  llegenda.addTo(mapa);
}

function actualitzaLlegenda() {
  const config = descobriment.config;
  const classes = config.classes
    .map((c) => `<div><span class="mostra" style="background:${c.color}"></span>${etiquetaClasse(c)} ${rangClasse(c.id).split(" (")[0]}</div>`)
    .join("");
  // Cada tipus de club és una casella: desmarcada, aquell segment s'amaga del mapa
  const casella = (segment, mostra, text) => `<label class="casella-capa">
    <input type="checkbox" data-segment="${segment}" ${avaluacio.segmentsOcults.has(segment) ? "" : "checked"}>
    ${mostra}${text}</label>`;
  const punt = (estil) => `<span class="punt" style="background:${estil.fillColor};
    border:${Math.max(1, estil.weight)}px solid ${estil.color === "#ffffff" ? estil.fillColor : estil.color}"></span>`;
  const clubs = Object.entries(SEGMENTS).map(([id, s]) => casella(id, punt(s.estil), s.etiqueta)).join("");
  document.querySelector(".llegenda .contingut").innerHTML = `
    <strong>Clasificación</strong>
    ${classes}
    <div><span class="mostra" style="background:${config.classes.at(-1).color};opacity:0.3"></span>Descartado por regla previa</div>
    <strong>Clubes</strong>
    ${casella("propia", `<span class="punt" style="background:${NAVY};width:12px;height:12px"></span>`, config.marca_propia)}
    ${clubs}
    <p class="nota-llegenda">Ocultar clubes solo cambia lo que se ve: la puntuación usa los segmentos elegidos en «Parámetros».</p>
    <div><span class="cercle"></span>Área: ${textArea()}</div>
  `;
}
