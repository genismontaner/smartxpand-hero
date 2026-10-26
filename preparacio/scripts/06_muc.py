"""
Pas 3.4 · Filtre urbanístic preliminar amb el Mapa urbanístic de Catalunya (MUC).

S'executa DINS de QGIS, després de 05_competencia_solapament.py.

Font: MUC, capa "Classificació", Departament de Territori (Generalitat de
Catalunya), versió gener 2023, servida per la Diputació de Barcelona:
https://gissrv.diba.cat/arcgis/rest/services/CARTOBASE/MUC/MapServer/0

Afegeix a 'hex_indicadors':
- pct_no_urbanitzable: % de la superfície de l'hexàgon en sòl no urbanitzable
- sol: 'urba' (0 %), 'parcial' (>0 i <=50 %) o 'no_urbanitzable' (>50 %)

Només és un avís preliminar: NO verifica si l'ús de gimnàs està admès.
"""
import processing
from qgis.core import (QgsVectorLayer, QgsVectorFileWriter, QgsCoordinateTransformContext,
                       QgsField, QgsGeometry, QgsProject, QgsSpatialIndex)
from qgis.PyQt.QtCore import QVariant

# Paràmetres
LLINDAR_NO_URBANITZABLE = 50  # % a partir del qual l'hexàgon es descarta
GPKG = "/Users/genismontaner/Projectes/smartxpand-hero/preparacio/dades_intermedies/area_estudi.gpkg"
MUC_BRUT = "/Users/genismontaner/Projectes/smartxpand-hero/preparacio/dades_brutes/muc_diba_2023-01/muc_classificacio_area_estudi.geojson"
CAPA_MUC = "muc_classificacio_2023"
CAPA_HEX = "hex_indicadors"

# 1. Corregeix geometries (alguns polígons oficials poden tenir petits errors) i desa al GeoPackage
muc = processing.run("native:fixgeometries", {"INPUT": MUC_BRUT, "OUTPUT": "memory:"})["OUTPUT"]
opcions = QgsVectorFileWriter.SaveVectorOptions()
opcions.driverName = "GPKG"
opcions.layerName = CAPA_MUC
opcions.actionOnExistingFile = QgsVectorFileWriter.CreateOrOverwriteLayer
QgsVectorFileWriter.writeAsVectorFormatV3(muc, GPKG, QgsCoordinateTransformContext(), opcions)

# 2. Unim tots els polígons de sòl no urbanitzable en una sola geometria
no_urb = QgsGeometry.unaryUnion([f.geometry() for f in muc.getFeatures()
                                 if f["D_CLAS_MUC"] == "Sòl no urbanitzable"])

# 3. % de cada hexàgon en sòl no urbanitzable
hexagons = QgsVectorLayer(f"{GPKG}|layername={CAPA_HEX}", CAPA_HEX, "ogr")
nous_camps = [("pct_no_urbanitzable", QVariant.Double), ("sol", QVariant.String)]
existents = hexagons.fields().names()
hexagons.dataProvider().addAttributes([QgsField(n, t) for n, t in nous_camps if n not in existents])
hexagons.updateFields()
i_pct = hexagons.fields().indexOf("pct_no_urbanitzable")
i_sol = hexagons.fields().indexOf("sol")

canvis = {}
for h in hexagons.getFeatures():
    g = h.geometry()
    pct = 100 * g.intersection(no_urb).area() / g.area() if g.intersects(no_urb) else 0.0
    if pct == 0:
        sol = "urba"
    elif pct <= LLINDAR_NO_URBANITZABLE:
        sol = "parcial"
    else:
        sol = "no_urbanitzable"
    canvis[h.id()] = {i_pct: round(pct, 1), i_sol: sol}
hexagons.dataProvider().changeAttributeValues(canvis)

# 4. Recarrega capes al projecte
projecte = QgsProject.instance()
for capa in projecte.mapLayersByName(CAPA_HEX):
    capa.dataProvider().reloadData()
    capa.updateFields()
    capa.triggerRepaint()
for capa in projecte.mapLayersByName(CAPA_MUC):
    projecte.removeMapLayer(capa)
projecte.addMapLayer(QgsVectorLayer(f"{GPKG}|layername={CAPA_MUC}", CAPA_MUC, "ogr"))

from collections import Counter
print("Hexàgons per tipus de sòl:", dict(Counter(v[i_sol] for v in canvis.values())))
