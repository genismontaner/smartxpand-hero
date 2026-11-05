// =============================================================
// Fase A · Pestanya "Ajustes"
// Guarda els valors triats per l'usuari, prepara una còpia de la
// configuració amb aquests valors i dibuixa els controls.
// =============================================================

// Valors inicials: els de scoring.json
function ajustosPerDefecte(config) {
  const pesos = {};
  for (const c of config.criteris) pesos[c.id] = c.pes;
  const regla = config.regles_previes.find((r) => r.id === "poblacio_minima");
  return {
    pesos,
    franjaRenda: config.franja_renda_defecte,
    comptarCem: true,
    comptarPrevistos: false,
    poblacioMinima: regla.minim,
  };
}

// Còpia de la configuració amb els ajustos aplicats (l'original no es toca)
function configEfectiva(config, ajustos) {
  const copia = structuredClone(config);
  const suma = Object.values(ajustos.pesos).reduce((a, b) => a + b, 0);

  for (const c of copia.criteris) {
    // Pesos normalitzats: sempre sumen 100 %
    c.pes = (ajustos.pesos[c.id] / suma) * 100;
    if (c.sentit === "franja_mitjana") {
      c.franja_percentils = copia.franges_renda.find((f) => f.id === ajustos.franjaRenda).percentils;
    }
  }

  const regla = copia.regles_previes.find((r) => r.id === "poblacio_minima");
  regla.minim = ajustos.poblacioMinima;
  regla.motiu = regla.motiu.replace("{minim}", numero(ajustos.poblacioMinima));
  return copia;
}

// Centre aproximat d'un hexàgon: mitjana dels seus vèrtexs (l'últim repeteix el primer)
function centreHexagon(hex) {
  const vertexs = hex.geometry.coordinates[0].slice(0, -1);
  const lon = vertexs.reduce((suma, v) => suma + v[0], 0) / vertexs.length;
  const lat = vertexs.reduce((suma, v) => suma + v[1], 0) / vertexs.length;
  return L.latLng(lat, lon);
}

// Actualitza el recompte i els noms de competidors de cada hexàgon segons els ajustos
function aplicaCompetencia(hexagons, clubs, config, ajustos) {
  const previstos = clubs.features.filter((c) => c.properties.estat === "previst");

  for (const hex of hexagons.features) {
    const p = hex.properties;
    // La primera vegada, guardem els competidors calculats a QGIS
    if (!p.competidors_base) {
      p.competidors_base = p.competidors ? p.competidors.split("; ") : [];
    }

    let noms = p.competidors_base;
    if (!ajustos.comptarCem) noms = noms.filter((nom) => !nom.startsWith("CEM "));

    if (ajustos.comptarPrevistos) {
      const centre = centreHexagon(hex);
      const propers = previstos
        .filter((c) => {
          const [lon, lat] = c.geometry.coordinates;
          return centre.distanceTo([lat, lon]) <= config.radi_m;
        })
        .map((c) => `${c.properties.nom} (apertura prevista)`);
      noms = noms.concat(propers);
    }

    p.n_competidors = noms.length;
    p.competidors = noms.join("; ");
  }
}

// Resum en una frase, perquè una captura digui amb quins paràmetres s'ha fet
function resumAjustos(config, ajustos) {
  const suma = Object.values(ajustos.pesos).reduce((a, b) => a + b, 0);
  const pesos = config.criteris
    .map((c) => `${c.etiqueta} ${Math.round((ajustos.pesos[c.id] / suma) * 100)} %`)
    .join(", ");
  const renda = config.franges_renda.find((f) => f.id === ajustos.franjaRenda).etiqueta.toLowerCase();
  return `Parámetros: ${pesos}; renta objetivo ${renda}; ` +
    `centros municipales ${ajustos.comptarCem ? "incluidos" : "excluidos"}; ` +
    `aperturas previstas ${ajustos.comptarPrevistos ? "incluidas" : "excluidas"}; ` +
    `mínimo ${numero(ajustos.poblacioMinima)} personas.`;
}

