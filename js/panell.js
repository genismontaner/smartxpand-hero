// =============================================================
// Pas 6 · Panell de decisió
// Omple el <aside id="panell"> amb el contingut de l'hexàgon
// seleccionat, o amb l'explicació inicial si no n'hi ha cap.
// =============================================================

const panell = document.getElementById("panell");

// Format de números en castellà: 21400 → "21.400"
function numero(valor) {
  return Math.round(valor).toLocaleString("es-ES");
}

// Busca la classe (etiqueta i color) a partir del seu id
function infoClasse(id, config) {
  return config.classes.find((c) => c.id === id);
}

// Uneix frases: ["a"] → "a"; ["a", "b"] → "a y b"
function llistaFrases(frases) {
  return frases.length > 1 ? frases.slice(0, -1).join(", ") + " y " + frases.at(-1) : frases[0];
}

// Nota de decisió amb plantilla fixa. Només afirma el que diuen les dades:
// - A favor: criteris amb nota alta, ordenats pels punts que aporten
// - En contra: criteris amb nota baixa, ordenats pels punts que fan perdre
function notaDecisio(props, config) {
  const nd = config.nota_decisio;
  const nota = (c) => props.notes[c.id];

  const aFavor = config.criteris
    .filter((c) => nota(c) >= nd.nota_a_favor)
    .sort((a, b) => nota(b) * b.pes - nota(a) * a.pes)
    .slice(0, nd.maxim_per_banda)
    .map((c) => c.frase_fort);

  const enContra = config.criteris
    .filter((c) => nota(c) < nd.nota_en_contra)
    .sort((a, b) => (100 - nota(b)) * b.pes - (100 - nota(a)) * a.pes)
    .slice(0, nd.maxim_per_banda)
    .map((c) => c.frase_feble);

  const parts = [nd.classe[props.classe]];
  parts.push(aFavor.length ? nd.a_favor.replace("{llista}", llistaFrases(aFavor)) : nd.sense_a_favor);
  parts.push(enContra.length ? nd.en_contra.replace("{llista}", llistaFrases(enContra)) : nd.sense_en_contra);
  return parts.join(" ");
}

// Panell inicial: com es llegeix el mapa i quins pesos té la puntuació
function mostraPanellInicial(config) {
  const pesos = config.criteris
    .map((c) => `<li><strong>${c.etiqueta}</strong> (${c.pes} %): ${c.descripcio.toLowerCase()}</li>`)
    .join("");
  const classes = config.classes
    .map((c) => `<li><span class="etiqueta-classe" style="background:${c.color}">${c.etiqueta}</span> ${c.minim > 0 ? "≥ " + c.minim : "< " + config.classes[1].minim} puntos</li>`)
    .join("");

  panell.innerHTML = `
    <h2>Mapa de oportunidad</h2>
    <p class="subtitol">Gimnasio ${config.format} · ${config.ciutat}</p>
    <p>Cada hexágono es una zona de ${config.mida_hexagon_m} m puntuada sobre 100
       según su entorno a ${config.radi_m} m. Haz clic en un hexágono para ver por qué.</p>
    <h3>Clasificación</h3>
    <ul class="dades" style="list-style:none;padding:0">${classes}</ul>
    <h3>Pesos de la puntuación</h3>
    <ul class="dades">${pesos}</ul>
  `;
}

// Panell d'un hexàgon seleccionat. 'enTancar' és la funció que s'executa en clicar ✕
function mostraPanellHexagon(props, config, enTancar) {
  const classe = infoClasse(props.classe, config);
  let html = `
    <button class="tanca" aria-label="Cerrar">✕</button>
    <h2>${props.barri}</h2>
    <p class="subtitol">${props.districte} · zona ${props.hex_id}</p>
  `;

  if (props.puntuacio === null) {
    // Descartat per una regla prèvia: no té puntuació
    html += `
      <div class="puntuacio">
        <span class="etiqueta-classe" style="background:${classe.color}">${classe.etiqueta}</span>
      </div>
      <h3>Motivo</h3>
      <p class="nota-decisio">${props.motiu}</p>
    `;
  } else {
    // Desglossament: nota de cada criteri, pes i punts que aporta
    const desglossament = config.criteris
      .map((c) => {
        const nota = props.notes[c.id];
        const punts = (nota * c.pes) / 100;
        return `
          <div class="criteri">
            <div class="linia">
              <span>${c.etiqueta} <small>(${c.pes} %)</small></span>
              <span>${nota}/100 · aporta ${punts.toFixed(1)} pts</span>
            </div>
            <div class="barra"><div style="width:${nota}%"></div></div>
          </div>`;
      })
      .join("");

    html += `
      <div class="puntuacio">
        <span class="xifra">${props.puntuacio}<small> / 100</small></span>
        <span class="etiqueta-classe" style="background:${classe.color}">${classe.etiqueta}</span>
      </div>
      <h3>Nota de decisión</h3>
      <p class="nota-decisio">${notaDecisio(props, config)}</p>
      <h3>Desglose de la puntuación</h3>
      ${desglossament}
    `;
  }

  // Dades a 800 m (també per als descartats, per transparència)
  html += `
    <h3>Datos a ${config.radi_m} m</h3>
    <ul class="dades">
      <li>Población de 18 a 64 años: ${numero(props.pob_objectiu)}</li>
      <li>Renta neta media por persona: ${numero(props.renda)} €</li>
      <li>Competidores: ${props.n_competidors}${props.competidors ? " (" + props.competidors + ")" : ""}</li>
      <li>Solapamiento con ${config.marca_propia}: ${props.solapament_pct.toLocaleString("es-ES")} %</li>
      <li>${config.marca_propia} más cercano: ${numero(props.dist_propi_m)} m</li>
    </ul>
  `;

  // Avís urbanístic preliminar
  if (props.sol === "parcial") {
    html += `<h3>Aviso urbanístico</h3><p class="avis">${config.avisos.sol_parcial}</p>`;
  }

  panell.innerHTML = html;
  panell.querySelector(".tanca").addEventListener("click", enTancar);
}
