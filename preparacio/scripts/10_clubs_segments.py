"""
Pas 1 (v1) · Clubs de gamma mitjana i premium, amb font de cada ubicació.

Ús (des de l'arrel del projecte):
    /usr/bin/python3 preparacio/scripts/10_clubs_segments.py

Fonts (pàgines desades a dades_brutes/clubs_premium_<data>/):
- DiR / BDiR: pàgina de cada club a dir.cat (JSON-LD amb coordenades oficials)
- Metropolitan: llista de clubs de Barcelona a clubmetropolitan.com
- We/On (la web de Holmes Place Espanya hi redirigeix): pàgina de cada club
- Dreamfit: pàgina de cada centre
- Àccura i Anytime Fitness: OpenStreetMap (la web d'Anytime exigeix verificació
  humana i no s'ha pogut consultar; Àccura no té web oficial localitzada)

Les adreces sense coordenades es geocodifiquen amb l'ICGC (cal el Python del sistema).
"""
import csv
import html
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

DATA = "2026-11-21"
ARREL = Path(__file__).resolve().parents[2]
BRUTES = ARREL / f"preparacio/dades_brutes/clubs_premium_{DATA}"
OSM = ARREL / "preparacio/dades_brutes/osm_gimnasos_2026-10-25/overpass.json"
SORTIDA = ARREL / f"preparacio/dades_intermedies/clubs_segments_{DATA}.csv"
ICGC = "https://eines.icgc.cat/geocodificador/cerca"
CAMPS = ["marca", "nom", "adreca", "municipi", "estat", "lat", "lon", "font_coord",
         "adreca_trobada", "tipus_font", "font_url", "data_consulta", "notes"]


def text_net(ruta, separador=" "):
    """Text visible d'una pàgina desada. Cada etiqueta HTML es substitueix pel separador."""
    t = ruta.read_text(encoding="utf-8", errors="ignore")
    t = re.sub(r"<script.*?</script>", "", t, flags=re.S)
    t = html.unescape(re.sub(r"<[^>]+>", separador, t))
    if separador == "|":
        return re.sub(r"\s*\|\s*(\|\s*)*", "|", t)  # junta separadors seguits
    return re.sub(r"\s+", " ", t)


def geocodifica(adreca, municipi):
    if not adreca:
        return None, None, ""  # sense adreça no es geocodifica (evita coordenades falses)
    params = urllib.parse.urlencode({"text": f"{adreca}, {municipi}", "size": 1})
    peticio = urllib.request.Request(f"{ICGC}?{params}", headers={"User-Agent": "smartxpand-hero/0.1"})
    with urllib.request.urlopen(peticio, timeout=30) as resposta:
        f = json.load(resposta)["features"]
    time.sleep(0.3)
    if not f:
        return None, None, ""
    lon, lat = f[0]["geometry"]["coordinates"]
    return lat, lon, f[0]["properties"].get("etiqueta", "")


def club(**camps):
    return {"estat": "obert", "data_consulta": DATA, "adreca_trobada": "", "notes": "", **camps}


clubs = []

# --- DiR, BDiR i OneDiR: JSON-LD de cada pàgina de club ---
for pagina in sorted((BRUTES / "dir").glob("*.html")):
    t = pagina.read_text(encoding="utf-8", errors="ignore")
    for bloc in re.findall(r"<script[^>]*ld\+json[^>]*>(.*?)</script>", t, re.S):
        try:
            d = json.loads(bloc)
        except json.JSONDecodeError:
            continue
        for x in d.get("@graph", [d]) if isinstance(d, dict) else d:
            if not (isinstance(x, dict) and x.get("geo")):
                continue
            nom = x["name"]
            marca = "BDiR" if nom.startswith("BDiR") else "OneDiR" if nom.startswith("OneDiR") else "DiR"
            a = x.get("address", {})
            clubs.append(club(marca=marca, nom=nom, adreca=a.get("streetAddress", "").title(),
                              municipi=a.get("postalCode", ""), lat=float(x["geo"]["latitude"]),
                              lon=float(x["geo"]["longitude"]), font_coord="web oficial (JSON-LD)",
                              tipus_font="oficial",
                              font_url=f"https://www.dir.cat/es/gimnasios-barcelona/{pagina.stem}"))

