// =============================================================
// v1 · Pas 4 · Comparador de locals candidats
// L'usuari desa fins a 5 locals (A, B, C...). Tots es recalculen
// sempre amb els paràmetres actuals (àrea, edat, pesos, segments),
// perquè la comparació sigui justa.
// =============================================================

const comparador = {
  locals: [], // { lletra, nom, lat, lon }
  maxim: 5,
  capa: null, // marcadors amb la lletra de cada local
};

// Desa el punt actual per comparar-lo
function guardaLocal() {
  const punt = avaluacio.punt;
  if (!punt || comparador.locals.length >= comparador.maxim) return;
  // Si ja està desat (a menys de 10 m), no es duplica
  if (comparador.locals.some((l) => distanciaM(l.lat, l.lon, punt.lat, punt.lng) < 10)) return;
  const lletra = "ABCDE".split("").find((x) => !comparador.locals.some((l) => l.lletra === x));
  comparador.locals.push({ lletra, nom: avaluacio.nomPunt, lat: punt.lat, lon: punt.lng });
  dibuixaMarcadorsLocals();
  mostraResultatsAvaluacio();
}

function treuLocal(lletra) {
  comparador.locals = comparador.locals.filter((l) => l.lletra !== lletra);
  dibuixaMarcadorsLocals();
  mostraResultatsAvaluacio();
}

// Marcadors al mapa: un cercle navy amb la lletra (L.divIcon = marcador fet amb HTML)
function dibuixaMarcadorsLocals() {
  if (!comparador.capa) comparador.capa = L.layerGroup().addTo(mapa);
  comparador.capa.clearLayers();
  for (const l of comparador.locals) {
    L.marker([l.lat, l.lon], {
      icon: L.divIcon({ className: "marcador-local", html: l.lletra, iconSize: [26, 26] }),
      interactive: false,
      pane: "superior",
    }).addTo(comparador.capa);
  }
}

// Botó per desar el local que s'està avaluant
function htmlBotoGuardar() {
  const punt = avaluacio.punt;
  const jaDesat = comparador.locals.find((l) => distanciaM(l.lat, l.lon, punt.lat, punt.lng) < 10);
  if (jaDesat) return `<p class="nota-relativa">Guardado como local ${jaDesat.lletra} para comparar.</p>`;
  if (comparador.locals.length >= comparador.maxim) {
    return `<p class="nota-relativa">Ya hay ${comparador.maxim} locales guardados (máximo).</p>`;
  }
  return `<button class="boto-guardar" id="guardar-local">Guardar para comparar</button>`;
}

// Taula comparativa: es recalcula amb els paràmetres actuals
function htmlComparador(numeroSeccio) {
  if (!comparador.locals.length) return "";
  const titol = titolSeccio(numeroSeccio, "Comparar locales");
  if (comparador.locals.length < 2) {
    return `${titol}<p class="nota-relativa">Local ${comparador.locals[0].lletra} guardado.
      Guarda al menos otro para compararlos.</p>`;
  }

  // Àrea de cada local amb els paràmetres actuals (amb isòcrona, pot caldre demanar-la a ORS)
  const arees = comparador.locals.map((l) => areaCandidat(l.lat, l.lon));
  if (arees.some((a) => !a)) return `${titol}<p class="nota-relativa">Calculando las isócronas de los locales guardados…</p>`;
  const ambError = comparador.locals.filter((l, i) => arees[i].error).map((l) => l.lletra);
  if (ambError.length) {
    return `${titol}<p class="avis">No se ha podido calcular la isócrona de: ${ambError.join(", ")}.
      ${arees.find((a) => a.error).error}</p>`;
  }

  const resultats = comparador.locals.map((l, i) => {
    const r = calculaArea(arees[i]);
    const valors = valorsCriteris(r);
    return { local: l, r, valors, p: puntuaMirroring(valors), incomplet: foraZonaDades(arees[i]) };
  });

  // Fila de la taula. 'millor' indica quin valor és millor ("max" o "min") per posar-lo en negreta
  function fila(etiqueta, valors, format, millor) {
    const numerics = valors.filter((v) => v !== null && v !== undefined);
    const objectiu = millor === "max" ? Math.max(...numerics) : millor === "min" ? Math.min(...numerics) : null;
    const celes = valors.map((v) => {
      // Només es destaca si hi ha diferència entre locals (si tots són iguals, cap)
      const totsIguals = numerics.every((x) => x === numerics[0]);
      const destacat = objectiu !== null && v === objectiu && numerics.length > 1 && !totsIguals;
      return `<td${destacat ? ' class="millor"' : ""}>${v === null || v === undefined ? "—" : format(v)}</td>`;
    }).join("");
    return `<tr><th scope="row">${etiqueta}</th>${celes}</tr>`;
  }

  const capcalera = resultats.map((x) => `
    <th scope="col"><button class="lletra-local" data-anar="${x.local.lletra}" title="${x.local.nom}">${x.local.lletra}</button>
      <button class="treu-local" data-treu="${x.local.lletra}" aria-label="Quitar local ${x.local.lletra}">✕</button></th>`).join("");

  const files = [
    fila("Puntuación", resultats.map((x) => x.p.total), (v) => `<strong>${v}</strong>`, "max"),
    fila("¿Llega al mínimo?", resultats.map((x) => (x.incomplet ? null : x.p.total >= mirroring.llindar ? "Sí" : "No")), (v) => v, null),
    ...mirroring.criteris.map((c) => fila(
      `${c.etiqueta} <small>(nota)</small>`,
      resultats.map((x) => {
        const d = x.p.detalls.find((dd) => dd.criteri.id === c.id);
        return d.nota === null ? null : Math.round(d.nota);
      }),
      (v) => v, "max",
    )),
    fila("Público objetivo", resultats.map((x) => x.valors.poblacio), numero, "max"),
    fila("Competidores", resultats.map((x) => x.valors.competencia), numero, "min"),
    fila("Solapamiento", resultats.map((x) => x.valors.solapament), (v) => `${decimal(v)} %`, "min"),
    fila("Renta por hogar", resultats.map((x) => x.valors.renda), (v) => `${numero(v)} €`, null),
  ].join("");

  const llegenda = resultats.map((x) => `<li><strong>${x.local.lletra}</strong> · ${x.local.nom}</li>`).join("");

  return `
    ${titol}
    <div class="taula-contenidor">
      <table class="taula-comparador">
        <thead><tr><th></th>${capcalera}</tr></thead>
        <tbody>${files}</tbody>
      </table>
    </div>
    <ul class="dades llegenda-locals">${llegenda}</ul>
    ${font(`Mismos parámetros para todos: ${textArea()}, público ${textEdat()}, pesos y segmentos
      actuales. En negrita, el mejor valor de cada fila.${resultats.some((x) => x.incomplet)
        ? " «—» en «¿Llega al mínimo?»: el área supera la zona con datos." : ""}`)}
  `;
}

// Connecta els botons del comparador (es tornen a crear a cada redibuixat)
function connectaComparador() {
  document.getElementById("guardar-local")?.addEventListener("click", guardaLocal);
  document.querySelectorAll("[data-treu]").forEach((boto) => {
    boto.addEventListener("click", () => treuLocal(boto.dataset.treu));
  });
  document.querySelectorAll("[data-anar]").forEach((boto) => {
    boto.addEventListener("click", () => {
      const l = comparador.locals.find((x) => x.lletra === boto.dataset.anar);
      situaPunt([l.lat, l.lon], true, l.nom);
    });
  });
}
