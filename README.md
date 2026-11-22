# SmartXpand · Mapa de oportunidad

**Aplicación:** https://genismontaner.github.io/smartxpand-hero/

Mapa interactivo que criba las zonas de una ciudad para abrir un gimnasio
**low cost**. La ciudad se divide en hexágonos de 300 m; cada uno recibe una
puntuación sobre 100 (comparada con los centros propios) y una clase:
**INVESTIGAR**, **ESPERAR** o **DESCARTAR**.
Al hacer clic en un hexágono se explica el porqué: desglose por criterio, pesos,
datos del entorno y aviso urbanístico.

> **Caso ilustrativo** elaborado con datos públicos. VivaGym no es cliente de
> SmartXpand ni ha participado en este análisis.

Es la demostración visual (*hero app*) del servicio de SmartXpand para
directores de expansión de cadenas de fitness en España.

## Dos puertas de entrada

- **Descubrir zonas:** el mapa de hexágonos clasificados (ver abajo).
- **Evaluar un local:** busca una dirección (geocodificador del ICGC) o haz clic
  en el mapa. Para un radio de 0,5 a 3 km en línea recta o una isócrona (a pie
  5, 10 o 15 min; en coche 5 min) se calcula la población
  total y por tramos de edad de 5 años, los hogares, la renta por persona y por
  hogar, la competencia por segmentos (low cost, centros municipales, gama media,
  premium) y el público objetivo compartido con los centros propios. Cada cifra
  muestra su fuente. Datos: rejilla de población de 100 m derivada de las
  secciones censales (`data/poblacio_100m.json`, Barcelona + 3 km).
  Cada local se puntúa comparándolo con los centros propios con los mismos
  parámetros ("mirroring": 50 = como la mediana de tus centros), con pesos
  editables, desglose y un umbral sí/no fijado por el usuario. Se pueden guardar
  hasta 5 locales y compararlos en una tabla, siempre con los mismos parámetros.
- **Calibración:** el usuario carga un CSV con el rendimiento real de sus centros
  (`nombre; lat; lon; rendimiento`; hay una plantilla descargable con el
  rendimiento vacío). La herramienta puntúa cada centro con los parámetros
  actuales y compara su orden con el real (correlación de rangos de Spearman,
  total y por criterio). El fichero se lee en el navegador y no se envía. No se
  publica ningún fichero de ejemplo con rendimiento: no tenemos datos reales.
- **Isócronas:** se calculan con OpenRouteService (las de los centros propios,
  una vez, con `preparacio/scripts/12_isocrones_propis.py`; la del local, al
  seleccionarlo). Para evaluar un local hace falta una clave en
  `config/ors_clau.txt`, que no se publica: sin clave, «Evaluar un local» solo
  ofrece el radio. En coche, 10 y 15 min no se ofrecen porque salen de la zona
  con datos (Barcelona + 3 km). El mapa de zonas ofrece la isócrona a pie (5, 10
  y 15 min) cuando existe `data/isocrones_hexagons.geojson`, precalculado con
  `preparacio/scripts/13_isocrones_hexagons.py`; no necesita clave.

## Qué mide

Cada hexágono se calcula **como si fuera un local**, con la misma función, la
misma rejilla de población y los mismos parámetros que «Evaluar un local»: área
(radio en línea recta desde su centro; por defecto 1,5 km), público objetivo
(tramos de edad; por defecto 20 a 64 años), segmentos que cuentan como
competencia, pesos y umbral.

| Criterio | Qué mide | Mejor si… | Peso inicial |
|---|---|---|---|
| Público objetivo | Personas de la edad elegida en el área | más | 35 % |
| Competencia | Clubes abiertos de los segmentos elegidos | menos | 25 % |
| Solapamiento | % del público compartido con el área de algún centro propio | menos | 25 % |
| Renta por hogar | Renta neta media por hogar | más cerca de la mediana de tus centros | 15 % |

Cada criterio se convierte en una nota de 0 a 100 por **percentil entre los
centros propios** calculados con los mismos parámetros ("mirroring": 50 = como la
mediana de tus centros). La puntuación es la suma ponderada.

| Clase | Puntuación |
|---|---|
| INVESTIGAR | ≥ umbral (por defecto 50: llega al mínimo) |
| ESPERAR | a menos de 10 puntos del umbral |
| DESCARTAR | por debajo |

**Reglas previas** (pasan directamente a DESCARTAR): más de la mitad del
hexágono es suelo no urbanizable, o menos público objetivo que el centro propio
que tiene menos.

Con los valores por defecto salen 259 / 252 / 113 zonas y 682 descartadas por
regla previa (22/11/2026).

La pestaña **Parámetros** tiene los mismos controles que «Evaluar un local»
(son los mismos: cambiarlos en una puerta los cambia en la otra). El mapa se
recalcula en el navegador.

