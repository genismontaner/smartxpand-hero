// =============================================================
// v1 · Pas 7 · Calibratge contra els centres propis
// L'usuari carrega un CSV amb el rendiment real dels seus centres.
// L'eina puntua cada centre amb els paràmetres actuals i compara
// el seu rànquing amb el real (correlació de rangs de Spearman).
// El fitxer es llegeix al navegador: no s'envia enlloc.
// =============================================================

const calibratge = {
  nomFitxer: null,
  files: [], // { nom, rendiment, club } (club = centre propi aparellat)
  avisos: [], // files que no s'han pogut fer servir, amb el motiu
  error: null,
};

const DISTANCIA_APARELLAMENT_M = 100;

// --- Lectura del CSV ---

// Text sense accents i en minúscules, per reconèixer les capçaleres
function normalitza(text) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

// Número escrit a l'espanyola o a l'anglesa: "1.234,5" → 1234.5; "41,39" → 41.39; "41.39" → 41.39
function numeroCSV(text) {
  let t = (text || "").trim().replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Converteix el text del CSV en files. Separador ";" (Excel en castellà) o ","
function llegeixCSV(text) {
  const linies = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (linies.length < 2) throw new Error("El fichero está vacío o solo tiene la cabecera.");
  const sep = (linies[0].match(/;/g) || []).length >= (linies[0].match(/,/g) || []).length ? ";" : ",";
  const capcalera = linies[0].split(sep).map(normalitza);
  // Noms de columna acceptats (castellà, català o anglès)
  const columna = (noms) => capcalera.findIndex((c) => noms.includes(c));
  const i = {
    nom: columna(["nombre", "nom", "name", "centro", "centre"]),
    lat: columna(["lat", "latitud", "latitude"]),
    lon: columna(["lon", "lng", "longitud", "longitude"]),
    rendiment: columna(["rendimiento", "rendiment", "performance"]),
  };
  const falten = Object.entries(i).filter(([, v]) => v < 0).map(([k]) => ({ nom: "nombre", lat: "lat", lon: "lon", rendiment: "rendimiento" })[k]);
  if (falten.length) throw new Error(`Faltan columnas: ${falten.join(", ")}.`);

  return linies.slice(1).map((linia, n) => {
    const camps = linia.split(sep);
    return {
      fila: n + 2, // número de fila tal com es veu a l'Excel
      nom: (camps[i.nom] || "").trim(),
      lat: numeroCSV(camps[i.lat]),
      lon: numeroCSV(camps[i.lon]),
      rendiment: numeroCSV(camps[i.rendiment]),
    };
  });
}

// Relaciona cada fila amb el centre propi obert més proper (a menys de 100 m)
function aparella(files) {
  const propis = avaluacio.clubs.features.filter(
    (c) => c.properties.segment === "propia" && c.properties.estat === "obert"
  );
  const usats = new Set();
  calibratge.files = [];
  calibratge.avisos = [];
  for (const f of files) {
    const etiqueta = `Fila ${f.fila}${f.nom ? ` (${f.nom})` : ""}`;
    if (f.lat === null || f.lon === null) { calibratge.avisos.push(`${etiqueta}: sin coordenadas.`); continue; }
    if (f.rendiment === null) { calibratge.avisos.push(`${etiqueta}: sin rendimiento.`); continue; }
    let millor = null;
    let dMin = Infinity;
    for (const c of propis) {
      const [lon, lat] = c.geometry.coordinates;
      const d = distanciaM(f.lat, f.lon, lat, lon);
      if (d < dMin) { dMin = d; millor = c; }
    }
    if (dMin > DISTANCIA_APARELLAMENT_M) {
      calibratge.avisos.push(`${etiqueta}: no reconocido (ningún centro propio a menos de ${DISTANCIA_APARELLAMENT_M} m).`);
      continue;
    }
    if (usats.has(millor)) { calibratge.avisos.push(`${etiqueta}: centro repetido (${millor.properties.nom}).`); continue; }
    usats.add(millor);
    calibratge.files.push({ nom: f.nom || millor.properties.nom, rendiment: f.rendiment, club: millor });
  }
}

// Punt d'entrada: text del fitxer → files aparellades → resultats
function carregaCalibratge(text, nomFitxer) {
  calibratge.nomFitxer = nomFitxer;
  calibratge.error = null;
  try {
    aparella(llegeixCSV(text));
  } catch (error) {
    calibratge.files = [];
    calibratge.avisos = [];
    calibratge.error = error.message;
  }
  mostraCalibratge();
}

// --- Estadística ---

// Rangs: el valor més alt té el rang 1. Empats: rang mitjà (com el percentil de js/mirroring.js)
function rangs(valors) {
  const ordenats = valors.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v);
  const r = new Array(valors.length);
  for (let k = 0; k < ordenats.length;) {
    let fi = k;
    while (fi + 1 < ordenats.length && ordenats[fi + 1].v === ordenats[k].v) fi++;
    for (let m = k; m <= fi; m++) r[ordenats[m].i] = (k + fi) / 2 + 1;
    k = fi + 1;
  }
  return r;
}

