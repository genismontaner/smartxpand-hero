"""
Pas 8.2 (v1) · Isòcrones a peu (5, 10 i 15 min) dels hexàgons del mapa de zones.

Són 1.092 hexàgons (tots menys els de sòl no urbanitzable, que mai es puntuen).
El panell d'ORS diu 500 isòcrones al dia, però a la pràctica (22 i 23/11/2026)
ORS respon 403 "Quota exceeded" després de 50 peticions correctes al dia. Per
això cada petició porta fins a 5 punts (--grup) i l'script es pot interrompre i
reprendre: cada hexàgon calculat es desa en una línia de
preparacio/dades_intermedies/isocrones_hexagons.jsonl i, en tornar-lo a
executar, se salta els que ja hi són. Amb un 403 o 429, s'atura net.

Si una petició de diversos punts falla (400/404), es repeteixen els seus punts
un per un: així un punt sense carrers a prop no fa perdre els altres. Si tots
surten bé un per un, vol dir que ORS no accepta diversos punts i la resta de
l'execució es fa d'un en un.

Quan hi ha tots els hexàgons, escriu data/isocrones_hexagons.geojson, que és el
que llegeix la web (abans, la web no ofereix isòcrones al mapa de zones).

Ús (des de l'arrel del projecte), un cop al dia fins que acabi:
    /usr/bin/python3 preparacio/scripts/13_isocrones_hexagons.py
    /usr/bin/python3 preparacio/scripts/13_isocrones_hexagons.py --maxim 10 --grup 1

--maxim: peticions d'aquesta execució (per defecte 45: deixa marge per provar
la web en local, que gasta de la mateixa quota). --grup: punts per petició (1–5).
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


class QuotaExhaurida(Exception):
    pass


def centre(hexagon):
    """Mitjana dels vèrtexs (el mateix càlcul que centreHexagon a js/descobriment.js)."""
    vertexs = hexagon["geometry"]["coordinates"][0][:-1]
    lon = sum(v[0] for v in vertexs) / len(vertexs)
    lat = sum(v[1] for v in vertexs) / len(vertexs)
    return lon, lat


def isocrones(punts):
    """Demana a ORS les tres isòcrones a peu de cada punt [(lon, lat), ...] en una sola petició.
    Retorna una llista amb les isòcrones de cada punt, en el mateix ordre."""
    cos = json.dumps({"locations": [list(p) for p in punts], "range": [m * 60 for m in MINUTS]}).encode()
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
                dades = json.load(resposta)
                break
        except urllib.error.HTTPError as error:
            if error.code in (403, 429):
                raise QuotaExhaurida(error.code)
            raise  # resposta d'ORS (p. ex. 400, punt sense carrers): es tracta a fora
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            if intent == 3:
                raise SystemExit(f"ORS no respon després de 3 intents ({error}). Torna-ho a provar més tard.")
            print(f"  ORS no respon ({error}); nou intent en {30 * intent} s")
            time.sleep(30 * intent)

    # Cada polígon porta 'group_index': la posició del punt a 'locations'
    per_punt = [[] for _ in punts]
    for f in dades["features"]:
        per_punt[f["properties"].get("group_index", 0)].append({
            "minuts": round(f["properties"]["value"] / 60),
            "geometria": {"type": f["geometry"]["type"], "coordinates": arrodoneix(f["geometry"]["coordinates"])},
        })
    return per_punt


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
parser.add_argument("--maxim", type=int, default=45)
parser.add_argument("--grup", type=int, default=5, choices=range(1, 6))
arguments = parser.parse_args()
grup = arguments.grup

objectiu = [h for h in json.loads(HEXAGONS.read_text())["features"]
            if h["properties"]["sol"] != "no_urbanitzable"]
fets = llegeix_progres()
pendents = [h for h in objectiu if h["properties"]["hex_id"] not in fets]
print(f"Hexàgons: {len(objectiu)} · fets: {len(fets)} · pendents: {len(pendents)} · {grup} per petició")

avui = date.today().isoformat()
peticions = 0
fitxer = PROGRES.open("a")


def desa(hexagon, isos=None, error=None):
    """Afegeix una línia al fitxer de progrés (queda desada encara que l'script s'interrompi)."""
    lon, lat = centre(hexagon)
    registre = {"hex_id": hexagon["properties"]["hex_id"], "lat": round(lat, 6), "lon": round(lon, 6),
                "data_consulta": avui}
    if error:
        registre["error"] = error
    else:
        registre["isocrones"] = isos
    fitxer.write(json.dumps(registre, separators=(",", ":")) + "\n")
    fitxer.flush()
    fets[registre["hex_id"]] = registre


def demana(hexagons):
    """Una petició per a uns quants hexàgons. Retorna les isòcrones o el codi d'error 400/404."""
    global peticions
    peticions += 1
    try:
        resultat = isocrones([centre(h) for h in hexagons])
    except urllib.error.HTTPError as error:
        if error.code in (400, 404):
            return error.code
        raise SystemExit(f"Error {error.code}: {error.read()[:300]}")
    finally:
        time.sleep(PAUSA_S)
    return resultat


try:
    i = 0
    while i < len(pendents) and peticions < arguments.maxim:
        bloc = pendents[i:i + grup]
        resultat = demana(bloc)
        if isinstance(resultat, list):
            for hexagon, isos in zip(bloc, resultat):
                desa(hexagon, isos=isos)
        elif len(bloc) == 1:
            desa(bloc[0], error=resultat)  # punt sense carrers a prop: no es torna a demanar
        else:
            # El bloc ha fallat: es repeteix punt per punt per saber quin falla
            print(f"  Bloc de {len(bloc)} rebutjat ({resultat}); es repeteix d'un en un")
            errors = 0
            for hexagon in bloc:
                if peticions >= arguments.maxim:
                    break
                sol = demana([hexagon])
                if isinstance(sol, list):
                    desa(hexagon, isos=sol[0])
                else:
                    desa(hexagon, error=sol)
                    errors += 1
            if errors == 0:
                print("  Tots bé d'un en un: ORS no accepta diversos punts. Continuo d'un en un.")
                grup = 1
        i += len(bloc)
        if len(fets) % 25 < len(bloc):
            print(f"  {len(fets)}/{len(objectiu)} · {peticions} peticions")
except QuotaExhaurida as codi:
    print(f"ORS: quota exhaurida ({codi}). Reprèn-lo demà.")
finally:
    fitxer.close()

print(f"Peticions d'aquesta execució: {peticions} · total fets: {len(fets)}/{len(objectiu)}")
if len(fets) >= len(objectiu):
    exporta(fets)
else:
    print("Encara en falten: data/isocrones_hexagons.geojson no s'escriu fins que hi siguin tots.")
