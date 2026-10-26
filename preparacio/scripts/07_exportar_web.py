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
                       QgsField, QgsFeature, QgsSpatialIndex)
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

# Noms dels clubs VivaGym tal com surten al directori oficial (www.vivagym.com/es-es/gimnasios/),
# identificats pel final de la URL de cada club
NOMS_VIVAGYM = {
    "arc-de-triomf": "Arc de Triomf", "av-roma": "Av. Roma", "berlin": "Berlín",
    "besos-mar": "Besós Mar", "bruc": "Bruc", "diagonal": "Diagonal", "entenca": "Entença",
    "glories": "Glòries", "la-rotonda": "La Rotonda", "la-verneda": "La Verneda",
    "londres": "Londres", "magoria": "Magoria", "manso": "Manso", "meridiana": "Meridiana",
    "passeig-de-sant-joan": "Passeig de Sant Joan", "sagrada-familia": "Sagrada Familia",
    "sagrera": "Sagrera", "sant-antoni": "Sant Antoni", "sants": "Sants",
    "universitat": "Universitat", "via-augusta": "Vía Augusta",
    "gran-via": "Gran Vía – Hospitalet", "santa-eulalia": "Santa Eulàlia",
    "finestrelles": "Finestrelles", "cornella": "Cornellà",
}


def nom_curt(nom):
    """Escurça els noms llargs dels centres municipals."""
    return nom.replace("Centre Esportiu Municipal ", "CEM ")


def exporta(capa, nom_fitxer):
    """Desa una capa en GeoJSON (EPSG:4326, 5 decimals)."""
    opcions = QgsVectorFileWriter.SaveVectorOptions()
    opcions.driverName = "GeoJSON"
    opcions.layerOptions = ["COORDINATE_PRECISION=5", "RFC7946=YES"]
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
    if c["marca"] == "VivaGym":
        clau = c["font_url"].rstrip("/").split("/")[-1]
        valors["nom"] = f"VivaGym {NOMS_VIVAGYM.get(clau, clau)}"
    valors["nom"] = nom_curt(valors["nom"])
    f = QgsFeature(clubs_web.fields())
    f.setGeometry(c.geometry())
    f.setAttributes([valors[n] for n in CAMPS_CLUBS])
    noves.append(f)
clubs_web.dataProvider().addFeatures(noves)
exporta(clubs_web, "clubs.geojson")

# --- Límit municipal ---
exporta(QgsVectorLayer(f"{GPKG}|layername=limit_barcelona", "limit", "ogr"), "limit_municipal.geojson")
