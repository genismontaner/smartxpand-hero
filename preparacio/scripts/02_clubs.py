"""
Pas 2 · Taula única de clubs (propis i competència) amb coordenades.

- VivaGym: coordenades oficials llegides del JSON-LD de cada pàgina de club
  (descarregades a dades_brutes/clubs_web_<data>/vivagym/).
- Resta de marques: adreces de preparacio/clubs_adreces.csv, geocodificades
  amb el geocodificador de l'ICGC (només Catalunya).

Ús (des de l'arrel del projecte):
    /usr/bin/python3 preparacio/scripts/02_clubs.py

(Fem servir el Python del sistema perquè el de python.org no té els
certificats SSL instal·lats i falla en connectar amb l'ICGC.)
"""
import csv
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

# Paràmetres
DATA = "2026-10-25"
ARREL = Path(__file__).resolve().parents[2]
VIVAGYM_HTML = ARREL / f"preparacio/dades_brutes/clubs_web_{DATA}/vivagym"
ADRECES_CSV = ARREL / "preparacio/clubs_adreces.csv"
EQUIPAMENTS_BCN = ARREL / f"preparacio/dades_brutes/opendatabcn_equipaments_esports_{DATA}/equipaments_esports.csv"
EQUIPAMENTS_URL = "https://opendata-ajuntament.barcelona.cat/data/dataset/equipament-esports"
SORTIDA = ARREL / f"preparacio/dades_intermedies/clubs_{DATA}.csv"
ICGC = "https://eines.icgc.cat/geocodificador/cerca"

CAMPS = ["marca", "nom", "adreca", "municipi", "estat", "lat", "lon",
         "font_coord", "adreca_trobada", "tipus_font", "font_url", "data_consulta", "notes"]
# estat: obert (compta), previst (només context), exclos (no compta; motiu a 'notes')


def clubs_vivagym():
    """Llegeix el bloc JSON-LD de tipus HealthClub de cada pàgina desada."""
    clubs = []
    for fitxer in sorted(VIVAGYM_HTML.glob("*.html")):
        html = fitxer.read_text(encoding="utf-8", errors="ignore")
        blocs = re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html, re.S)
        for bloc in blocs:
            try:
                dades = json.loads(bloc)
            except json.JSONDecodeError:
                continue
            for d in dades if isinstance(dades, list) else [dades]:
                if d.get("@type") != "HealthClub":
                    continue
                adr, geo = d.get("address", {}), d.get("geo", {})
                clubs.append({
                    "marca": "VivaGym", "nom": d.get("name", fitxer.stem),
                    "adreca": adr.get("streetAddress", ""), "municipi": adr.get("addressLocality", ""),
                    "estat": "obert", "lat": geo.get("latitude"), "lon": geo.get("longitude"),
                    "font_coord": "web oficial (JSON-LD)", "adreca_trobada": "",
                    "tipus_font": "oficial", "font_url": d.get("url", ""), "data_consulta": DATA,
                })
    return clubs


def geocodifica(adreca, municipi):
    """Retorna (lat, lon, etiqueta) del primer resultat de l'ICGC, o (None, None, '')."""
    params = urllib.parse.urlencode({"text": f"{adreca}, {municipi}", "size": 1})
    peticio = urllib.request.Request(f"{ICGC}?{params}", headers={"User-Agent": "smartxpand-hero/0.1"})
    with urllib.request.urlopen(peticio, timeout=30) as resposta:
        resultat = json.load(resposta)
    if not resultat.get("features"):
        return None, None, ""
    f = resultat["features"][0]
    lon, lat = f["geometry"]["coordinates"]
    return lat, lon, f["properties"].get("etiqueta", "")


def clubs_adreces():
    clubs = []
    with open(ADRECES_CSV, encoding="utf-8") as f:
        for fila in csv.DictReader(f):
            lat, lon, etiqueta = geocodifica(fila["adreca"], fila["municipi"])
            clubs.append({**fila, "lat": lat, "lon": lon,
                          "font_coord": "geocodificador ICGC", "adreca_trobada": etiqueta})
            time.sleep(0.3)  # no saturar el servei
    return clubs


def clubs_cem():
    """CEM de Barcelona amb categoria 'Fitness' a Open Data BCN (coordenades incloses)."""
    cem = {}
    # El fitxer d'Open Data BCN ve en UTF-16 i té diverses files per equipament
    with open(EQUIPAMENTS_BCN, encoding="utf-16") as f:
        for fila in csv.DictReader(f):
            nom = " ".join(fila["name"].split())
            if not nom.lower().startswith("centre esportiu municipal"):
                continue
            c = cem.setdefault(fila["register_id"], {
                "marca": "CEM (centres esportius municipals)", "nom": nom,
                "adreca": f"{fila['addresses_road_name']} {fila['addresses_start_street_number']}".strip(),
                "municipi": "Barcelona", "estat": "obert",
                "lat": float(fila["geo_epgs_4326_lat"]), "lon": float(fila["geo_epgs_4326_lon"]),
                "font_coord": "Open Data BCN", "adreca_trobada": "", "tipus_font": "oficial",
                "font_url": EQUIPAMENTS_URL, "data_consulta": DATA, "fitness": False,
            })
            if "Fitness" in fila["secondary_filters_fullpath"]:
                c["fitness"] = True
    return [{k: v for k, v in c.items() if k != "fitness"} for c in cem.values() if c["fitness"]]


clubs = clubs_vivagym() + clubs_adreces() + clubs_cem()
SORTIDA.parent.mkdir(parents=True, exist_ok=True)
with open(SORTIDA, "w", encoding="utf-8", newline="") as f:
    escriptor = csv.DictWriter(f, fieldnames=CAMPS, restval="")
    escriptor.writeheader()
    escriptor.writerows(clubs)

# Resum per revisar a ull
for c in clubs:
    print(f"{c['marca']:13} | {c['nom'][:32]:32} | {c['adreca'][:35]:35} → {c['adreca_trobada'] or '(oficial)'}")
print(f"\nClubs: {len(clubs)} · sense coordenades: {sum(1 for c in clubs if c['lat'] is None)}")
print(f"Desat a: {SORTIDA.relative_to(ARREL)}")
