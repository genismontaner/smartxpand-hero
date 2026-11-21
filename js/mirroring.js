// =============================================================
// v1 · Pas 3 · Puntuació "mirroring"
// Cada criteri del local candidat es compara amb el mateix criteri
// calculat per als centres propis (mateix radi, edat i segments).
// Nota = percentil entre els centres propis: 50 = com la mediana.
// =============================================================

const mirroring = {
  // sentit: "mes" (més és millor), "menys" (menys és millor),
  //         "proper" (com més a prop de la mediana dels centres propis, millor)
  criteris: [
    { id: "poblacio", etiqueta: "Público objetivo", sentit: "mes", pes: 35 },
    { id: "competencia", etiqueta: "Competencia", sentit: "menys", pes: 25 },
    { id: "solapament", etiqueta: "Solapamiento con centros propios", sentit: "menys", pes: 25 },
    { id: "renda", etiqueta: "Renta por hogar", sentit: "proper", pes: 15 },
  ],
  // Segments que compten com a competència (l'usuari ho pot canviar)
  segments: { "low cost": true, "municipal": true, "gama media": false, "premium": false },
  llindar: 50, // mínim per respondre "sí"
  memoria: { clau: null, valors: null }, // valors dels centres propis ja calculats
};

const PESOS_INICIALS = Object.fromEntries(mirroring.criteris.map((c) => [c.id, c.pes]));

// Mediana d'una llista de números
function mediana(llista) {
  const ordenada = [...llista].sort((a, b) => a - b);
  const meitat = Math.floor(ordenada.length / 2);
  return ordenada.length % 2 ? ordenada[meitat] : (ordenada[meitat - 1] + ordenada[meitat]) / 2;
}

// Valors dels quatre criteris a partir del resultat de calculaArea()
function valorsCriteris(r) {
  const competidors = Object.entries(mirroring.segments)
    .filter(([, compta]) => compta)
    .reduce((n, [id]) => n + (r.clubs[id] || []).filter((c) => c.estat === "obert").length, 0);
  return {
    poblacio: r.pobObjectiu,
    competencia: competidors,
    solapament: r.pobObjectiu ? (r.compartida / r.pobObjectiu) * 100 : 0,
    renda: r.rendaLlar,
  };
}

// Valors de cada centre propi amb els paràmetres actuals (es recalculen només si canvien)
function valorsReferencia() {
  const clau = [avaluacio.radiKm, avaluacio.edatDes, avaluacio.edatFins,
    JSON.stringify(mirroring.segments)].join("|");
  if (mirroring.memoria.clau === clau) return mirroring.memoria.valors;

  const propis = avaluacio.clubs.features.filter(
    (c) => c.properties.segment === "propia" && c.properties.estat === "obert"
  );
  const valors = propis.map((c) => {
    const [lon, lat] = c.geometry.coordinates;
    // El solapament d'un centre propi es mesura amb els ALTRES centres propis
    const r = calculaArea(lat, lon, avaluacio.radiKm * 1000, [lat, lon]);
    return { nom: c.properties.nom, ...valorsCriteris(r) };
  });
  mirroring.memoria = { clau, valors };
  return valors;
}

// Nota de 0 a 100 d'un valor comparat amb els dels centres propis
function notaMirroring(criteri, valor, referencia) {
  if (valor === null || valor === undefined) return null;
  const p = percentil(valor, referencia); // js/puntuacio.js
  if (criteri.sentit === "mes") return p;
  if (criteri.sentit === "menys") return 100 - p;
  return Math.max(0, 100 - Math.abs(p - 50) * 2); // "proper": màxim a la mediana
}

// Puntuació del candidat: notes, punts que aporta cada criteri i total
function puntuaMirroring(valors) {
  const referencia = valorsReferencia();
  const detalls = mirroring.criteris.map((c) => {
    const llista = referencia.map((v) => v[c.id]).filter((v) => v !== null && v !== undefined);
    const nota = notaMirroring(c, valors[c.id], llista);
    return { criteri: c, valor: valors[c.id], mediana: mediana(llista), nota };
  });

  // Els criteris sense dada no compten: els pesos es reparteixen entre els que sí
  const ambNota = detalls.filter((d) => d.nota !== null);
  const sumaPesos = ambNota.reduce((s, d) => s + d.criteri.pes, 0);
  for (const d of detalls) {
    d.pesEfectiu = d.nota === null || !sumaPesos ? 0 : (d.criteri.pes / sumaPesos) * 100;
    d.punts = d.nota === null ? 0 : (d.nota * d.pesEfectiu) / 100;
  }
  const total = detalls.reduce((s, d) => s + d.punts, 0);
  return { total: Math.round(total), detalls, nCentres: referencia.length };
}

// Format de cada valor per al panell
function formatValor(id, valor) {
  if (valor === null || valor === undefined) return "sin dato";
  if (id === "solapament") return `${decimal(valor)} %`;
  if (id === "renda") return `${numero(valor)} €`;
  return numero(valor);
}

