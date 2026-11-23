// =============================================================
// Enllaç per compartir: els paràmetres viatgen a l'adreça (després del "?")
// Exemple: ?mode=avaluar&punt=41.39200,2.16400&radi=1.5&edat=e20_24-e60_64
//          &pesos=35-25-25-15&seg=low cost,municipal&llindar=50
// El rendiment carregat amb el CSV de calibratge NO hi va: són dades privades.
// =============================================================

// Llegeix els paràmetres de l'adreça i els posa a l'estat, abans de dibuixar els controls.
// Cada valor es comprova: un enllaç mal copiat no ha de trencar la pàgina.
function llegeixEnllac(parametres) {
  const radi = Number(parametres.get("radi"));
  if (radi >= 0.5 && radi <= 3) avaluacio.radiKm = Math.round(radi * 10) / 10;

  if (parametres.get("area") === "isocrona") avaluacio.tipusArea = "isocrona";
  const [modeIso, minuts] = (parametres.get("iso") || "").split("-");
  if (MODES_ISOCRONA[modeIso]?.minuts.includes(Number(minuts))) {
    avaluacio.modeIso = modeIso;
    avaluacio.minuts = Number(minuts);
  }

  const [des, fins] = (parametres.get("edat") || "").split("-");
  const iDes = avaluacio.trams.indexOf(des);
  const iFins = avaluacio.trams.indexOf(fins);
  if (iDes >= 0 && iFins >= iDes) {
    avaluacio.edatDes = des;
    avaluacio.edatFins = fins;
  }

  // Pesos en l'ordre dels criteris (població, competència, solapament, renda)
  const pesos = (parametres.get("pesos") || "").split("-").map(Number);
  if (pesos.length === mirroring.criteris.length && pesos.every((p) => p >= 0 && p <= 100) && pesos.some((p) => p > 0)) {
    mirroring.criteris.forEach((c, i) => (c.pes = pesos[i]));
  }

  if (parametres.has("seg")) {
    const triats = parametres.get("seg").split(",");
    for (const id of Object.keys(mirroring.segments)) mirroring.segments[id] = triats.includes(id);
  }

  const llindar = Number(parametres.get("llindar"));
  if (parametres.has("llindar") && llindar >= 0 && llindar <= 100) mirroring.llindar = llindar;
}

// Un cop el mapa és a punt: obre la porta d'entrada i el local o la zona de l'enllaç
function obreEnllac(parametres) {
  const [lat, lon] = (parametres.get("punt") || "").split(",").map(Number);
  if (parametres.get("mode") === "avaluar") {
    canviaMode("avaluar");
    if (Number.isFinite(lat) && Number.isFinite(lon)) situaPunt([lat, lon], true, parametres.get("nom"));
    return;
  }
  const zona = parametres.get("zona");
  if (zona) {
    descobriment.capa.eachLayer((capa) => {
      if (capa.feature.properties.hex_id === zona) seleccionaHexagon(capa);
    });
  }
}

// Adreça amb l'estat actual
function creaEnllac() {
  const p = new URLSearchParams();
  const avaluar = document.body.classList.contains("mode-avaluar");
  if (avaluar) {
    p.set("mode", "avaluar");
    if (avaluacio.punt) {
      p.set("punt", `${avaluacio.punt.lat.toFixed(5)},${avaluacio.punt.lng.toFixed(5)}`);
      if (!avaluacio.nomPunt.startsWith("Punto ")) p.set("nom", avaluacio.nomPunt);
    }
  } else if (descobriment.seleccionat) {
    p.set("zona", descobriment.seleccionat.feature.properties.hex_id);
  }
  p.set("area", avaluacio.tipusArea);
  if (avaluacio.tipusArea === "radi") p.set("radi", avaluacio.radiKm);
  else p.set("iso", `${avaluacio.modeIso}-${avaluacio.minuts}`);
  p.set("edat", `${avaluacio.edatDes}-${avaluacio.edatFins}`);
  p.set("pesos", mirroring.criteris.map((c) => c.pes).join("-"));
  p.set("seg", Object.keys(mirroring.segments).filter((id) => mirroring.segments[id]).join(","));
  p.set("llindar", mirroring.llindar);
  return `${location.origin}${location.pathname}?${p}`;
}

// Botó "Copiar enlace" de la capçalera
document.querySelector(".boto-enllac").addEventListener("click", async () => {
  const enllac = creaEnllac();
  try {
    await navigator.clipboard.writeText(enllac);
    mostraAvis("Enlace copiado: abre esta misma vista con estos parámetros");
  } catch {
    // Alguns navegadors no deixen copiar: es mostra l'enllaç perquè el copiïn a mà
    window.prompt("Copia este enlace:", enllac);
  }
});
