"""
Pas 3.2 · Població objectiu i renda dins del radi de cada hexàgon.

S'executa DINS de QGIS, com 03_graella.py.

Mètode (interpolació areal):
- Per a cada hexàgon, cercle de RADI metres des del seu centre.
- Cada secció censal hi aporta població en proporció a la part de la seva
  superfície que cau dins del cercle (suposem població repartida uniformement).
- Renda = mitjana de les seccions ponderada per la població que aporten.
  Les seccions sense renda publicada no compten per a la renda.

Sortida: capa 'hex_indicadors' (hexàgons + camps nous).
"""
from qgis.core import (QgsVectorLayer, QgsVectorFileWriter, QgsCoordinateTransformContext,
                       QgsField, QgsFeature, QgsProject, QgsSpatialIndex)
from qgis.PyQt.QtCore import QVariant

# Paràmetres
RADI = 800  # metres
GPKG = "/Users/genismontaner/Projectes/smartxpand-hero/preparacio/dades_intermedies/area_estudi.gpkg"
CAPA_HEX = "hexagons_300m"
CAPA_SECCIONS = "seccions_adrh_2024"
CAPA_SORTIDA = "hex_indicadors"


def es_buit(valor):
    """Cert si el valor és nul (QGIS fa servir NULL, no None)."""
    return valor is None or str(valor) == "NULL"


hexagons = QgsVectorLayer(f"{GPKG}|layername={CAPA_HEX}", "hex", "ogr")
seccions = QgsVectorLayer(f"{GPKG}|layername={CAPA_SECCIONS}", "sec", "ogr")

# Índex espacial i diccionari de seccions per anar ràpid
index = QgsSpatialIndex(seccions.getFeatures())
dades_seccions = {s.id(): s for s in seccions.getFeatures()}

# Capa de sortida: mateixos camps que els hexàgons + els indicadors nous
sortida = QgsVectorLayer(f"Polygon?crs={hexagons.crs().authid()}", CAPA_SORTIDA, "memory")
camps = hexagons.fields()
for nom, tipus in [("pob_total", QVariant.Int), ("pob_objectiu", QVariant.Int), ("renda", QVariant.Int)]:
    camps.append(QgsField(nom, tipus))
sortida.dataProvider().addAttributes(camps)
sortida.updateFields()

pob_dins_hexagons = 0  # per validar: població dins dels propis hexàgons (no del cercle)
noves = []
for h in hexagons.getFeatures():
    cercle = h.geometry().centroid().buffer(RADI, 32)
    pob_total = pob_obj = 0.0
    renda_x_pob = pob_amb_renda = 0.0

    for sid in index.intersects(cercle.boundingBox()):
        s = dades_seccions[sid]
        geom_s = s.geometry()
        if not geom_s.intersects(cercle):
            continue
        # Proporció de la secció que cau dins del cercle
        proporcio = geom_s.intersection(cercle).area() / geom_s.area()
        pob = 0 if es_buit(s["poblacio"]) else s["poblacio"] * proporcio
        pob_total += pob
        pob_obj += 0 if es_buit(s["pob_18_64"]) else s["pob_18_64"] * proporcio
        if not es_buit(s["renda_persona"]):
            renda_x_pob += s["renda_persona"] * pob
            pob_amb_renda += pob
        # Validació: mateixa lògica però amb l'hexàgon en lloc del cercle
        if geom_s.intersects(h.geometry()) and not es_buit(s["poblacio"]):
            pob_dins_hexagons += s["poblacio"] * geom_s.intersection(h.geometry()).area() / geom_s.area()

    nou = QgsFeature(sortida.fields())
    nou.setGeometry(h.geometry())
    nou.setAttributes(h.attributes() + [
        round(pob_total), round(pob_obj),
        round(renda_x_pob / pob_amb_renda) if pob_amb_renda > 0 else None,
    ])
    noves.append(nou)

sortida.dataProvider().addFeatures(noves)

# Desa i carrega
opcions = QgsVectorFileWriter.SaveVectorOptions()
opcions.driverName = "GPKG"
opcions.layerName = CAPA_SORTIDA
opcions.actionOnExistingFile = QgsVectorFileWriter.CreateOrOverwriteLayer
QgsVectorFileWriter.writeAsVectorFormatV3(sortida, GPKG, QgsCoordinateTransformContext(), opcions)
projecte = QgsProject.instance()
for capa in projecte.mapLayersByName(CAPA_SORTIDA):
    projecte.removeMapLayer(capa)
projecte.addMapLayer(QgsVectorLayer(f"{GPKG}|layername={CAPA_SORTIDA}", CAPA_SORTIDA, "ogr"))

print(f"Hexàgons processats: {len(noves)}")
print(f"Validació · població dins dels hexàgons: {round(pob_dins_hexagons):,}")
