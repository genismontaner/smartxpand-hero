"""
Pas 4.1 · Exporta les capes de QGIS a GeoJSON per a la web (carpeta data/).

S'executa DINS de QGIS, després de 06_muc.py.

- Coordenades en EPSG:4326 (latitud/longitud), que és el que fa servir Leaflet.
- 5 decimals (~1 m de precisió): fitxers més lleugers.
- Només els camps que necessita la web.
- Afegeix barri i districte a cada hexàgon (pel seu centre), amb els límits
  oficials d'Open Data BCN.
"""
import re
from qgis.core import (QgsVectorLayer, QgsVectorFileWriter, QgsCoordinateTransformContext,
                       QgsCoordinateReferenceSystem, QgsCoordinateTransform, QgsProject,
                       QgsField, QgsFeature, QgsSpatialIndex, QgsWkbTypes, QgsGeometry)
from qgis.PyQt.QtCore import QVariant

# Paràmetres
ARREL = "/Users/genismontaner/Projectes/smartxpand-hero"
GPKG = f"{ARREL}/preparacio/dades_intermedies/area_estudi.gpkg"
BARRIS_CSV = f"{ARREL}/preparacio/dades_brutes/opendatabcn_barris_2026-10-26/BarcelonaCiutat_Barris.csv"
SORTIDA = f"{ARREL}/data"

CAMPS_HEX = ["hex_id", "barri", "districte", "pob_total", "pob_objectiu", "renda",
             "n_competidors", "competidors", "solapament_pct", "dist_propi_m",
             "pct_no_urbanitzable", "sol"]
CAMPS_CLUBS = ["marca", "nom", "adreca", "municipi", "estat", "tipus_font"]

# Noms nets dels clubs (mòdul compartit amb 11_exportar_clubs_segments.py)
import sys
sys.path.insert(0, f"{ARREL}/preparacio/scripts")
from noms_clubs import nom_net


def nom_curt(nom):
    """Escurça els noms llargs dels centres municipals."""
    return nom_net("", nom, "")


def exporta(capa, nom_fitxer, rfc7946=True):
    """Desa una capa en GeoJSON (EPSG:4326, 5 decimals)."""
    opcions = QgsVectorFileWriter.SaveVectorOptions()
    opcions.driverName = "GeoJSON"
    opcions.layerOptions = ["COORDINATE_PRECISION=5"] + (["RFC7946=YES"] if rfc7946 else [])
    opcions.ct = QgsCoordinateTransform(capa.crs(), QgsCoordinateReferenceSystem("EPSG:4326"), QgsProject.instance())
    resultat = QgsVectorFileWriter.writeAsVectorFormatV3(capa, f"{SORTIDA}/{nom_fitxer}",
                                                         QgsCoordinateTransformContext(), opcions)
    print(nom_fitxer, "→ error" if resultat[0] else "→ ok")


def capa_memoria(tipus, crs, camps):
    capa = QgsVectorLayer(f"{tipus}?crs={crs}", "tmp", "memory")
    capa.dataProvider().addAttributes(camps)
    capa.updateFields()
    return capa


# --- Hexàgons amb barri i districte ---
uri = f"file://{BARRIS_CSV}?delimiter=,&wktField=geometria_etrs89&crs=EPSG:25831"
barris = QgsVectorLayer(uri, "barris", "delimitedtext")
index_barris = QgsSpatialIndex(barris.getFeatures())
dades_barris = {b.id(): b for b in barris.getFeatures()}

hexagons = QgsVectorLayer(f"{GPKG}|layername=hex_indicadors", "hex", "ogr")
camps = [QgsField(n, hexagons.fields().field(n).type()) for n in CAMPS_HEX if n not in ("barri", "districte")]
camps.insert(1, QgsField("barri", QVariant.String))
camps.insert(2, QgsField("districte", QVariant.String))
hex_web = capa_memoria("Polygon", "EPSG:25831", camps)

noves = []
for h in hexagons.getFeatures():
    centre = h.geometry().centroid()
    # Barri que conté el centre; si cap (p. ex. port), el barri més proper
    candidats = [dades_barris[i] for i in index_barris.intersects(centre.boundingBox())
                 if dades_barris[i].geometry().contains(centre)]
    barri = candidats[0] if candidats else dades_barris[index_barris.nearestNeighbor(centre.asPoint(), 1)[0]]
    f = QgsFeature(hex_web.fields())
    f.setGeometry(h.geometry())
    valors = {n: h[n] for n in CAMPS_HEX if n not in ("barri", "districte")}
    valors["competidors"] = nom_curt(valors["competidors"] or "")
    valors["barri"] = barri["nom_barri"]
    valors["districte"] = barri["nom_districte"]
    f.setAttributes([valors[c.name()] for c in camps])
    noves.append(f)
hex_web.dataProvider().addFeatures(noves)
exporta(hex_web, "hexagons.geojson")

# --- Clubs (sense els exclosos) ---
clubs = QgsVectorLayer(f"{GPKG}|layername=clubs_2026_10_25", "clubs", "ogr")
clubs_web = capa_memoria("Point", "EPSG:25831", [QgsField(n, QVariant.String) for n in CAMPS_CLUBS])
noves = []
for c in clubs.getFeatures():
    if c["estat"] == "exclos":
        continue
    valors = {n: c[n] for n in CAMPS_CLUBS}
    valors["nom"] = nom_net(c["marca"], c["nom"], c["font_url"])
    f = QgsFeature(clubs_web.fields())
    f.setGeometry(c.geometry())
    f.setAttributes([valors[n] for n in CAMPS_CLUBS])
    noves.append(f)
clubs_web.dataProvider().addFeatures(noves)
exporta(clubs_web, "clubs.geojson")

# --- Límit municipal ---
# La fusió de seccions (pas 1) va deixar una col·lecció amb un polígon i una línia sobrant:
# ens quedem només amb la part de polígon, que és la que Leaflet necessita
limit = QgsVectorLayer(f"{GPKG}|layername=limit_barcelona", "limit", "ogr")
limit_web = capa_memoria("MultiPolygon", "EPSG:25831", [QgsField("municipi", QVariant.String)])
f_limit = next(limit.getFeatures())
nou = QgsFeature(limit_web.fields())
# Ens quedem només amb les parts de polígon (convertToType no treia la línia sobrant)
parts = [p for p in f_limit.geometry().asGeometryCollection()
         if p.type() == QgsWkbTypes.PolygonGeometry]
nou.setGeometry(QgsGeometry.collectGeometry(parts))
nou.setAttributes([f_limit["NMUN"]])
limit_web.dataProvider().addFeatures([nou])
# Sense l'opció RFC7946: combinada amb l'arrodoniment, convertia una part petita del límit
# en una línia (GeometryCollection). Les coordenades ja es transformen a EPSG:4326.
exporta(limit_web, "limit_municipal.geojson", rfc7946=False)