// Bloc de resultat: puntuació, sí/no i desglossament
function htmlMirroring(valors) {
  const p = puntuaMirroring(valors);
  const arriba = p.total >= mirroring.llindar;
  const files = p.detalls.map((d) => `
    <div class="criteri">
      <div class="linia">
        <span>${d.criteri.etiqueta} <small>(${Math.round(d.pesEfectiu)} %)</small></span>
        <span class="valor">${d.nota === null ? "sin dato" : `${Math.round(d.nota)}/100 · +${decimal(d.punts)} pts`}</span>
      </div>
      <div class="barra"><div style="width:${d.nota ?? 0}%"></div></div>
      <small class="comparacio">Este local: ${formatValor(d.criteri.id, d.valor)} · mediana de tus centros:
        ${formatValor(d.criteri.id, d.mediana)}</small>
    </div>`).join("");

  return `
    <div class="puntuacio">
      <span class="xifra">${p.total}<small> / 100</small></span>
      <span class="etiqueta-classe ${arriba ? "si" : "no"}">${arriba ? "SÍ llega al mínimo" : "NO llega al mínimo"}</span>
    </div>
    <p class="nota-relativa">Comparado con tus ${p.nCentres} centros con los mismos parámetros.
      50 = como la mediana de tus centros. Umbral fijado: ${mirroring.llindar}.
      No es una previsión de socios ni de facturación.</p>
    ${titolSeccio(1, "Desglose de la puntuación")}
    ${files}
  `;
}

// Controls de criteris, pesos, segments i llindar (dins d'un apartat plegable)
function htmlControlsMirroring() {
  const pesos = mirroring.criteris.map((c) => `
    <div class="criteri">
      <div class="linia"><label for="mpes-${c.id}">${c.etiqueta}</label>
        <span class="valor" id="mvalor-${c.id}"></span></div>
      <input type="range" id="mpes-${c.id}" data-mcriteri="${c.id}" min="0" max="100" step="5" value="${c.pes}">
    </div>`).join("");
  const segments = Object.entries(mirroring.segments).map(([id, compta]) => `
    <label class="casella"><input type="checkbox" data-msegment="${id}" ${compta ? "checked" : ""}>
      ${SEGMENTS[id].etiqueta}</label>`).join("");

  // <details>: apartat que s'obre i es tanca sense JavaScript
  return `
    <details class="plegable">
      <summary>Criterios, pesos y umbral</summary>
      <p class="nota-relativa">Pesos (se ajustan solos para sumar 100 %)</p>
      ${pesos}
      <p class="nota-relativa">Cuentan como competencia</p>
      ${segments}
      <div class="criteri">
        <div class="linia"><label for="llindar">Umbral mínimo (sí / no)</label>
          <span class="valor" id="valor-llindar">${mirroring.llindar}</span></div>
        <input type="range" id="llindar" min="0" max="100" step="5" value="${mirroring.llindar}">
      </div>
      <button class="boto-restablir" id="restablir-mirroring">Restablecer valores</button>
    </details>
  `;
}

// Escriu els pesos normalitzats al costat de cada control
function actualitzaValorsPesos() {
  const suma = mirroring.criteris.reduce((s, c) => s + c.pes, 0);
  for (const c of mirroring.criteris) {
    document.getElementById(`mvalor-${c.id}`).textContent = `${Math.round((c.pes / suma) * 100)} %`;
  }
}

// Connecta els controls. 'enCanviar' redibuixa els resultats
function connectaControlsMirroring(enCanviar) {
  document.querySelectorAll("[data-mcriteri]").forEach((control) => {
    control.addEventListener("input", () => {
      const criteri = mirroring.criteris.find((c) => c.id === control.dataset.mcriteri);
      criteri.pes = Number(control.value);
      // Tots els pesos a 0 no té sentit: es manté un mínim
      if (mirroring.criteris.every((c) => c.pes === 0)) {
        criteri.pes = 5;
        control.value = 5;
      }
      actualitzaValorsPesos();
      enCanviar();
    });
  });
  document.querySelectorAll("[data-msegment]").forEach((casella) => {
    casella.addEventListener("change", () => {
      mirroring.segments[casella.dataset.msegment] = casella.checked;
      enCanviar();
    });
  });
  document.getElementById("llindar").addEventListener("input", (e) => {
    mirroring.llindar = Number(e.target.value);
    document.getElementById("valor-llindar").textContent = mirroring.llindar;
    enCanviar();
  });
  document.getElementById("restablir-mirroring").addEventListener("click", () => {
    for (const c of mirroring.criteris) c.pes = PESOS_INICIALS[c.id];
    mirroring.segments = { "low cost": true, "municipal": true, "gama media": false, "premium": false };
    mirroring.llindar = 50;
    dibuixaControlsAvaluacio(); // torna a dibuixar els controls amb els valors inicials
    mostraResultatsAvaluacio();
  });
  actualitzaValorsPesos();
}
