// =============================================================
// SmartXpand · Mapa de oportunidad
// Mapa a pantalla completa amb capçalera i panell flotants
// =============================================================

// 1. Crea el mapa dins del <div id="mapa">, centrat a Barcelona
// zoomSnap 0.25: permet zooms intermedis perquè la ciutat ompli millor la pantalla
const mapa = L.map("mapa", { zoomSnap: 0.25, zoomControl: false }).setView([41.39, 2.16], 12);

// Botons de zoom a baix a l'esquerra (la llegenda s'hi col·locarà a sobre)
L.control.zoom({ position: "bottomleft" }).addTo(mapa);

// 2. Mapa base gris de l'IGN (Instituto Geográfico Nacional, llicència CC BY 4.0)
//    Servei WMTS: el mapa es demana en "rajoles" (imatges petites) per zoom, columna i fila
L.tileLayer(
  "https://www.ign.es/wmts/ign-base?service=WMTS&request=GetTile&version=1.0.0" +
    "&layer=IGNBase-gris&style=default&tilematrixset=GoogleMapsCompatible&format=image/jpeg" +
    "&TileMatrix={z}&TileRow={y}&TileCol={x}",
  {
    attribution: 'Mapa base: <a href="https://www.ign.es">© Instituto Geográfico Nacional</a>',
    maxZoom: 19,
  }
).addTo(mapa);

// Panell (capa de dibuix) per sobre dels hexàgons: clubs i àrees dibuixades
mapa.createPane("superior");
// Panell de les cel·les del solapament («Evaluar un local»): la transparència s'aplica a tot el
// panell (CSS), no a cada cel·la, perquè les cel·les veïnes no deixin línies blanques entre elles
mapa.createPane("celles").style.zIndex = 395;
mapa.getPane("superior").style.zIndex = 450;

const NAVY = "#051C2C";

// Llegeix un fitxer GeoJSON (o JSON) i el retorna com a objecte de JavaScript.
// cache "no-cache": el navegador comprova amb el servidor si el fitxer ha canviat
// abans de fer servir la còpia guardada (evita dades velles després de publicar).
async function carregaGeoJSON(ruta) {
  const resposta = await fetch(ruta, { cache: "no-cache" });
  // fetch no falla amb un 404 o un 500: ho comprovem nosaltres perquè es vegi l'error
  if (!resposta.ok) throw new Error(`${ruta} (${resposta.status})`);
  return resposta.json();
}

// --- Mòbil: fitxa inferior ---
const lateral = document.querySelector(".lateral");
const ALCADA_FITXA = 230; // ha de coincidir amb --alcada-fitxa del CSS

// Cert si la pantalla és de mòbil (mateixa condició que el CSS)
function esMobil() {
  return window.matchMedia("(max-width: 767px)").matches;
}

// Marges (en píxels) que tapen les targetes flotants: el mapa s'ajusta dins de la zona visible.
// Escriptori: capçalera a dalt i panell a la dreta. Mòbil: capçalera a dalt i fitxa a baix.
function margesMapa() {
  if (esMobil()) {
    return { paddingTopLeft: [10, 68], paddingBottomRight: [10, ALCADA_FITXA + 10] };
  }
  // Amplada real del panell (canvia segons la pantalla) + marges
  return { paddingTopLeft: [16, 92], paddingBottomRight: [lateral.offsetWidth + 32 + 16, 16] };
}

// La nansa plega i desplega la fitxa
document.querySelector(".nansa").addEventListener("click", () => {
  lateral.classList.toggle("desplegada");
});

// --- Mode captura ---
// Posa la classe "mode-captura" a tota la pàgina: el CSS amaga els controls
const avisToast = document.querySelector(".avis-toast");

function activaCaptura(ambMissatge = true) {
  document.body.classList.add("mode-captura");
  mostraVista("panell"); // a la captura es veu la zona, no els controls
  if (!ambMissatge) return;
  // Missatge breu que desapareix sol (perquè no surti a la captura)
  avisToast.classList.add("visible");
  setTimeout(() => avisToast.classList.remove("visible"), 2500);
}