// Correlació de Spearman: la correlació de Pearson dels rangs (de −1 a 1)
function spearman(a, b) {
  const ra = rangs(a);
  const rb = rangs(b);
  const n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n;
  const mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : null; // null si tots els valors són iguals
}

// Lectura en paraules d'una correlació (llindars convencionals, orientatius)
function lecturaCorrelacio(rho) {
  if (rho === null) return "no calculable (todos los valores son iguales)";
  const a = Math.abs(rho);
  const forca = a < 0.2 ? "sin relación clara" : a < 0.5 ? "relación débil" : "relación fuerte";
  return a < 0.2 ? forca : `${forca}${rho < 0 ? " e inversa" : ""}`;
}

function formatRho(rho) {
  return rho === null ? "—" : rho.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "exceptZero" });
}

// --- Panell ---

// Plantilla amb els centres propis i la columna de rendiment buida (no tenim dades reals).
// Blob = un fitxer creat a la memòria del navegador; createObjectURL li dona una adreça per descarregar-lo
function urlPlantilla() {
  const coma = (x) => String(x).replace(".", ",");
  const files = avaluacio.clubs.features
    .filter((c) => c.properties.segment === "propia" && c.properties.estat === "obert")
    .map((c) => `${c.properties.nom};${coma(c.geometry.coordinates[1])};${coma(c.geometry.coordinates[0])};`);
  const text = "﻿" + ["nombre;lat;lon;rendimiento", ...files].join("\r\n");
  return URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
}

// Apartat plegable amb el selector de fitxer (es dibuixa una sola vegada amb els controls)
function htmlCalibratge() {
  return `
    <details class="plegable" id="calibratge">
      <summary>Calibración con tus centros</summary>
      <p class="nota-relativa">Carga un CSV con el rendimiento real de tus centros (socios, facturación,
        ocupación…). Solo se usa el orden, no la cifra. El fichero se lee en este navegador y no se
        envía a ningún sitio.</p>
      <p class="nota-relativa">Columnas: <strong>nombre; lat; lon; rendimiento</strong>, sin separador
        de miles. <a href="${urlPlantilla()}" download="plantilla_calibracion.csv">Descargar plantilla</a>
        (tus centros, con el rendimiento vacío).</p>
      <!-- El selector de fitxers del navegador surt en l'idioma del navegador: s'amaga i es fa servir
           una etiqueta (label) com a botó, que l'obre igualment -->
      <label class="boto-guardar boto-fitxer">Cargar CSV de rendimiento
        <input type="file" id="fitxer-calibratge" accept=".csv,text/csv" hidden></label>
      <div id="resultats-calibratge"></div>
    </details>`;
}

function connectaCalibratge() {
  document.getElementById("fitxer-calibratge").addEventListener("change", async (e) => {
    const fitxer = e.target.files[0];
    if (!fitxer) return;
    carregaCalibratge(await fitxer.text(), fitxer.name); // .text(): llegeix el fitxer com a text
  });
  mostraCalibratge();
}

