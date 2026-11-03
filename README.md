# SmartXpand · Mapa de oportunidad

**Aplicación:** https://genismontaner.github.io/smartxpand-hero/

Mapa interactivo que criba las zonas de una ciudad para abrir un gimnasio
**low cost**. La ciudad se divide en hexágonos de 300 m; cada uno recibe una
puntuación sobre 100 y una clase: **INVESTIGAR**, **ESPERAR** o **DESCARTAR**.
Al hacer clic en un hexágono se explica el porqué: desglose por criterio, pesos,
datos del entorno y aviso urbanístico.

> **Caso ilustrativo** elaborado con datos públicos. VivaGym no es cliente de
> SmartXpand ni ha participado en este análisis.

Es la demostración visual (*hero app*) del servicio de SmartXpand para
directores de expansión de cadenas de fitness en España.

## Qué mide

Para cada hexágono se analiza un círculo de **800 m en línea recta** desde su centro.

| Criterio | Qué mide | Peso |
|---|---|---|
| Población objetivo | Personas de 18 a 64 años | 35 % |
| Competencia | Clubes low cost y centros deportivos municipales | 25 % |
| Solapamiento | % del área compartida con clubes propios (VivaGym) | 25 % |
| Renta | Renta neta media por persona (máximo en la franja media de la ciudad) | 15 % |

Cada criterio se convierte en una nota de 0 a 100 por **percentil** entre las
zonas candidatas de la ciudad. La puntuación es la suma ponderada.

| Clase | Puntuación |
|---|---|
| INVESTIGAR | ≥ 70 |
| ESPERAR | 60–69 |
| DESCARTAR | < 60 |

**Reglas previas** (pasan directamente a DESCARTAR): más de la mitad del
hexágono es suelo no urbanizable, o menos de 5.000 personas de 18 a 64 años a 800 m.

Todos los pesos, umbrales, textos y fuentes están en
[`config/scoring.json`](config/scoring.json): nada está escondido en el código.

## Limitaciones

- La puntuación es **relativa**: compara las zonas de la ciudad entre sí. No mide
  la viabilidad absoluta de un club ni prevé socios.
- El radio de 800 m es una distancia en línea recta, no un tiempo real a pie.
- La población se reparte de forma uniforme dentro de cada sección censal.
- Los centros deportivos municipales solo incluyen los de Barcelona; en los bordes
  del municipio la competencia puede estar subestimada.
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
| Mapa base | Instituto Geográfico Nacional (CC BY 4.0) | servicio en línea |

El criterio para considerar una marca "low cost" (cuota básica ≤ 35 €/mes) y la
fuente de cada precio están en [`preparacio/marques_lowcost.csv`](preparacio/marques_lowcost.csv).

## Estructura

```
index.html              Página
css/estils.css          Estilos (Poppins, navy #051C2C, turquesa #2BB3C0)
js/app.js               Mapa Leaflet, capas, selección, móvil y modo captura
js/puntuacio.js         Puntuación sobre 100 y clase
js/panell.js            Panel de decisión
config/scoring.json     Criterios, pesos, umbrales, textos y fuentes
data/                   GeoJSON que lee la web
fonts/                  Poppins (licencia OFL)
preparacio/             Protocolo de preparación de datos (QGIS + Python)
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