function surtCaptura() {
  document.body.classList.remove("mode-captura");
}

document.querySelector(".boto-captura").addEventListener("click", (esdeveniment) => {
  // Evita que el mateix clic arribi a la capçalera i en surti de seguida
  esdeveniment.stopPropagation();
  activaCaptura();
});
// Sortir: tecla Esc (ordinador) o tocar la capçalera (mòbil)
document.addEventListener("keydown", (esdeveniment) => {
  if (esdeveniment.key === "Escape") surtCaptura();
});
document.querySelector(".capcalera").addEventListener("click", () => {
  if (document.body.classList.contains("mode-captura")) surtCaptura();
});

// --- Pestanyes del panell ---
function mostraVista(id) {
  colocaControls(id); // js/avaluacio.js: els controls comuns van a la vista que es mostra
  document.querySelectorAll(".vista").forEach((vista) => {
    vista.hidden = vista.id !== id;
  });
  document.querySelectorAll(".pestanya").forEach((boto) => {
    boto.classList.toggle("activa", boto.dataset.vista === id);
  });
}

document.querySelectorAll(".pestanya").forEach((boto) => {
  boto.addEventListener("click", () => {
    mostraVista(boto.dataset.vista);
    // Al mòbil, els controls necessiten la fitxa oberta
    if (esMobil() && boto.dataset.vista === "ajustes") lateral.classList.add("desplegada");
  });
});

// --- Les dues portes d'entrada: "Descubrir zonas" i "Evaluar un local" ---
async function canviaMode(mode) {
  const avaluar = mode === "avaluar";
  document.body.classList.toggle("mode-avaluar", avaluar);
  // Capçalera i títol de la pestanya del navegador: diuen en quina porta d'entrada som
  const nom = avaluar ? "Evaluar un local" : "Mapa de oportunidad";
  document.querySelector(".nom-vista").textContent = nom;
  document.title = `SmartXpand · ${nom}`;
  document.querySelectorAll(".mode").forEach((boto) => {
    boto.classList.toggle("activa", boto.dataset.mode === mode);
  });
  if (avaluar) {
    descobriment.capa.remove();
    descobriment.capaSeleccio?.remove();
    mostraVista("avaluacio");
    activaAvaluacio(); // js/avaluacio.js
  } else {
    desactivaAvaluacio();
    // Mapa de zones: radi o isòcrona a peu precalculada (js/isocrones.js)
    ajustaAreaAlMode();
    actualitzaControlsArea();
    actualitzaAtribucio();
    descobriment.capa.addTo(mapa);
    mostraVista("panell");
    recalculaDescobriment();
  }
}

document.querySelectorAll(".mode").forEach((boto) => {
  boto.addEventListener("click", () => canviaMode(boto.dataset.mode));
});

// Qualsevol canvi de paràmetres recalcula el mode actiu.
// Al mapa de zones, el càlcul de 1.306 hexàgons triga fins a 1 s: si l'usuari arrossega un
// control, s'espera que s'aturi 200 ms abans de calcular ("debounce": s'agrupen els canvis)
let esperaRecalcul = null;
function recalculaTot() {
  if (document.body.classList.contains("mode-avaluar")) {
    actualitzaMapaAvaluacio();
    mostraResultatsAvaluacio();
    return;
  }
  mostraCalibratge();
  clearTimeout(esperaRecalcul);
  esperaRecalcul = setTimeout(recalculaDescobriment, 200);
}

