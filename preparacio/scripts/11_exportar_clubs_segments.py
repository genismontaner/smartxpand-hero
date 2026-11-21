"""
Pas 1 (v1) · Exporta tots els clubs amb el seu segment per a la web.

S'executa DINS de QGIS. Ajunta:
- dades_intermedies/clubs_2026-10-25.csv  (VivaGym, low cost i CEM)
- dades_intermedies/clubs_segments_2026-11-21.csv (gamma mitjana i premium)
i en guarda els que cauen dins de Barcelona + FRANJA a data/clubs_segments.geojson,
amb el camp 'segment' tret de preparacio/marques.csv.
"""
import csv
from qgis.core import (QgsVectorLayer, QgsGeometry, QgsPointXY, QgsCoordinateTransform,
                       QgsCoordinateReferenceSystem, QgsProject, QgsField, QgsFeature,
                       QgsVectorFileWriter, QgsCoordinateTransformContext)
from qgis.PyQt.QtCore import QVariant

FRANJA = 3000  # metres, igual que la graella de població
ARREL = "/Users/genismontaner/Projectes/smartxpand-hero"
GPKG = f"{ARREL}/preparacio/dades_intermedies/area_estudi.gpkg"
ENTRADES = [f"{ARREL}/preparacio/dades_intermedies/clubs_2026-10-25.csv",
            f"{ARREL}/preparacio/dades_intermedies/clubs_segments_2026-11-21.csv"]
MARQUES = f"{ARREL}/preparacio/marques.csv"
SORTIDA = f"{ARREL}/data/clubs_segments.geojson"
CAMPS = ["marca", "segment", "nom", "adreca", "estat", "tipus_font", "font_url", "data_consulta", "notes"]

# Segment de cada marca (columna 'format' de marques.csv)
with open(MARQUES, encoding="utf-8") as f:
    segments = {r["marca"]: r["format"] for r in csv.DictReader(f)}
segments["CEM (centres esportius municipals)"] = "municipal"

limit = QgsVectorLayer(f"{GPKG}|layername=limit_barcelona", "limit", "ogr")
zona = QgsGeometry.unaryUnion([f.geometry() for f in limit.getFeatures()]).buffer(FRANJA, 16)
a_utm = QgsCoordinateTransform(QgsCoordinateReferenceSystem("EPSG:4326"),
                               QgsCoordinateReferenceSystem("EPSG:25831"), QgsProject.instance())

capa = QgsVectorLayer("Point?crs=EPSG:4326", "clubs_segments", "memory")
capa.dataProvider().addAttributes([QgsField(c, QVariant.String) for c in CAMPS])
capa.updateFields()

noves, fora, sense_segment = [], 0, set()
for ruta in ENTRADES:
    with open(ruta, encoding="utf-8") as f:
        for c in csv.DictReader(f):
            if c["estat"] == "exclos" or not c["lat"]:
                continue
            punt = QgsPointXY(float(c["lon"]), float(c["lat"]))
            if not zona.contains(QgsGeometry.fromPointXY(a_utm.transform(punt))):
                fora += 1
                continue
            segment = segments.get(c["marca"], "")
            if not segment:
                sense_segment.add(c["marca"])
            nou = QgsFeature(capa.fields())
            nou.setGeometry(QgsGeometry.fromPointXY(punt))
            nou.setAttributes([c["marca"], segment, c["nom"], c["adreca"], c["estat"],
                               c["tipus_font"], c["font_url"], c["data_consulta"], c.get("notes", "")])
            noves.append(nou)
capa.dataProvider().addFeatures(noves)

opcions = QgsVectorFileWriter.SaveVectorOptions()
opcions.driverName = "GeoJSON"
opcions.layerOptions = ["COORDINATE_PRECISION=5", "RFC7946=YES"]
QgsVectorFileWriter.writeAsVectorFormatV3(capa, SORTIDA, QgsCoordinateTransformContext(), opcions)

from collections import Counter
print(f"Clubs dins la zona: {len(noves)} · fora: {fora} · marques sense segment: {sense_segment or 'cap'}")
print(dict(Counter((f["segment"], f["estat"]) for f in noves)))
