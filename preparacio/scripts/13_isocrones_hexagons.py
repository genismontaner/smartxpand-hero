"""
Pas 8.2 (v1) · Isòcrones a peu (5, 10 i 15 min) dels hexàgons del mapa de zones.

Són 1.092 hexàgons (tots menys els de sòl no urbanitzable, que mai es puntuen) i
el pla gratuït d'ORS en permet 500 al dia: l'script es pot interrompre i
reprendre. Cada hexàgon calculat es desa en una línia de
preparacio/dades_intermedies/isocrones_hexagons.jsonl; en tornar-lo a executar,
se salta els que ja hi són. Quan ORS respon "Quota exceeded", s'atura net.

Quan hi ha tots els hexàgons, escriu data/isocrones_hexagons.geojson, que és el
que llegirà la web (abans, la web no ofereix isòcrones al mapa de zones).

Ús (des de l'arrel del projecte), un cop al dia fins que acabi:
    /usr/bin/python3 preparacio/scripts/13_isocrones_hexagons.py
    /usr/bin/python3 preparacio/scripts/13_isocrones_hexagons.py --maxim 100

--maxim: peticions d'aquesta execució (per defecte 480, per deixar marge a la
web en local, que també gasta quota quan s'avalua un local amb isòcrona).
Necessita la clau d'ORS a config/ors_clau.txt (fitxer local, fora de git).
"""
import argparse
import json
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ARREL = Path(__file__).resolve().parents[2]
CLAU = (ARREL / "config/ors_clau.txt").read_text().strip()
HEXAGONS = ARREL / "data/hexagons.geojson"
PROGRES = ARREL / "preparacio/dades_intermedies/isocrones_hexagons.jsonl"
SORTIDA = ARREL / "data/isocrones_hexagons.geojson"

MINUTS = [5, 10, 15]
PAUSA_S = 3.5  # ≈ 17 peticions per minut, per sota del límit de 20


def centre(hexagon):
    """Mitjana dels vèrtexs (el mateix càlcul que centreHexagon a js/descobriment.js)."""
    vertexs = hexagon["geometry"]["coordinates"][0][:-1]
    lon = sum(v[0] for v in vertexs) / len(vertexs)
    lat = sum(v[1] for v in vertexs) / len(vertexs)
    return lon, lat


def isocrones(lon, lat):
    """Demana a ORS les tres isòcrones a peu d'un punt en una sola petició."""
    cos = json.dumps({"locations": [[lon, lat]], "range": [m * 60 for m in MINUTS]}).encode()
    peticio = urllib.request.Request(
        "https://api.openrouteservice.org/v2/isochrones/foot-walking",
        data=cos,
        headers={"Authorization": CLAU, "Content-Type": "application/json"},
    )
    # Si ORS triga massa o la connexió falla, es torna a provar fins a 3 vegades
    # (el 23/11/2026 un temps d'espera va aturar la primera execució)
    for intent in range(1, 4):
        try:
            with urllib.request.urlopen(peticio, timeout=90) as resposta:
                return json.load(resposta)
        except urllib.error.HTTPError:
            raise  # resposta d'ORS (quota, sense carrers...): es tracta a fora
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            if intent == 3:
                raise SystemExit(f"ORS no respon després de 3 intents ({error}). Torna-ho a provar més tard.")
            print(f"  ORS no respon ({error}); nou intent en {30 * intent} s")
            time.sleep(30 * intent)


def arrodoneix(coordenades):
    """Coordenades a 5 decimals (≈ 1 m)."""
    if isinstance(coordenades[0], (int, float)):
        return [round(coordenades[0], 5), round(coordenades[1], 5)]
    return [arrodoneix(c) for c in coordenades]


def llegeix_progres():
    """Hexàgons ja calculats: hex_id → registre."""
    if not PROGRES.exists():
        return {}
    fets = {}
    for linia in PROGRES.read_text().splitlines():
        if linia.strip():
            registre = json.loads(linia)
            fets[registre["hex_id"]] = registre
    return fets


def exporta(fets):
    """Escriu el GeoJSON que llegeix la web: un polígon per hexàgon i temps."""
    features = []
    for registre in fets.values():
        for iso in registre.get("isocrones", []):
            features.append({
                "type": "Feature",
                "properties": {"hex_id": registre["hex_id"], "minuts": iso["minuts"],
                               "data_consulta": registre["data_consulta"]},
                "geometry": iso["geometria"],
            })
    sense = [r["hex_id"] for r in fets.values() if "error" in r]
    SORTIDA.write_text(json.dumps({"type": "FeatureCollection", "sense_isocrona": sense,
                                   "features": features}, separators=(",", ":")))
    print(f"Desades {len(features)} isòcrones a {SORTIDA.relative_to(ARREL)} "
          f"({SORTIDA.stat().st_size / 1024:.0f} KB). Sense isòcrona: {len(sense)}")


parser = argparse.ArgumentParser()
parser.add_argument("--maxim", type=int, default=480)
maxim = parser.parse_args().maxim

objectiu = [h for h in json.loads(HEXAGONS.read_text())["features"]
            if h["properties"]["sol"] != "no_urbanitzable"]
fets = llegeix_progres()
pendents = [h for h in objectiu if h["properties"]["hex_id"] not in fets]
print(f"Hexàgons: {len(objectiu)} · fets: {len(fets)} · pendents: {len(pendents)}")

avui = date.today().isoformat()
fetes_ara = 0
with PROGRES.open("a") as fitxer:
    for hexagon in pendents[:maxim]:
        hex_id = hexagon["properties"]["hex_id"]
        lon, lat = centre(hexagon)
        registre = {"hex_id": hex_id, "lat": round(lat, 6), "lon": round(lon, 6), "data_consulta": avui}
        try:
            resposta = isocrones(lon, lat)
            registre["isocrones"] = [
                {"minuts": round(f["properties"]["value"] / 60),
                 "geometria": {"type": f["geometry"]["type"],
                               "coordinates": arrodoneix(f["geometry"]["coordinates"])}}
                for f in resposta["features"]
            ]
        except urllib.error.HTTPError as error:
            if error.code in (403, 429):  # quota exhaurida: s'atura i es reprèn un altre dia
                print(f"ORS: quota exhaurida ({error.code}). Reprèn-lo demà.")
                break
            if error.code in (400, 404):  # punt sense carrers a prop: es desa i no es repeteix
                registre["error"] = error.code
            else:
                raise SystemExit(f"Error {error.code} a {hex_id}: {error.read()[:300]}")
        fitxer.write(json.dumps(registre, separators=(",", ":")) + "\n")
        fitxer.flush()  # cada hexàgon queda desat encara que l'script s'interrompi
        fets[hex_id] = registre
        fetes_ara += 1
        if fetes_ara % 25 == 0:
            print(f"  {len(fets)}/{len(objectiu)}")
        time.sleep(PAUSA_S)

print(f"Peticions d'aquesta execució: {fetes_ara} · total fets: {len(fets)}/{len(objectiu)}")
if len(fets) >= len(objectiu):
    exporta(fets)
else:
    print("Encara en falten: data/isocrones_hexagons.geojson no s'escriu fins que hi siguin tots.")
