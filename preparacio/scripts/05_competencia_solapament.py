"""
Pas 3.3 · Competència i solapament amb els clubs propis.

S'executa DINS de QGIS, després de 04_poblacio_renda.py.
Afegeix camps a la capa 'hex_indicadors':
- n_competidors: clubs oberts de la competència a <= RADI del centre de l'hexàgon
- competidors:   noms d'aquests clubs, separats per "; "
- solapament_pct: % del cercle de l'hexàgon dins de l'àrea (fusionada) dels
                  cercles de RADI dels clubs propis
- dist_propi_m:  distància al club propi més proper (metres)
"""
from qgis.core import QgsVectorLayer, QgsField, QgsGeometry, QgsProject
from qgis.PyQt.QtCore import QVariant

# Paràmetres
RADI = 800  # metres
MARCA_PROPIA = "VivaGym"
GPKG = "/Users/genismontaner/Projectes/smartxpand-hero/preparacio/dades_intermedies/area_estudi.gpkg"
CAPA_HEX = "hex_indicadors"
CAPA_CLUBS = "clubs_2026_10_25"

hexagons = QgsVectorLayer(f"{GPKG}|layername={CAPA_HEX}", CAPA_HEX, "ogr")
clubs = QgsVectorLayer(f"{GPKG}|layername={CAPA_CLUBS}", "clubs", "ogr")

# Només compten els clubs oberts (els previstos i exclosos no)
oberts = [c for c in clubs.getFeatures() if c["estat"] == "obert"]
propis = [c for c in oberts if c["marca"] == MARCA_PROPIA]
competidors = [c for c in oberts if c["marca"] != MARCA_PROPIA]

# Àrea d'influència dels clubs propis: unió de tots els cercles (sense comptar dues vegades)
area_propia = QgsGeometry.unaryUnion([c.geometry().buffer(RADI, 32) for c in propis])

# Afegeix els camps nous (si ja existeixen d'una execució anterior, es reaprofiten)
nous_camps = [("n_competidors", QVariant.Int), ("competidors", QVariant.String),
              ("solapament_pct", QVariant.Double), ("dist_propi_m", QVariant.Int)]
existents = hexagons.fields().names()
hexagons.dataProvider().addAttributes([QgsField(n, t) for n, t in nous_camps if n not in existents])
hexagons.updateFields()
idx = {n: hexagons.fields().indexOf(n) for n, _ in nous_camps}

canvis = {}
for h in hexagons.getFeatures():
    centre = h.geometry().centroid()
    cercle = centre.buffer(RADI, 32)

    # Competidors a <= RADI metres del centre
    propers = [c for c in competidors if c.geometry().distance(centre) <= RADI]
    noms = "; ".join(sorted(c["nom"] for c in propers))

    # % del cercle compartit amb l'àrea dels clubs propis
    solapament = 100 * cercle.intersection(area_propia).area() / cercle.area()

    # Distància al club propi més proper
    dist = min(c.geometry().distance(centre) for c in propis)

    canvis[h.id()] = {idx["n_competidors"]: len(propers), idx["competidors"]: noms,
                      idx["solapament_pct"]: round(solapament, 1), idx["dist_propi_m"]: round(dist)}

hexagons.dataProvider().changeAttributeValues(canvis)

# Recarrega la capa al projecte perquè es vegin els camps nous
projecte = QgsProject.instance()
for capa in projecte.mapLayersByName(CAPA_HEX):
    capa.dataProvider().reloadData()
    capa.updateFields()
    capa.triggerRepaint()

print(f"Clubs propis: {len(propis)} · competidors oberts: {len(competidors)}")
print(f"Hexàgons actualitzats: {len(canvis)}")
