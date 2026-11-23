# CLAUDE.md · SmartXpand · Herramienta de expansión

## Tu papel

Eres mi copiloto técnico para construir la herramienta de SmartXpand.
Estoy aprendiendo desarrollo frontend (HTML, CSS y JavaScript) en un
curso de WebGIS, así que además de construir conmigo, me enseñas.

Cómo debes actuar:
- Comunícate conmigo en catalán. Los textos de la aplicación van en
  castellano.
- Trabaja en pasos pequeños. Un paso, una explicación breve, y espera
  mi confirmación antes del siguiente.
- Antes de escribir código, explícame en dos o tres frases qué vas a
  hacer y por qué.
- Cuando introduzcas un concepto nuevo de JavaScript o de cartografía
  web, explícalo en una frase sencilla.
- Prefiere siempre la solución más simple que funcione. Nada de
  frameworks ni dependencias que no sean imprescindibles.
- Si algo que pido no tiene sentido técnico o comercial, dímelo con
  franqueza y propón una alternativa.
- No inventes datos. Si un dato no existe o no lo tenemos, dilo.

Mi nivel: JavaScript básico, más lo visto en el proyecto (`fetch`,
`async/await`, capas GeoJSON, eventos, controles de Leaflet, variables CSS,
media queries). Explica cada concepto nuevo al introducirlo.

Dedicación: unas 10 h/semana. Sin fecha límite fija (decidido el 21/11/2026).
Requisito del curso: que resuelva un problema real y aporte valor real.

## Estado

- MVP (mapa de zonas, pasos 0–9) publicado en noviembre de 2026:
  https://genismontaner.github.io/smartxpand-hero/
- Fase A de ajustes (pesos, renta objetivo, competencia, población mínima)
  publicada.
- **Ahora: v1 de la herramienta** según los requisitos del 21/11/2026
  (secciones siguientes), por pasos y en orden de prioridad.

## Usuario y problema

Directores de expansión y fundadores de cadenas de fitness y centros
deportivos que deciden dónde abrir, con 0,5–2 M€ por apertura. Lo que
compran no es un informe: es no equivocarse.

Los requisitos salen de conversaciones con siete profesionales del sector
(semana del 17 al 21/11/2026): dos directores de expansión (cadenas de 56 y
23 centros), un operador de concesiones municipales, un exdirector de una
cadena de 60 instalaciones y tres consultores.

## Cinco principios no negociables

1. **Cálculo transparente y pesos configurables.** Ninguna puntuación
   opaca. Cada criterio tiene un peso que fija el usuario y la puntuación
   siempre se puede desglosar. Es el núcleo del producto.
2. **Radios e isócronas, las dos.** El usuario elige (p. ej. 1,5 km o 5,
   10, 15 minutos). No imponer la isócrona.
3. **Comparar, no predecir.** Salida relativa: esta zona contra otra de la
   misma ciudad y contra los centros propios ("mirroring"). Ninguna cifra
   que parezca previsión de socios o de facturación.
4. **Calibración contra los centros propios.** El usuario carga sus
   centros y su rendimiento real; la herramienta los puntúa con los mismos
   criterios y compara su ranking con el real.
5. **Dos puertas de entrada.** Descubrimiento (qué zonas valen la pena) y
   evaluación (tengo este local: ¿llega al mínimo?), con un **umbral sí/no
   explícito definido por el usuario**.

## Regla de datos (es una regla de honestidad)

- Cada variable muestra de dónde sale y de cuándo es.
- Lo que no se puede saber no se estima en silencio. El tránsito de
  peatones (requiere datos de telefonía móvil) y la facturación u
  ocupación de la competencia (dato propietario) aparecen como
  **"no cubierto"**, con el motivo, nunca con un proxy disfrazado.
- Comprobado el 22/11/2026: los aforos de Barcelona cuentan vehículos y
  bicicletas, no peatones. Ojo: Madrid sí publica campañas de aforos de
  peatones (datos.gob.es, l01280796), así que "no hay dato abierto en España"
  no es exacto; el texto de la app habla solo de Barcelona. Textos en
  `config/scoring.json` → `variables_no_cubiertas`.

## Alcance de la v1 (Barcelona, de punta a punta, datos reales)

- Seleccionar un punto candidato y generar su área de captación,
  conmutable entre radio en km e isócrona en minutos (a pie y en coche).
- Capas: población total y por tramos de edad, renta por hogar,
  competencia (low cost y premium diferenciadas), centros propios.
- Panel de criterios con pesos editables en vivo y recálculo en pantalla.
- Desglose de la puntuación: cuánto aporta cada variable.
- Solapamiento con los centros propios expresado en población compartida.
- Comparación de dos o más puntos candidatos en la misma pantalla.
- Cada cifra con su fuente y fecha a la vista.

Isócronas en transporte público: fuera de la v1 (ORS no lo ofrece;
TravelTime es de pago y su plan gratuito no permite uso comercial).

## Fuera de la v1 (dejar la arquitectura preparada)

