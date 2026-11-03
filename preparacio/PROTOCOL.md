# Protocolo de preparación de datos

Cómo se generan los ficheros de `data/` que lee la web, y qué hay que cambiar
para repetir el análisis en otra ciudad. El caso de referencia es Barcelona.

- **Sistema de coordenadas de trabajo:** EPSG:25831 (ETRS89 / UTM 31N). Para
  ciudades de la península fuera de Cataluña lo habitual es EPSG:25830.
- **Proyecto QGIS:** `smartxpand-hero.qgz` (raíz del repositorio).
- **Resultados intermedios:** `preparacio/dades_intermedies/area_estudi.gpkg`.
- **Descargas originales:** `preparacio/dades_brutes/` (fuera de git; se pueden
  volver a descargar con las URLs de este documento).

Los scripts `01` y `02` son Python normal. Los scripts `03` a `07` se ejecutan
**dentro de QGIS** (Consola de Python → Mostrar editor → abrir el fichero → Ejecutar).

> **Pendiente de automatizar:** los pasos 1.3 y 2.4 se hicieron a mano en QGIS.
> Están descritos con detalle para poder repetirlos, pero aún no tienen script.

---

## 1. Población y renta por sección censal

**1.1 · Descargas (INE)**

| Fichero | URL |
|---|---|
| Secciones censales 2024 (toda España) | https://www.ine.es/prodyser/cartografia/seccionado_2024.zip |
| ADRH · indicadores de renta, provincia de Barcelona (tabla 30896) | https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/30896.csv |
| ADRH · indicadores demográficos, provincia de Barcelona (tabla 30904) | https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/30904.csv |

Para otra provincia, los identificadores de tabla son distintos: se encuentran en
INEbase → Atlas de Distribución de Renta de los Hogares → *Resultados por
municipios, distritos y secciones censales por provincias* → la provincia.

**1.2 · Tabla limpia** — `scripts/01_adrh_taula_neta.py`

- Parámetros: `ANY` (año) y `PROVINCIA` (código INE de dos cifras).
- Calcula `pob_18_64 = población × (100 − % menores de 18 − % de 65 y más) / 100`.
- Genera `dades_intermedies/adrh_<año>_seccions_p<prov>.csv` y su `.csvt`.

**1.3 · Área de estudio en QGIS** *(manual)*

1. Cargar `SECC_CE_20240101.shp` filtrando la provincia (`CPRO = '08'`) y
   reproyectar a EPSG:25831.
2. Extraer las secciones del municipio (`CUMUN = '08019'`) y disolverlas → capa
   `limit_barcelona`.
3. Buffer de 800 m del límite → capa `area_estudi_800m`.
4. Extraer las secciones que intersecan el buffer (incluye municipios vecinos,
   para evitar el efecto borde).
5. Cargar el CSV del paso 1.2 **con el proveedor OGR** (respeta el `.csvt`) y
   unirlo por `CUSEC` = `cusec` → capa `seccions_adrh_2024`.
6. Guardar las tres capas en `area_estudi.gpkg`.

Validación: todas las secciones deben unirse; la suma de población del municipio
debe coincidir con la del ADRH.

## 2. Clubes propios y competencia

**2.1 · Criterio de marca** — `marques_lowcost.csv`
Una marca es *low cost* si su cuota básica publicada es ≤ 35 €/mes (las cuotas
cada 4 semanas se convierten × 13 / 12). Se registra precio, tipo de fuente
(oficial / secundaria), URL y fecha de consulta. Sin fuente → no cuenta.

**2.2 · Fuentes de ubicaciones**
- **Cadena propia:** páginas de club de la web oficial, guardadas en
  `dades_brutes/clubs_web_<fecha>/vivagym/`. Cada página trae un bloque JSON-LD
  con dirección y coordenadas oficiales.
- **Competencia:** buscadores de cada marca → `clubs_adreces.csv`
  (estado `obert`, `previst` o `exclos` con el motivo en `notes`).
- **Centros municipales:** Open Data BCN, equipamientos deportivos
  (solo los que tienen la categoría "Fitness").
- **OpenStreetMap** solo como contraste: en Barcelona faltaban muchos clubes de
  cadena, así que no se usa como fuente principal.

**2.3 · Tabla de clubes** — `scripts/02_clubs.py`
Ejecutar con `/usr/bin/python3` (el Python de python.org no trae certificados
SSL y falla al conectar con el geocodificador). Geocodifica con el ICGC y genera
`dades_intermedies/clubs_<fecha>.csv`. Revisar a mano la columna
`adreca_trobada` frente a `adreca`.

