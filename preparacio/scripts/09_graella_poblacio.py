"""
Pas 1 (v1) · Graella de població de 100 m.

S'executa DINS de QGIS. Reparteix les dades de cada secció censal en cel·les
de CELA metres, en proporció a la superfície de la secció que cau a cada cel·la
(repartiment uniforme dins de la secció).

Entrades:
- Contorns de secció 2024 (INE) de la província.
- dades_intermedies/adrh_2024_seccions_p08.csv   (renda per persona i per llar, llars)
- dades_intermedies/censo_edat_2024_seccions_p08.csv (població per trams de 5 anys)

Sortides:
- capa 'graella_100m' a area_estudi.gpkg (per revisar a QGIS)
- data/poblacio_100m.json (format compacte per a la web)
"""
import csv
import json
from collections import defaultdict
from qgis.core import (QgsVectorLayer, QgsCoordinateReferenceSystem, QgsCoordinateTransform,
                       QgsProject, QgsGeometry, QgsRectangle, QgsSpatialIndex, QgsFeature,
                       QgsField, QgsVectorFileWriter, QgsCoordinateTransformContext, QgsPointXY)
from qgis.PyQt.QtCore import QVariant
import processing

# Paràmetres
CELA = 100  # metres
FRANJA = 3000  # metres al voltant del límit municipal (radi màxim de la v1)
ARREL = "/Users/genismontaner/Projectes/smartxpand-hero"
GPKG = f"{ARREL}/preparacio/dades_intermedies/area_estudi.gpkg"
SECCIONS_SHP = f"{ARREL}/preparacio/dades_brutes/ine_seccionat_2024/SECC_CE_20240101.shp"
ADRH_CSV = f"{ARREL}/preparacio/dades_intermedies/adrh_2024_seccions_p08.csv"
EDAT_CSV = f"{ARREL}/preparacio/dades_intermedies/censo_edat_2024_seccions_p08.csv"
SORTIDA_JSON = f"{ARREL}/data/poblacio_100m.json"
TRAMS = [f"e{a:02d}_{a + 4:02d}" for a in range(0, 85, 5)] + ["e85_mes"]


def llegeix_csv(ruta):
    with open(ruta, encoding="utf-8") as f:
        return {fila["cusec"]: fila for fila in csv.DictReader(f)}


def num(text):
    return float(text) if text not in ("", None) else None


# 1. Zona: límit de Barcelona + franja
limit = QgsVectorLayer(f"{GPKG}|layername=limit_barcelona", "limit", "ogr")
zona = QgsGeometry.unaryUnion([f.geometry() for f in limit.getFeatures()]).buffer(FRANJA, 16)

# 2. Seccions de la província dins de la zona, en EPSG:25831
prov = QgsVectorLayer(SECCIONS_SHP, "prov", "ogr")
prov.setSubsetString("CPRO='08'")
prov = processing.run("native:reprojectlayer", {"INPUT": prov, "TARGET_CRS": "EPSG:25831",
                                                 "OUTPUT": "memory:"})["OUTPUT"]
adrh, edat = llegeix_csv(ADRH_CSV), llegeix_csv(EDAT_CSV)

seccions = []
for s in prov.getFeatures():
    if not s.geometry().intersects(zona):
        continue
    a, e = adrh.get(s["CUSEC"], {}), edat.get(s["CUSEC"], {})
    seccions.append({
        "cusec": s["CUSEC"], "geom": s.geometry(), "area": s.geometry().area(),
        "trams": [num(e.get(t)) or 0 for t in TRAMS],
        "llars": num(a.get("llars")) or 0,
        "renda_persona": num(a.get("renda_persona")),
        "renda_llar": num(a.get("renda_llar")),
    })