Los textos, las clases y las fuentes están en
[`config/scoring.json`](config/scoring.json); los criterios y los pesos
iniciales, en [`js/mirroring.js`](js/mirroring.js).

## Limitaciones

- La puntuación es **relativa**: compara cada zona con tus centros. No mide la
  viabilidad absoluta de un club ni prevé socios.
- En el mapa de zonas el área es un radio en línea recta; las isócronas solo están
  en «Evaluar un local» (las de las zonas están pendientes de calcular).
- La población se reparte de forma uniforme dentro de cada sección censal.
- La competencia low cost y los centros municipales solo se recogieron en Barcelona
  y una franja de 800 m; en los bordes del municipio puede estar subestimada.
- El aviso urbanístico solo distingue suelo urbano/urbanizable de no urbanizable.
  **No verifica si el uso deportivo está admitido**: requiere confirmación profesional.
- El mapa señala zonas donde buscar locales; no evalúa locales concretos.

## Fuentes

| Dato | Fuente | Año / consulta |
|---|---|---|
| Población y renta por sección censal | INE, Atlas de Distribución de Renta de los Hogares | 2024 |
| Secciones censales | INE, cartografía de secciones censales | 2024 |
| Clubes VivaGym | Web oficial de VivaGym | 25/10/2026 |
| Clubes Basic-Fit y Fitness Park | Webs oficiales de las marcas | 25/10/2026 |
| Clubes Synergym | Time Out Barcelona (fuente secundaria) | 25/10/2026 |
| Centros deportivos municipales | Open Data BCN (Ajuntament de Barcelona, CC BY 4.0) | 25/10/2026 |
| Barrios y distritos | Open Data BCN (Ajuntament de Barcelona, CC BY 4.0) | 26/10/2026 |
| Clasificación del suelo | Mapa urbanístic de Catalunya (Generalitat), servido por la Diputació de Barcelona | enero 2023 |
| Geocodificación | Geocodificador del ICGC | 25/10/2026 |
| Isócronas | openrouteservice.org (HeiGIT), red viaria de OpenStreetMap | 22/11/2026 (centros propios) |
| Mapa base | Instituto Geográfico Nacional (CC BY 4.0) | servicio en línea |

El criterio para considerar una marca "low cost" (cuota básica ≤ 35 €/mes) y la
fuente de cada precio están en [`preparacio/marques.csv`](preparacio/marques.csv).

## Estructura

```
index.html              Página
css/estils.css          Estilos (Poppins, navy #051C2C, turquesa #2BB3C0)
js/app.js               Mapa Leaflet, capas, selección, móvil y modo captura
js/panell.js            Panel de decisión
js/descobriment.js      Mapa de zonas: cálculo, clases, selección y leyenda
js/avaluacio.js         Modo «Evaluar un local»
js/isocrones.js         Áreas de captación: radio o isócrona (OpenRouteService)
js/mirroring.js         Puntuación contra los centros propios
js/comparador.js        Comparador de locales
js/calibratge.js        Calibración con el rendimiento real de los centros propios
config/scoring.json     Criterios, pesos, umbrales, textos y fuentes
data/                   GeoJSON que lee la web
fonts/                  Poppins (licencia OFL)
preparacio/             Protocolo de preparación de datos (QGIS + Python)
```

## Enlace directo a una zona

- `?zona=H0913` abre la aplicación con esa zona seleccionada (útil para enviar
  una zona concreta en una llamada).
- `&captura=1` la abre directamente en modo captura (controles ocultos, leyenda
  y fuentes visibles).

La imagen de previsualización para compartir (`assets/og-image.png`, 1200 × 630)
se genera así, con el servidor local en marcha:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --window-size=1200,630 --virtual-time-budget=15000 --screenshot="$PWD/assets/og-image.png" "http://localhost:8000/?zona=H0913&captura=1"
```

## Ejecutar en local

Los navegadores bloquean la lectura de ficheros locales con `fetch`, así que hace
falta un servidor local:

```bash
python3 -m http.server 8000
```

y abrir http://localhost:8000.

## Reproducir el análisis en otra ciudad

Ver [`preparacio/PROTOCOL.md`](preparacio/PROTOCOL.md).

## Tecnología y licencias de terceros

- [Leaflet](https://leafletjs.com) 1.9.4 (BSD-2-Clause), cargado desde cdnjs.
- Tipografía [Poppins](https://github.com/itfoundry/Poppins) (SIL Open Font
  License 1.1), alojada en `fonts/` con su licencia.
- Sin frameworks ni backend. Publicado con GitHub Pages.

Los datos de terceros mantienen sus licencias de origen (ver tabla de fuentes).