**2.4 · Capa de clubes en QGIS** *(manual)*
Cargar el CSV como puntos (`lon`, `lat`, EPSG:4326), reproyectar a EPSG:25831,
quedarse con los que caen dentro de `area_estudi_800m` y guardar como
`clubs_<fecha>` en `area_estudi.gpkg`.

## 3. Graella e indicadores (dentro de QGIS)

| Script | Qué hace | Parámetros |
|---|---|---|
| `03_graella.py` | Hexágonos con el centro dentro del límite → `hexagons_300m` | `AMPLADA`, `CRS`, `CAPA_LIMIT` |
| `04_poblacio_renda.py` | Interpolación areal en un círculo de `RADI` m → `hex_indicadors` (población, población objetivo, renta ponderada) | `RADI` |
| `05_competencia_solapament.py` | Competidores abiertos a ≤ `RADI`, % de solapamiento con la unión de los círculos propios, distancia al club propio más cercano | `RADI`, `MARCA_PROPIA`, `CAPA_CLUBS` |
| `06_muc.py` | % del hexágono en suelo no urbanizable y clase de suelo (`urba` / `parcial` / `no_urbanitzable`) | `LLINDAR_NO_URBANITZABLE` |

Descarga del MUC usada en `06_muc.py` (servicio de la Diputació de Barcelona,
capa 0 "MUC Classificació", recortada al rectángulo del área de estudio):

```
https://gissrv.diba.cat/arcgis/rest/services/CARTOBASE/MUC/MapServer/0/query
  ?geometry=<xmin,ymin,xmax,ymax en EPSG:25831>&geometryType=esriGeometryEnvelope
  &inSR=25831&outSR=25831&spatialRel=esriSpatialRelIntersects&outFields=*&f=geojson
```

Validaciones hechas en Barcelona: población dentro de los hexágonos ≈ población
del municipio (diferencia 0,3 %); coherencia distancia–solapamiento (dos círculos
de 800 m solo se solapan a menos de 1.600 m).

## 4. Exportación para la web — `07_exportar_web.py`

Exporta a `data/` en EPSG:4326 con 5 decimales: `hexagons.geojson` (con barrio y
distrito), `clubs.geojson` (sin los excluidos) y `limit_municipal.geojson`
(solo la parte poligonal del límite).

Después, **revisar `config/scoring.json`**: ciudad, marca propia, textos y la
lista de fuentes con sus fechas.

## 5. Qué cambia para otra ciudad

| Elemento | Barcelona | Otra ciudad |
|---|---|---|
| Secciones censales | INE (nacional) | Igual |
| Población y renta | INE ADRH, tablas de la provincia 08 | Tablas ADRH de su provincia |
| Clubes | Webs oficiales de las marcas | Igual; revisar qué marcas operan allí |
| Centros municipales | Open Data BCN | Datos abiertos del ayuntamiento, si existen |
| Geocodificador | ICGC (solo Cataluña) | Fuera de Cataluña hace falta otro (por ejemplo CartoCiudad, del IGN; **a verificar**) |
| Clasificación del suelo | MUC (solo Cataluña) | Fuente equivalente de la comunidad autónoma; **a identificar** en cada caso |
| CRS | EPSG:25831 | EPSG:25830 en la mayor parte de la península |

Las rutas de los scripts `03`–`07` son absolutas
(`/Users/genismontaner/Projectes/smartxpand-hero/...`): hay que cambiarlas si
el proyecto está en otra carpeta.

## 6. Problemas conocidos y cómo se resolvieron

- **Códigos INE como números:** QGIS leía `CUSEC` como entero y perdía el cero
  inicial. Solución: fichero `.csvt` y cargar el CSV con OGR.
- **GeoPackage abierto en QGIS:** los cambios quedan en el fichero `-wal`.
  Antes de un commit: `PRAGMA wal_checkpoint(TRUNCATE)`. Los `-wal` y `-shm`
  están en `.gitignore`.
- **Límite municipal como colección de geometrías:** la disolución dejó una línea
  suelta y Leaflet no podía calcular la extensión. `07` exporta solo la parte
  poligonal.
- **Fuentes de clubes desactualizadas:** una dirección secundaria coincidía con un
  club oficial actual de otra marca → marcada como `exclos` con el motivo.