// Resultats del calibratge amb els paràmetres actuals (es recalculen a cada canvi)
function mostraCalibratge() {
  const caixa = document.getElementById("resultats-calibratge");
  if (!caixa) return;
  if (calibratge.error) {
    caixa.innerHTML = `<p class="avis">${calibratge.nomFitxer}: ${calibratge.error}</p>`;
    return;
  }
  if (!calibratge.nomFitxer) { caixa.innerHTML = ""; return; }

  const avisos = calibratge.avisos.length
    ? `<details class="avisos-calibratge"><summary>${calibratge.avisos.length} fila(s) sin usar</summary>
        <ul class="dades">${calibratge.avisos.map((a) => `<li>${a}</li>`).join("")}</ul></details>`
    : "";
  const n = calibratge.files.length;
  if (n < 3) {
    caixa.innerHTML = `<p class="avis">${calibratge.nomFitxer}: hacen falta al menos 3 centros reconocidos
      con rendimiento (hay ${n}).</p>${avisos}`;
    return;
  }

  // Cada centre, puntuat com un local (el solapament es mesura amb els altres centres)
  const resultats = calibratge.files.map((f) => {
    const [lon, lat] = f.club.geometry.coordinates;
    const valors = valorsCriteris(calculaArea(areaPropi(f.club), [lat, lon]));
    return { ...f, p: puntuaMirroring(valors) };
  });

  const rendiments = resultats.map((x) => x.rendiment);
  const rhoTotal = spearman(resultats.map((x) => x.p.total), rendiments);
  const llocEina = rangs(resultats.map((x) => x.p.total));
  const llocReal = rangs(rendiments);

  // Correlació de cada criteri (la seva nota) amb el rendiment
  const perCriteri = mirroring.criteris.map((c) => {
    const parelles = resultats
      .map((x) => [x.p.detalls.find((d) => d.criteri.id === c.id).nota, x.rendiment])
      .filter(([nota]) => nota !== null);
    const rho = parelles.length >= 3 ? spearman(parelles.map((p) => p[0]), parelles.map((p) => p[1])) : null;
    return `<li>${c.etiqueta}: <strong>${formatRho(rho)}</strong> · ${lecturaCorrelacio(rho)}</li>`;
  }).join("");

  const ordre = resultats.map((x, i) => ({ ...x, llocEina: llocEina[i], llocReal: llocReal[i] }))
    .sort((a, b) => a.llocReal - b.llocReal);
  const lloc = (v) => (Number.isInteger(v) ? v : decimal(v)); // empats: puesto mitjà (p. ex. 3,5)
  const files = ordre.map((x) => `
    <tr><th scope="row">${x.nom}</th><td>${lloc(x.llocReal)}</td><td>${lloc(x.llocEina)}</td>
      <td>${x.p.total}</td></tr>`).join("");

  caixa.innerHTML = `
    <p class="nota-relativa">${calibratge.nomFitxer} · ${n} centros reconocidos</p>
    ${avisos}
    <div class="puntuacio">
      <span class="xifra">${formatRho(rhoTotal)}</span>
      <span class="nota-relativa">Correlación entre el orden real y el de la herramienta:
        ${lecturaCorrelacio(rhoTotal)}</span>
    </div>
    <p class="nota-relativa">1 = mismo orden; 0 = sin relación; −1 = orden inverso (correlación de rangos
      de Spearman). Con ${n} centros es orientativa. Calculada con los parámetros actuales:
      ${textArea()}, público ${textEdat()}, pesos y segmentos.</p>
    <p class="nota-relativa"><strong>Cada criterio frente al rendimiento real</strong> (para revisar los pesos):</p>
    <ul class="dades">${perCriteri}</ul>
    <div class="taula-contenidor">
      <table class="taula-comparador">
        <thead><tr><th></th><th scope="col">Puesto real</th><th scope="col">Puesto herramienta</th>
          <th scope="col">Puntuación</th></tr></thead>
        <tbody>${files}</tbody>
      </table>
    </div>
    ${font("Rendimiento: fichero cargado por el usuario. Puntuación: misma fórmula que para un local.")}
  `;
}