# --- Metropolitan: "Nom (BCN)" seguit de l'adreça a la pàgina de Barcelona ---
text = text_net(BRUTES / "metropolitan/barcelona.html", "|")
for nom, adreca in re.findall(r"\|([^|]{3,40}) \(BCN\)\|([^|]{5,90})", text):
    adreca = adreca.strip()
    municipi = ("Sant Just Desvern" if "Sant Just" in adreca else "L'Hospitalet de Llobregat"
                if "Hospitalet" in adreca else "Badalona" if nom.strip() == "Badalona" else "Barcelona")
    if "Centro Comercial Arenas" in adreca:
        adreca = "Gran Via de les Corts Catalanes 373"  # adreça del centre comercial Arenas
    lat, lon, trobada = geocodifica(adreca, municipi)
    clubs.append(club(marca="Metropolitan", nom=f"Metropolitan {nom.strip()}", adreca=adreca,
                      municipi=municipi, lat=lat, lon=lon, font_coord="geocodificador ICGC",
                      adreca_trobada=trobada, tipus_font="oficial",
                      font_url="https://clubmetropolitan.com/clubs/barcelona/"))

# --- We/On: "Dónde estamos <adreça>" a cada pàgina de club ---
for fitxer, nom in [("weon_balmes.html", "We/On Balmes"), ("weon_urquinaona.html", "We/On Urquinaona")]:
    m = re.search(r"Dónde estamos (.+?) (\d{5}) Barcelona", text_net(BRUTES / "holmes" / fitxer))
    adreca = m.group(1).strip() if m else ""
    lat, lon, trobada = geocodifica(adreca, "Barcelona")
    clubs.append(club(marca="We/On", nom=nom, adreca=adreca, municipi="Barcelona", lat=lat, lon=lon,
                      font_coord="geocodificador ICGC", adreca_trobada=trobada, tipus_font="oficial",
                      font_url=f"https://www.weonclub.com/clubs/{fitxer[5:-5]}",
                      notes="La web de Holmes Place España redirige a We/On."))

# --- Dreamfit: adreça abans del codi postal a cada pàgina de centre ---
for fitxer, municipi in [("hospitalet.html", "L'Hospitalet de Llobregat"),
                         ("sant-boi-de-llobregat.html", "Sant Boi de Llobregat")]:
    text = text_net(BRUTES / "dreamfit" / fitxer)
    m = re.search(r"((?:Avinguda|Avenida|Calle|Carrer)[^|]{3,60}?\d+) \d{5} " + re.escape(municipi), text)
    adreca = m.group(1).strip() if m else ""
    lat, lon, trobada = geocodifica(adreca, municipi)
    clubs.append(club(marca="Dreamfit", nom=f"Dreamfit {municipi}", adreca=adreca, municipi=municipi,
                      lat=lat, lon=lon, font_coord="geocodificador ICGC", adreca_trobada=trobada,
                      tipus_font="oficial", font_url=f"https://www.dreamfit.es/centros/{fitxer[:-5]}"))

# --- Àccura i Anytime Fitness: OpenStreetMap ---
for e in json.load(open(OSM, encoding="utf-8"))["elements"]:
    t = e.get("tags", {})
    nom_osm = (t.get("brand", "") + " " + t.get("name", "")).lower()
    marca = "Anytime Fitness" if "anytime" in nom_osm else "Àccura" if "ccura" in nom_osm else None
    if not marca:
        continue
    lat = e.get("lat") or e["center"]["lat"]
    lon = e.get("lon") or e["center"]["lon"]
    adreca = f"{t.get('addr:street', '')} {t.get('addr:housenumber', '')}".strip()
    clubs.append(club(marca=marca, nom=t.get("name") or marca, adreca=adreca, municipi="Barcelona",
                      lat=lat, lon=lon, font_coord="OpenStreetMap", tipus_font="secundaria",
                      font_url=f"https://www.openstreetmap.org/{e['type']}/{e['id']}",
                      data_consulta="2026-10-25",
                      notes="No verificado en la web oficial."))

# Control de qualitat: una geocodificació sense número de portal (només el municipi
# o un nom de lloc) no és una ubicació fiable → el club queda exclòs, amb el motiu
for c in clubs:
    if c["font_coord"] == "geocodificador ICGC" and not re.search(r"\d", c["adreca_trobada"]):
        c.update(lat=None, lon=None, estat="exclos",
                 notes=(c["notes"] + " Geocodificación imprecisa (sin número de portal).").strip())

SORTIDA.parent.mkdir(parents=True, exist_ok=True)
with open(SORTIDA, "w", encoding="utf-8", newline="") as f:
    escriptor = csv.DictWriter(f, fieldnames=CAMPS)
    escriptor.writeheader()
    escriptor.writerows(clubs)

for c in clubs:
    print(f"{c['marca']:15} | {c['nom'][:30]:30} | {c['adreca'][:34]:34} → {c['adreca_trobada'] or c['font_coord']}")
print(f"\nClubs: {len(clubs)} · sense coordenades: {sum(1 for c in clubs if c['lat'] is None)}")