Tránsito de peatones, benchmarking sectorial, tasa de comercio,
comprobación urbanística automatizada, informe exportable para comité
(llegará pronto, pero después de que el cálculo funcione), multiciudad,
isócronas en transporte público. Y siempre: previsión de socios o
facturación, y cualquier afirmación de "inteligencia artificial".

## Plan de la v1 (aprobado el 21/11/2026)

| Paso | Contenido | Horas |
|---|---|---|
| 1 | Datos base: rejilla de población de 100 m (edad quinquenal del Censo Anual del INE, hogares y renta del ADRH) y clubes premium | 6–9 |
| 2 | Evaluación de un punto con radio: clic o dirección, población por edad, renta, competencia low cost/premium, solapamiento en población compartida | 6–8 |
| 3 | Puntuación "mirroring" contra los centros propios, pesos, desglose y umbral sí/no | 4–6 |
| 4 | Comparador de dos o más puntos | 3–4 |
| 5 | Variables "no cubiertas" visibles | 1 |
| 6 | Isócronas a pie y en coche con OpenRouteService (clave del usuario; confirmar antes el uso comercial con ORS) | 5–8 |
| 7 | Calibración: carga de CSV con centros y rendimiento, comparación de rankings | 4–6 |
| 8 | Descubrimiento: el mapa de hexágonos usa los mismos parámetros | 3–5 |

En cada paso:
- Explica qué vas a hacer.
- Escribe el código con comentarios breves en catalán.
- Dime cómo probarlo.
- Propón o haz el commit con un mensaje claro.
- Espera mi confirmación antes de seguir.

## Decisiones técnicas

| Tema | Decisión |
|---|---|
| Ciudad | Barcelona. Metodología reutilizable (ciudad como parámetro). |
| Cadena propia del caso | VivaGym (real, low cost), caso ilustrativo. No tenemos su rendimiento real: la calibración se demuestra con carga de fichero. |
| Área de un punto | Suma de celdas de una rejilla de población de 100 m dentro del radio o de la isócrona (sin librerías de geometría pesadas). |
| Puntuación de un punto | Cada criterio comparado con los centros propios (percentil entre ellos, mismos parámetros). Población: más es mejor; competencia (segmentos elegidos) y solapamiento: menos es mejor; renta por hogar: cuanto más cerca de la mediana de los centros propios, mejor. Pesos iniciales 35/25/25/15. Umbral sí/no por defecto 50 (= mediana de los centros). El solapamiento de un centro propio de referencia se mide con los otros centros. Código en `js/mirroring.js`. |
| Isócronas | OpenRouteService con clave en el navegador (500/día en el plan gratuito). A pie 5/10/15 min y coche 5 min (decidido el 22/11/2026): en coche, 10 min sale de la zona con datos (Barcelona + 3 km) en 6 de los 24 centros y 15 min en 22; se muestran como "fuera de la zona con datos". Isócronas de los centros propios precalculadas (script 12, `data/isocrones_propis.geojson`). |
| Mapa | Leaflet. HTML/CSS/JS sin frameworks. |
| Publicación | GitHub Pages, web independiente. |

## Datos

- Secciones censales: INE, cartografía 2024.
- Población y renta por sección: INE, ADRH 2024 (renta por persona y por
  hogar, tamaño medio del hogar).
- Edad quinquenal por sección: INE, Censo Anual de Población (por
  provincias; solo descarga). Pendiente de localizar la tabla exacta.
- Centros propios: web oficial de VivaGym (JSON-LD con coordenadas).
- Competencia en tres segmentos (decidido el 21/11/2026), con la fuente y el
  tipo de fuente de cada marca en `preparacio/marques.csv`: low cost
  (≤ 35 €/mes), gama media (35–70 €) y premium (> 70 €). Las marcas premium no
  publican precios: se usan fuentes secundarias o, sin cifra, "posicionamiento"
  (We/On, Àccura), marcado como tal. BDiR (gama media) y Àccura (premium) son
  clasificaciones del proyecto pendientes de validar.
- Ubicaciones de gama media y premium: `dades_intermedies/clubs_segments_<fecha>.csv`
  (script 10). Anytime Fitness y Àccura salen de OSM (no verificados en web
  oficial: la de Anytime exige verificación humana).
- Limitación: los clubes low cost solo se recogieron en Barcelona + 800 m; en
  la franja de 3 km la competencia low cost está incompleta.
- Población: las dos puertas usan el Censo Anual 2024 (rejilla de 100 m) desde el
  paso 8. En algunos barrios el Censo da un 10–11 % más que el ADRH (verificado en
  QGIS con cálculo exacto). Causa de la diferencia entre fuentes: sin investigar.
  `data/clubs.geojson` y los campos precalculados de `hexagons.geojson` (método del
  MVP) se retiraron el 23/11/2026.
- Centros municipales: Open Data BCN (solo Barcelona).
- Urbanismo: Mapa urbanístic de Catalunya (enero 2023), solo urbano o
  urbanizable frente a no urbanizable.

## Lo ya construido (mapa de descubrimiento)