// Dibuixa els controls. 'enCanviar' s'executa cada vegada que l'usuari canvia un valor
function mostraAjustes(config, ajustos, enCanviar) {
  const vista = document.getElementById("ajustes");

  const lliscants = config.criteris
    .map((c) => `
      <div class="criteri">
        <div class="linia">
          <label for="pes-${c.id}">${c.etiqueta}</label>
          <span class="valor" id="valor-pes-${c.id}"></span>
        </div>
        <input type="range" id="pes-${c.id}" data-criteri="${c.id}" min="0" max="100" step="5" value="${ajustos.pesos[c.id]}">
      </div>`)
    .join("");

  const franges = config.franges_renda
    .map((f) => `<button class="pindola${f.id === ajustos.franjaRenda ? " activa" : ""}" data-franja="${f.id}">${f.etiqueta}</button>`)
    .join("");

  vista.innerHTML = `
    <h2>Ajustes</h2>
    <p class="subtitol">El mapa se recalcula al momento</p>
    <div id="resum-classes" class="resum-classes"></div>

    ${titolSeccio(1, "Área analizada")}
    <p class="nota-relativa">Radio de ${config.radi_m} m en línea recta y población de 18 a 64 años.
      No se pueden modificar en esta versión.</p>

    ${titolSeccio(2, "Pesos de la puntuación")}
    ${lliscants}
    <p class="nota-relativa">Los pesos se ajustan solos para que sumen 100 %.</p>

    ${titolSeccio(3, "Renta objetivo")}
    <div class="pindoles">${franges}</div>
    <p class="nota-relativa">Puntúa más la franja elegida, según los percentiles de renta de ${config.ciutat}.</p>

    ${titolSeccio(4, "Competencia")}
    <label class="casella"><input type="checkbox" id="comptar-cem" ${ajustos.comptarCem ? "checked" : ""}> Contar centros deportivos municipales</label>
    <label class="casella"><input type="checkbox" id="comptar-previstos" ${ajustos.comptarPrevistos ? "checked" : ""}> Contar aperturas previstas</label>

    ${titolSeccio(5, "Población mínima")}
    <div class="criteri">
      <div class="linia">
        <label for="pob-minima">Personas de 18 a 64 años a ${config.radi_m} m</label>
        <span class="valor" id="valor-pob-minima"></span>
      </div>
      <input type="range" id="pob-minima" min="0" max="20000" step="1000" value="${ajustos.poblacioMinima}">
    </div>

    <button class="boto-restablir">Restablecer valores</button>
  `;

  // Escriu al costat de cada control el valor actual
  function actualitzaValors() {
    const suma = Object.values(ajustos.pesos).reduce((a, b) => a + b, 0);
    for (const c of config.criteris) {
      vista.querySelector(`#valor-pes-${c.id}`).textContent = `${Math.round((ajustos.pesos[c.id] / suma) * 100)} %`;
    }
    vista.querySelector("#valor-pob-minima").textContent = numero(ajustos.poblacioMinima);
  }

  // Pesos: 'input' s'activa mentre es mou el control
  vista.querySelectorAll("[data-criteri]").forEach((control) => {
    control.addEventListener("input", () => {
      ajustos.pesos[control.dataset.criteri] = Number(control.value);
      // No pot ser que tots els pesos siguin 0: no hi hauria puntuació
      if (Object.values(ajustos.pesos).every((pes) => pes === 0)) {
        ajustos.pesos[control.dataset.criteri] = 5;
        control.value = 5;
      }
      actualitzaValors();
      enCanviar();
    });
  });

  vista.querySelectorAll("[data-franja]").forEach((boto) => {
    boto.addEventListener("click", () => {
      ajustos.franjaRenda = boto.dataset.franja;
      vista.querySelectorAll("[data-franja]").forEach((b) => b.classList.toggle("activa", b === boto));
      enCanviar();
    });
  });

  vista.querySelector("#comptar-cem").addEventListener("change", (esdeveniment) => {
    ajustos.comptarCem = esdeveniment.target.checked;
    enCanviar();
  });
  vista.querySelector("#comptar-previstos").addEventListener("change", (esdeveniment) => {
    ajustos.comptarPrevistos = esdeveniment.target.checked;
    enCanviar();
  });
  vista.querySelector("#pob-minima").addEventListener("input", (esdeveniment) => {
    ajustos.poblacioMinima = Number(esdeveniment.target.value);
    actualitzaValors();
    enCanviar();
  });

  vista.querySelector(".boto-restablir").addEventListener("click", () => {
    Object.assign(ajustos, ajustosPerDefecte(config));
    mostraAjustes(config, ajustos, enCanviar);
    enCanviar();
  });

  actualitzaValors();
}

// Recompte de zones per classe, a dalt de la pestanya
function actualitzaResumClasses(hexagons, config) {
  const recompte = {};
  for (const hex of hexagons.features) {
    const p = hex.properties;
    if (!p.motiu) recompte[p.classe] = (recompte[p.classe] || 0) + 1;
  }
  document.getElementById("resum-classes").innerHTML = config.classes
    .map((c) => `<div><strong style="color:${c.color}">${recompte[c.id] || 0}</strong>${c.etiqueta[0] + c.etiqueta.slice(1).toLowerCase()}</div>`)
    .join("");
}