// 3. Carrega les dades i les afegeix al mapa
async function inicia() {
  panell.innerHTML = `<h2>Mapa de oportunidad</h2><p class="subtitol">Cargando datos de población…</p>`;
  const [hexagons, config] = await Promise.all([
    carregaGeoJSON("data/hexagons.geojson"),
    carregaGeoJSON("config/scoring.json"),
    preparaDades(), // js/avaluacio.js: graella, clubs, límit i isòcrones
  ]);
  descobriment.config = config;
  descobriment.hexagons = hexagons;
  for (const hex of hexagons.features) hex.centre = centreHexagon(hex);

  // Vistes i controls comuns (una sola còpia, a la pestanya "Parámetros" d'entrada)
  dibuixaVistaAvaluacio();
  dibuixaVistaParametres();
  dibuixaControlsComuns();
  colocaControls("ajustes");

  // Puntuació de cada hexàgon amb els paràmetres inicials (js/descobriment.js)
  puntuaHexagons();
  descobriment.capa = L.geoJSON(hexagons, {
    // 'style' també pot ser una funció: Leaflet la crida per a cada hexàgon
    style: estilHexagon,
    // 'onEachFeature' s'executa per a cada hexàgon: hi afegim l'esdeveniment de clic
    onEachFeature: (hex, capa) => {
      capa.on("click", () => seleccionaHexagon(capa));
      // Rètol en passar el ratolí (només amb ratolí: al mòbil, tocar ja obre la zona).
      // El contingut és una funció: es calcula en el moment, amb la puntuació actual
      if (!L.Browser.mobile) capa.bindTooltip(() => textRetolHexagon(hex), { sticky: true, direction: "top", offset: [0, -8] });
    },
  }).addTo(mapa);

  // Límit municipal: només la línia, sense farciment
  const capaLimit = L.geoJSON(avaluacio.limit, { style: { color: NAVY, weight: 2, fill: false } }).addTo(mapa);
  // Clubs per segment, als dos modes (interactive: false → els clics arriben a l'hexàgon)
  avaluacio.capaClubs.addTo(mapa);

  afegeixLlegenda();
  actualitzaLlegenda();
  actualitzaResumClasses();
  mostraPanellInicial(config);
  document.querySelector(".fonts-captura").textContent = config.fonts_resum;
  document.querySelector(".parametres-captura").textContent = resumParametres();

  // Ajusta la vista perquè es vegi tota la ciutat dins de la zona no tapada.
  // Si la pàgina s'ha obert en una pestanya en segon pla, el mapa encara fa 0 px:
  // llavors esperem el primer canvi de mida (quan la pestanya es fa visible).
  const ajustaVista = () => mapa.fitBounds(capaLimit.getBounds(), margesMapa());
  if (mapa.getSize().x > 0) ajustaVista();
  else mapa.once("resize", ajustaVista);

  // Paràmetres de l'adreça (el que va després del "?"):
  //   ?zona=H0913  → obre amb aquesta zona seleccionada (enllaç directe a una zona)
  //   &captura=1   → obre directament en mode captura
  const parametres = new URLSearchParams(window.location.search);
  const zona = parametres.get("zona");
  if (zona) {
    descobriment.capa.eachLayer((capa) => {
      if (capa.feature.properties.hex_id === zona) seleccionaHexagon(capa);
    });
  }
  if (parametres.get("captura") === "1") activaCaptura(false);
}

// Pestanya "Parámetros" del mapa de zones: recompte i controls comuns
function dibuixaVistaParametres() {
  document.getElementById("ajustes").innerHTML = `
    <h2>Parámetros</h2>
    <p class="subtitol">El mapa se recalcula al momento. Valen también para «Evaluar un local».</p>
    <div id="resum-classes" class="resum-classes"></div>
    ${isocronesZones() ? "" : `<p class="nota-relativa">En el mapa de zonas el área es un radio en
      línea recta: las isócronas a pie de las zonas aún no están calculadas.</p>`}
    <div class="ranura-controls"></div>
  `;
}

// Si alguna dada no es pot carregar, ho diem i oferim tornar-ho a provar (en lloc de
// deixar "Cargando…" per sempre). Passi el que passi, l'avís del mapa desapareix.
function mostraErrorCarrega(error) {
  console.error(error);
  panell.innerHTML = `<h2>Mapa de oportunidad</h2>
    <p class="avis-error">No se han podido cargar los datos. Comprueba la conexión y vuelve a intentarlo.</p>
    <button class="boto-guardar" onclick="location.reload()">Reintentar</button>`;
}

inicia()
  .catch(mostraErrorCarrega)
  .finally(() => document.querySelector(".avis-carrega")?.remove());