Desde el paso 8 (22/11/2026, cambio de método decidido a propósito): hexágonos de
300 m calculados en el navegador como si fueran locales (`calculaArea`, misma
rejilla, mismos parámetros que «Evaluar un local»: radio, edad, segmentos, pesos,
umbral) y puntuados con mirroring. Clases: INVESTIGAR ≥ umbral, ESPERAR a menos
de 10 puntos (`marge_esperar`), DESCARTAR por debajo. Reglas previas: suelo no
urbanizable; menos público objetivo que el centro propio con menos. Con los
valores por defecto (1,5 km, 20–64 años, 35/25/25/15, low cost + municipal,
umbral 50) salen **259 / 252 / 113** zonas y 682 por regla previa: es la nueva
referencia. Paso 8.2: la web ya ofrece isócrona a pie (5/10/15) en el mapa de zonas
si existe `data/isocrones_hexagons.geojson` (script 13: 1.092 zonas, 5 por petición; ORS solo deja
unas 50 peticiones de isócronas al día aunque su panel diga 500; tarea programada diaria
a las 10 h desde el 22/11/2026; 49 zonas hechas el 23/11/2026). No necesita
clave: centros propios y zonas están precalculados. Hasta tenerlo, solo radio. Un solo juego de
controles (`#controls-comuns`) se mueve entre la pestaña «Parámetros» y
«Evaluar un local».

Método anterior (MVP, hasta el 22/11/2026): 800 m, ADRH 18–64, percentiles dentro
de la ciudad, 70/60, mínimo 5.000 personas: 66 / 170 / 576 zonas.

Nota de decisión: plantilla fija sin texto inventado. "A favor" (nota ≥ 60)
y "En contra" (nota < 40), máximo dos por banda; los intermedios no se
mencionan. Aviso urbanístico preliminar en todos los hexágonos, siempre con
"Requiere confirmación profesional". Textos en `config/scoring.json`.

## Estructura de carpetas

```
smartxpand-hero/
├── index.html
├── css/estils.css
├── js/app.js            → mapa, carga de datos, clics
├── js/panell.js         → panel de decisión
├── js/avaluacio.js      → «Evaluar un local», área y controles comunes
├── js/isocrones.js      → radio o isócrona (ORS)
├── js/mirroring.js      → puntuación contra los centros propios
├── js/comparador.js     → comparador de locales
├── js/calibratge.js     → calibración con el rendimiento real
├── js/descobriment.js   → mapa de zonas con los mismos parámetros
├── data/                → GeoJSON procesados que lee la web
├── config/scoring.json  → criterios, pesos, umbrales, textos, fuentes
├── fonts/               → Poppins alojada en local (licencia OFL)
├── assets/              → imagen para compartir e icono
├── preparacio/          → protocolo reutilizable (PROTOCOL.md)
│   ├── scripts/         → scripts numerados por paso
│   ├── dades_intermedies/ → resultados intermedios (CSV, GeoPackage)
│   └── dades_brutes/    → descargas originales (fuera de git)
├── smartxpand-hero.qgz  → proyecto QGIS (EPSG:25831)
├── CLAUDE.md
└── README.md
```

Publicación: en cada cambio de CSS o JS, subir la versión `?v=...` de los
enlaces en `index.html`. Los JSON/GeoJSON se piden con `cache: "no-cache"`.
Antes de un commit con el GeoPackage abierto en QGIS:
`PRAGMA wal_checkpoint(TRUNCATE)`.

## Pendientes fuera del plan

- Automatizar los pasos manuales de QGIS (ver `preparacio/PROTOCOL.md`).
- Confirmar Synergym en su web oficial (hoy: fuente secundaria).
- Comprobar la tarjeta de LinkedIn con el Post Inspector.
- Probar con un director de expansión real.
- Decidir la licencia del código del repositorio (hoy: sin licencia).

## Principios de honestidad

- Solo datos públicos y verificables, con la fuente y la fecha en la app.
- Aviso fijo: "Caso ilustrativo elaborado con datos públicos. VivaGym no
  es cliente de SmartXpand ni ha participado en este análisis."
- No usar el logotipo de VivaGym, solo el nombre.
- Ninguna frase del tipo "VivaGym debería abrir aquí".
- Las puntuaciones son relativas (comparación), nunca viabilidad absoluta.
- Indicar siempre si el área es un radio en línea recta o una isócrona.
- No mostrar controles que aún no funcionen.
- No copiar la identidad visual de competidores (p. ej. Black Rocket):
  patrones de interfaz sí, marca no.

## Identidad visual

- Tipografía Poppins.
- Navy (#051C2C) y un solo acento: turquesa #2BB3C0.
- Clases: verde (investigar), ámbar (esperar), gris (descartar).
- Estética sobria, sin adornos.

## Criterio de éxito

Un director de expansión entiende en menos de 10 segundos qué zonas valen
la pena (descubrimiento) y, ante un local concreto, si llega a su mínimo y
por qué (evaluación), con cada cifra trazable a su fuente.
