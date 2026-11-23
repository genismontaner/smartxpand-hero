"""
Clubs low cost de la província de Barcelona amb coordenades oficials (consulta del 23/11/2026).

El pas 1 només va recollir els clubs low cost de Barcelona + 800 m: a la franja de 3 km
(l'Hospitalet, Badalona, Cornellà...) la competència quedava incompleta. Aquest script
llegeix la llista completa de clubs de cada marca des del seu sitemap oficial, desa la
pàgina de cada club a dades_brutes/ i en treu el JSON-LD (nom, adreça i coordenades).
Es queda amb els de codi postal 08 (província); 11_exportar_clubs_segments.py filtra
després els de Barcelona + 3 km.

- Basic-Fit: sitemap de clubs d'Espanya. La web de McFit Espanya redirigeix a Basic-Fit
  (comprovat el 23/11/2026): els antics McFit, si continuen oberts, surten aquí.
- Fitness Park: sitemap de clubs. "Próxima apertura" → estat "previst".
- Synergym: la web exigeix superar un CAPTCHA (Imperva) i les pàgines de club no porten
  coordenades. Les adreces oficials (llista de la portada, consultada al navegador el
  23/11/2026) són a preparacio/synergym_adreces_2026-11-23.csv i es geocodifiquen amb
  l'ICGC, com al pas 1. Preu oficial: 30,99 €/mes (Barcelona Arenas, pàgina de quotes).

Ús (des de l'arrel del projecte):
    /usr/bin/python3 preparacio/scripts/14_clubs_low_cost.py
Les pàgines ja desades no es tornen a descarregar.
"""
import csv
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

DATA = "2026-11-23"
ARREL = Path(__file__).resolve().parents[2]
BRUTES = ARREL / f"preparacio/dades_brutes/clubs_low_cost_{DATA}"
SORTIDA = ARREL / f"preparacio/dades_intermedies/clubs_low_cost_{DATA}.csv"
CAMPS = ["marca", "nom", "adreca", "municipi", "estat", "lat", "lon", "font_coord",
         "adreca_trobada", "tipus_font", "font_url", "data_consulta", "notes"]
NAVEGADOR = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
PAUSA_S = 0.7
SYNERGYM = ARREL / "preparacio/synergym_adreces_2026-11-23.csv"
ICGC = "https://eines.icgc.cat/geocodificador/cerca"

MARQUES = {
    "Basic-Fit": {
        "sitemap": "https://www.basic-fit.com/sitemap-store-es-es-custom-sitemap.xml",
        "patro": r"https://www\.basic-fit\.com/es-es/clubs/[^<]+\.html",
    },
    "Fitness Park": {
        "sitemap": "https://www.fitnesspark.es/sitemap.xml",
        "patro": r"https://www\.fitnesspark\.es/club/[a-z0-9-]+/",  # minúscules: hi ha duplicats amb majúscules
    },
}


def descarrega(url):
    peticio = urllib.request.Request(url, headers={"User-Agent": NAVEGADOR})
    with urllib.request.urlopen(peticio, timeout=60) as resposta:
        return resposta.read().decode("utf-8", errors="ignore")


def pagina(marca, url):
    """Pàgina d'un club: del disc si ja s'ha desat; si no, es descarrega i es desa."""
    nom = re.sub(r"[^a-z0-9-]+", "_", url.split("//")[1].lower()).strip("_") + ".html"
    fitxer = BRUTES / marca / nom
    if not fitxer.exists():
        fitxer.parent.mkdir(parents=True, exist_ok=True)
        fitxer.write_text(descarrega(url), encoding="utf-8")
        time.sleep(PAUSA_S)
    return fitxer.read_text(encoding="utf-8")


def gimnas(html):
    """Primer bloc JSON-LD de tipus ExerciseGym o HealthClub, o None."""
    for bloc in re.findall(r"<script[^>]*ld\+json[^>]*>(.*?)</script>", html, re.S):
        try:
            dades = json.loads(bloc)
        except json.JSONDecodeError:
            continue
        for d in dades if isinstance(dades, list) else [dades]:
            if d.get("@type") in ("ExerciseGym", "HealthClub"):
                return d
    return None


def geocodifica(adreca, municipi):
    """(lat, lon, etiqueta) del primer resultat de l'ICGC, o (None, None, '')."""
    params = urllib.parse.urlencode({"text": f"{adreca}, {municipi}", "size": 1})
    peticio = urllib.request.Request(f"{ICGC}?{params}", headers={"User-Agent": "smartxpand-hero/0.1"})
    with urllib.request.urlopen(peticio, timeout=30) as resposta:
        resultat = json.load(resposta)
    if not resultat.get("features"):
        return None, None, ""
    f = resultat["features"][0]
    lon, lat = f["geometry"]["coordinates"]
    return lat, lon, f["properties"].get("etiqueta", "")


def nom_club(marca, nom):
    """'Gimnasio Carrer de Moli de la Torre 24/7 Badalona' → 'Basic-Fit Carrer de Moli de la Torre 24/7 Badalona'."""
    if marca == "Basic-Fit":
        return "Basic-Fit " + re.sub(r"^Gimnasio\s+", "", nom)
    return nom


def estat(marca, html):
    if marca == "Fitness Park" and re.search(r'schedule-label">\s*Próxima apertura', html):
        return "previst"
    return "obert"


clubs = []
for marca, cfg in MARQUES.items():
    urls = sorted(set(re.findall(cfg["patro"], descarrega(cfg["sitemap"]))))
    print(f"{marca}: {len(urls)} pàgines de club al sitemap")
    for url in urls:
        html = pagina(marca, url)
        d = gimnas(html)
        if not d:
            continue
        adr, geo = d.get("address", {}), d.get("geo", {})
        if not str(adr.get("postalCode", "")).startswith("08"):
            continue
        clubs.append({
            "marca": marca, "nom": nom_club(marca, d.get("name", "")),
            "adreca": adr.get("streetAddress", "").strip(" ,"), "municipi": adr.get("addressLocality", ""),
            "estat": estat(marca, html), "lat": geo.get("latitude"), "lon": geo.get("longitude"),
            "font_coord": "web oficial (JSON-LD)", "adreca_trobada": "", "tipus_font": "oficial",
            "font_url": url, "data_consulta": DATA, "notes": "",
        })

# Synergym: adreces oficials geocodificades amb l'ICGC
with open(SYNERGYM, encoding="utf-8") as f:
    for fila in csv.DictReader(f):
        lat, lon, etiqueta = geocodifica(fila["adreca"], fila["municipi"])
        clubs.append({
            "marca": "Synergym", "nom": fila["nom"], "adreca": fila["adreca"], "municipi": fila["municipi"],
            "estat": fila["estat"], "lat": lat, "lon": lon, "font_coord": "geocodificador ICGC",
            "adreca_trobada": etiqueta, "tipus_font": "oficial", "font_url": fila["font_url"],
            "data_consulta": DATA, "notes": fila["notes"],
        })
        time.sleep(0.3)

with open(SORTIDA, "w", encoding="utf-8", newline="") as f:
    escriptor = csv.DictWriter(f, fieldnames=CAMPS)
    escriptor.writeheader()
    escriptor.writerows(clubs)

for c in clubs:
    print(f"{c['marca']:12} | {c['estat']:7} | {c['municipi'][:22]:22} | {c['nom'][:45]:45} | {c['adreca_trobada'][:40]}")
print(f"\nClubs a la província de Barcelona: {len(clubs)} · desat a {SORTIDA.relative_to(ARREL)}")
