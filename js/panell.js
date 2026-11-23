// =============================================================
// Pas 6 i v1 pas 8 · Panell de decisió
// Omple el <div id="panell"> amb el contingut de l'hexàgon
// seleccionat, o amb l'explicació inicial si no n'hi ha cap.
// =============================================================

const panell = document.getElementById("panell");

// Format de números en castellà: 21400 → "21.400"
function numero(valor) {
  // useGrouping "always": també posa el punt a les xifres de 4 dígits (5.000, 1.762)
  return Math.round(valor).toLocaleString("es-ES", { useGrouping: "always" });
}

// Número amb un decimal en castellà: 29.1 → "29,1"
function decimal(valor) {
  return valor.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

// Uneix frases: ["a"] → "a"; ["a", "b"] → "a y b"
function llistaFrases(frases) {
  return frases.length > 1 ? frases.slice(0, -1).join(", ") + " y " + frases.at(-1) : frases[0];
}

// Nota de decisió amb plantilla fixa. Només afirma el que diuen les dades:
// - A favor: criteris amb nota alta, ordenats pels punts que aporten
// - En contra: criteris amb nota baixa, ordenats pels punts que fan perdre
// 'p' és el resultat de puntuaMirroring() (js/mirroring.js)
function notaDecisio(p, classe, config) {
  const nd = config.nota_decisio;
  const frase = (d, camp) => config.criteris.find((c) => c.id === d.criteri.id)[camp];
  const ambNota = p.detalls.filter((d) => d.nota !== null);

  const aFavor = ambNota
    .filter((d) => d.nota >= nd.nota_a_favor)
    .sort((a, b) => b.punts - a.punts)
    .slice(0, nd.maxim_per_banda)
    .map((d) => frase(d, "frase_fort"));

  const enContra = ambNota
    .filter((d) => d.nota < nd.nota_en_contra)
    .sort((a, b) => (100 - b.nota) * b.pesEfectiu - (100 - a.nota) * a.pesEfectiu)
    .slice(0, nd.maxim_per_banda)
    .map((d) => frase(d, "frase_feble"));

  const parts = [nd.classe[classe]];
  // Els textos "sense..." porten els llindars reals ({nota_a_favor}, {nota_en_contra})
  const senseAFavor = nd.sense_a_favor.replace("{nota_a_favor}", nd.nota_a_favor);
  const senseEnContra = nd.sense_en_contra.replace("{nota_en_contra}", nd.nota_en_contra);
  parts.push(aFavor.length ? nd.a_favor.replace("{llista}", llistaFrases(aFavor)) : senseAFavor);
  parts.push(enContra.length ? nd.en_contra.replace("{llista}", llistaFrases(enContra)) : senseEnContra);
  return parts.join(" ");
}

// Títol de secció amb el número dins d'un cercle daurat
function titolSeccio(numero, text, id = "") {
  return `<h3 class="seccio"${id ? ` id="${id}"` : ""}><span class="num">${numero}</span>${text}</h3>`;
}

// Panell inicial: com es llegeix el mapa, amb quins paràmetres i quantes zones hi ha de cada classe
function mostraPanellInicial(config) {
  const recompte = recompteClasses(); // js/descobriment.js
  const classes = config.classes
    .map((c) => `<li><span class="etiqueta-classe" style="background:${c.color}">${c.etiqueta}</span>
      ${rangClasse(c.id)} · <strong>${recompte[c.id]}</strong> zonas</li>`)
    .join("");
  const suma = mirroring.criteris.reduce((s, c) => s + c.pes, 0);
  const pesos = mirroring.criteris
    .map((c) => `<li><strong>${c.etiqueta}</strong> (${Math.round((c.pes / suma) * 100)} %)</li>`)
    .join("");

  panell.innerHTML = `
    <h2>Mapa de oportunidad</h2>
    <p class="subtitol">Gimnasio ${config.format} · ${config.ciutat}</p>
    <p class="intro">Cada hexágono es una zona de ${config.mida_hexagon_m} m evaluada como si fuera un local:
       ${textArea()} desde su centro, público ${textEdat()}, comparada con tus ${valorsReferencia().length}
       centros ${config.marca_propia}. Haz clic en un hexágono para ver por qué.</p>
    ${titolSeccio(1, "Clasificación")}
    <ul class="llista-classes">${classes}</ul>
    <p class="nota-relativa">${recompte.regla} zonas más, descartadas por una regla previa (suelo no
      urbanizable${avaluacio.tipusArea === "isocrona" ? ", sin isócrona a pie" : ""} o menos público
      objetivo que tu centro con menos). Los parámetros se cambian en la
      pestaña «Parámetros» y valen también para «Evaluar un local».</p>
    ${titolSeccio(2, "Pesos de la puntuación")}
    <ul class="dades">${pesos}</ul>
    ${seccioFontsIMetode(config)}
  `;
}

// Variables que l'eina no cobreix: es diu clarament, amb el motiu (no s'estimen)
function htmlNoCobertes(config, numeroSeccio) {
  const files = config.variables_no_cubiertas.map((v) => `
    <li><strong>${v.variable}</strong> <span class="etiqueta-no-cobert">No cubierto</span><br>
      ${v.motivo}${v.fuente ? `<span class="font-dada">${v.fuente}</span>` : ""}</li>`).join("");
  return `${titolSeccio(numeroSeccio, "Variables no cubiertas")}<ul class="dades no-cobertes">${files}</ul>`;
}

// "Fuentes y método": limitacions del mètode i fonts amb data (de scoring.json)
function seccioFontsIMetode(config) {
  const limitacions = config.limitacions.map((l) => `<li>${l}</li>`).join("");
  const fonts = config.fonts
    .map((f) => `<li>${f.dada}: <a href="${f.url}" target="_blank" rel="noopener">${f.font}</a> (${f.any})</li>`)
    .join("");
  return `
    ${titolSeccio(3, "Método: qué hay que saber", "fonts-i-metode")}
    <ul class="fonts">${limitacions}</ul>
    ${htmlNoCobertes(config, 4)}
    ${titolSeccio(5, "Fuentes")}
    <ul class="fonts">${fonts}</ul>
  `;
}

// Panell d'un hexàgon seleccionat: el mateix contingut que un local, més l'avís urbanístic
function mostraPanellHexagon(hex, config) {
  const p = hex.properties;
  const c = hex.calcul; // js/descobriment.js
  const classe = config.classes.find((x) => x.id === c.classe);
  const r = c.r;
  let n = 0; // comptador de seccions: ++n suma 1 i retorna el valor nou
  let html = `
    <button class="tanca" aria-label="Cerrar">✕</button>
    <h2>${p.barri}</h2>
    <p class="subtitol">${p.districte} · zona ${p.hex_id} · ${textArea()}</p>
  `;

  if (c.motiu) {
    // Descartat per una regla prèvia: no té puntuació
    html += `
      <div class="puntuacio">
        <span class="etiqueta-classe" style="background:${classe.color}">${classe.etiqueta}</span>
      </div>
      ${titolSeccio(++n, "Motivo")}
      <p class="nota-decisio">${c.motiu}</p>
    `;
  } else {
    // Mateix bloc que un local (puntuació, sí/no i desglossament), amb la classe de la zona
    html += `
      <div class="puntuacio">
        <span class="etiqueta-classe" style="background:${classe.color}">${classe.etiqueta}</span>
      </div>
      ${htmlMirroring(c.valors, false, "Esta zona")}
      ${titolSeccio(2, "Nota de decisión")}
      <p class="nota-decisio">${notaDecisio(c.puntuacio, c.classe, config)}</p>
    `;
    n = 2; // htmlMirroring ja porta la secció 1 (desglossament)
  }

  // Dades de l'àrea (també per als descartats, per transparència). Sense isòcrona no n'hi ha
  if (r) {
    const competidors = Object.entries(SEGMENTS)
      .map(([id, s]) => `${s.etiqueta}: ${(r.clubs[id] || []).filter((x) => x.estat === "obert").length}`)
      .join(" · ");
    const pctCompartida = r.pobObjectiu ? (r.compartida / r.pobObjectiu) * 100 : 0;
    html += `
      ${titolSeccio(++n, "Datos del área")}
      <ul class="dades">
        <li>Público objetivo (${textEdat()}): <strong>${numero(r.pobObjectiu)}</strong>
          · población total ${numero(r.pobTotal)}</li>
        <li>Renta neta media por hogar: <strong>${r.rendaLlar ? numero(r.rendaLlar) + " €" : "sin dato"}</strong></li>
        <li>Competencia abierta: ${competidors}</li>
        <li>Público compartido con centros propios: <strong>${decimal(pctCompartida)} %</strong></li>
        <li>${config.marca_propia} más cercano: ${numero(r.propiMesProper)} m</li>
      </ul>
      ${font("INE, Censo Anual de Población 2024 y ADRH 2024 (rejilla de 100 m) · clubes: webs oficiales, Open Data BCN y OpenStreetMap")}
      ${avaluacio.tipusArea === "isocrona" ? font(fontIsocrones()) : ""}
    `;
  }

  // Avís urbanístic preliminar: SEMPRE, amb "Requiere confirmación profesional"
  const avisos = config.avisos;
  html += `
    ${titolSeccio(++n, "Aviso urbanístico preliminar")}
    <p class="avis">
      ${avisos[p.sol]} <strong>${avisos.sempre}</strong><br>
      <small>${avisos.font}</small>
    </p>
    <button class="boto-guardar" id="avaluar-zona">Evaluar este punto como local</button>
    <button class="enllac">Ver fuentes y método</button>
  `;

  panell.innerHTML = html;
  panell.scrollTop = 0;
  panell.querySelector(".tanca").addEventListener("click", () => desseleccionaHexagon());
  // Porta d'entrada a l'avaluació: el centre de l'hexàgon passa a ser el local candidat
  panell.querySelector("#avaluar-zona").addEventListener("click", async () => {
    passaIsocronesZonaALocal(hex); // js/descobriment.js
    await canviaMode("avaluar");
    situaPunt([hex.centre.lat, hex.centre.lon], true, `Centro de la zona ${p.hex_id} (${p.barri})`);
  });
  panell.querySelector(".enllac").addEventListener("click", () => {
    desseleccionaHexagon();
    document.getElementById("fonts-i-metode").scrollIntoView({ behavior: "smooth" });
  });
}