# 3. Graella de cel·les quadrades que cobreix la zona
caixa = zona.boundingBox()
x0, y0 = int(caixa.xMinimum() // CELA) * CELA, int(caixa.yMinimum() // CELA) * CELA

# Acumuladors per cel·la (clau: columna i fila)
trams_cela = defaultdict(lambda: [0.0] * len(TRAMS))
llars_cela = defaultdict(float)
rp_suma = defaultdict(float)  # renda per persona × població (per fer la mitjana ponderada)
rp_pes = defaultdict(float)
rl_suma = defaultdict(float)  # renda per llar × llars
rl_pes = defaultdict(float)

for s in seccions:
    b = s["geom"].boundingBox()
    motor = QgsGeometry.createGeometryEngine(s["geom"].constGet())
    motor.prepareGeometry()
    for i in range(int((b.xMinimum() - x0) // CELA), int((b.xMaximum() - x0) // CELA) + 1):
        for j in range(int((b.yMinimum() - y0) // CELA), int((b.yMaximum() - y0) // CELA) + 1):
            quadrat = QgsGeometry.fromRect(QgsRectangle(x0 + i * CELA, y0 + j * CELA,
                                                        x0 + (i + 1) * CELA, y0 + (j + 1) * CELA))
            if not motor.intersects(quadrat.constGet()):
                continue
            # Proporció de la secció que cau dins d'aquesta cel·la
            fraccio = s["geom"].intersection(quadrat).area() / s["area"]
            if fraccio <= 0:
                continue
            clau = (i, j)
            pob = 0.0
            for k, valor in enumerate(s["trams"]):
                trams_cela[clau][k] += valor * fraccio
                pob += valor * fraccio
            llars = s["llars"] * fraccio
            llars_cela[clau] += llars
            if s["renda_persona"] is not None:
                rp_suma[clau] += s["renda_persona"] * pob
                rp_pes[clau] += pob
            if s["renda_llar"] is not None:
                rl_suma[clau] += s["renda_llar"] * llars
                rl_pes[clau] += llars

# 4. Ens quedem amb les cel·les amb població i el centre dins de la zona
a_wgs = QgsCoordinateTransform(QgsCoordinateReferenceSystem("EPSG:25831"),
                               QgsCoordinateReferenceSystem("EPSG:4326"), QgsProject.instance())
cel_les = []
for (i, j), trams in trams_cela.items():
    pob = sum(trams)
    cx, cy = x0 + (i + 0.5) * CELA, y0 + (j + 0.5) * CELA
    if pob <= 0 or not zona.contains(QgsGeometry.fromPointXY(QgsPointXY(cx, cy))):
        continue
    p = a_wgs.transform(QgsPointXY(cx, cy))
    cel_les.append({
        "x": cx, "y": cy, "lat": round(p.y(), 5), "lon": round(p.x(), 5),
        "trams": [round(t, 1) for t in trams],
        "llars": round(llars_cela[(i, j)], 1),
        "renda_persona": round(rp_suma[(i, j)] / rp_pes[(i, j)]) if rp_pes[(i, j)] else None,
        "renda_llar": round(rl_suma[(i, j)] / rl_pes[(i, j)]) if rl_pes[(i, j)] else None,
    })

# 5a. Capa de punts per revisar a QGIS
capa = QgsVectorLayer("Point?crs=EPSG:25831", "graella_100m", "memory")
camps = [QgsField(t, QVariant.Double) for t in TRAMS] + [
    QgsField("pob", QVariant.Double), QgsField("llars", QVariant.Double),
    QgsField("renda_persona", QVariant.Int), QgsField("renda_llar", QVariant.Int)]
capa.dataProvider().addAttributes(camps)
capa.updateFields()
noves = []
for c in cel_les:
    f = QgsFeature(capa.fields())
    f.setGeometry(QgsGeometry.fromPointXY(QgsPointXY(c["x"], c["y"])))
    f.setAttributes(c["trams"] + [round(sum(c["trams"]), 1), c["llars"], c["renda_persona"], c["renda_llar"]])
    noves.append(f)
capa.dataProvider().addFeatures(noves)
opcions = QgsVectorFileWriter.SaveVectorOptions()
opcions.driverName = "GPKG"
opcions.layerName = "graella_100m"
opcions.actionOnExistingFile = QgsVectorFileWriter.CreateOrOverwriteLayer
QgsVectorFileWriter.writeAsVectorFormatV3(capa, GPKG, QgsCoordinateTransformContext(), opcions)

# 5b. Format compacte per a la web: una llista de valors per cel·la, en l'ordre de 'camps'
web = {
    "descripcio": "Rejilla de población de 100 m derivada de secciones censales (reparto uniforme dentro de cada sección).",
    "cela_m": CELA,
    "fonts": [
        {"dada": "Población por edad", "font": "INE, Censo Anual de Población", "any": "2024"},
        {"dada": "Hogares y renta", "font": "INE, Atlas de Distribución de Renta de los Hogares", "any": "2024"},
        {"dada": "Secciones censales", "font": "INE, cartografía de secciones censales", "any": "2024"},
    ],
    "camps": ["lat", "lon"] + TRAMS + ["llars", "renda_persona", "renda_llar"],
    "cel_les": [[c["lat"], c["lon"]] + c["trams"] + [c["llars"], c["renda_persona"], c["renda_llar"]]
                for c in cel_les],
}
with open(SORTIDA_JSON, "w", encoding="utf-8") as f:
    json.dump(web, f, ensure_ascii=False, separators=(",", ":"))

total_seccions = sum(sum(s["trams"]) for s in seccions if zona.contains(s["geom"]))
print(f"Seccions a la zona: {len(seccions)} · cel·les amb població: {len(cel_les)}")
print(f"Població a les cel·les: {round(sum(sum(c['trams']) for c in cel_les)):,}")
print(f"Població de les seccions completament dins la zona: {round(total_seccions):,}")
