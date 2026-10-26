"""
Pas 3.1 · Graella d'hexàgons sobre la ciutat.

S'executa DINS de QGIS (Consola de Python → Mostra l'editor → obrir aquest
fitxer → Executa). Fa servir les capes de preparacio/dades_intermedies/area_estudi.gpkg.

Regla: es queden els hexàgons amb el CENTRE dins del límit municipal.
No es retallen, perquè tots tinguin la mateixa forma i superfície.
"""
import processing
from qgis.core import (QgsVectorLayer, QgsVectorFileWriter, QgsCoordinateTransformContext,
                       QgsGeometry, QgsField, QgsFeature, QgsProject)
from qgis.PyQt.QtCore import QVariant

# Paràmetres
AMPLADA = 300  # metres, de costat pla a costat pla
CRS = "EPSG:25831"
GPKG = "/Users/genismontaner/Projectes/smartxpand-hero/preparacio/dades_intermedies/area_estudi.gpkg"
CAPA_LIMIT = "limit_barcelona"
CAPA_SORTIDA = f"hexagons_{AMPLADA}m"

limit = QgsVectorLayer(f"{GPKG}|layername={CAPA_LIMIT}", "limit", "ogr")
geom_limit = QgsGeometry.unaryUnion([f.geometry() for f in limit.getFeatures()])

# 1. Graella hexagonal que cobreix tot el límit (amb marge d'un hexàgon)
graella = processing.run("native:creategrid", {
    "TYPE": 4,  # 4 = hexàgons
    "EXTENT": limit.extent().buffered(AMPLADA),
    "HSPACING": AMPLADA, "VSPACING": AMPLADA,
    "HOVERLAY": 0, "VOVERLAY": 0, "CRS": CRS, "OUTPUT": "memory:",
})["OUTPUT"]

# 2. Ens quedem amb els hexàgons que tenen el centre dins del límit
motor = QgsGeometry.createGeometryEngine(geom_limit.constGet())
motor.prepareGeometry()  # fa les comprovacions molt més ràpides

sortida = QgsVectorLayer(f"Polygon?crs={CRS}", CAPA_SORTIDA, "memory")
sortida.dataProvider().addAttributes([QgsField("hex_id", QVariant.String)])
sortida.updateFields()

hexagons = []
for f in graella.getFeatures():
    centre = f.geometry().centroid()
    if motor.contains(centre.constGet()):
        nou = QgsFeature(sortida.fields())
        nou.setGeometry(f.geometry())
        nou["hex_id"] = f"H{len(hexagons) + 1:04d}"  # H0001, H0002...
        hexagons.append(nou)
sortida.dataProvider().addFeatures(hexagons)

# 3. Desa al GeoPackage i carrega al projecte
opcions = QgsVectorFileWriter.SaveVectorOptions()
opcions.driverName = "GPKG"
opcions.layerName = CAPA_SORTIDA
opcions.actionOnExistingFile = QgsVectorFileWriter.CreateOrOverwriteLayer
QgsVectorFileWriter.writeAsVectorFormatV3(sortida, GPKG, QgsCoordinateTransformContext(), opcions)

projecte = QgsProject.instance()
for capa in projecte.mapLayersByName(CAPA_SORTIDA):
    projecte.removeMapLayer(capa)
projecte.addMapLayer(QgsVectorLayer(f"{GPKG}|layername={CAPA_SORTIDA}", CAPA_SORTIDA, "ogr"))

print(f"Hexàgons: {len(hexagons)} · superfície de cadascun: {hexagons[0].geometry().area() / 10000:.2f} ha")
