"""
Pas 6.1 (v1) · Isòcrones dels centres propis amb OpenRouteService.

Calcula, una sola vegada, les isòcrones de 5, 10 i 15 minuts a peu i en cotxe
de cada centre propi obert. La web les llegeix de data/ i així el mirroring
no gasta quota d'ORS cada vegada que l'usuari canvia un control.

Ús (des de l'arrel del projecte):
    /usr/bin/python3 preparacio/scripts/12_isocrones_propis.py

Necessita la clau d'ORS a config/ors_clau.txt (fitxer local, fora de git).
Pla gratuït: 20 peticions per minut i 500 isòcrones al dia. Una petició per
centre i mode amb els tres temps: 24 centres × 2 modes = 48 peticions.
"""
import json
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ARREL = Path(__file__).resolve().parents[2]
CLAU = (ARREL / "config/ors_clau.txt").read_text().strip()
CLUBS = ARREL / "data/clubs_segments.geojson"
SORTIDA = ARREL / "data/isocrones_propis.geojson"

MODES = {"a_pie": "foot-walking", "coche": "driving-car"}  # id a la web → perfil d'ORS
MINUTS = [5, 10, 15]
PAUSA_S = 3.5  # 60 / 3,5 ≈ 17 peticions per minut, per sota del límit de 20


def isocrones(lon, lat, perfil):
    """Demana a ORS les isòcrones d'un punt per als tres temps alhora."""
    cos = json.dumps({"locations": [[lon, lat]], "range": [m * 60 for m in MINUTS]}).encode()
    peticio = urllib.request.Request(
        f"https://api.openrouteservice.org/v2/isochrones/{perfil}",
        data=cos,
        headers={"Authorization": CLAU, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(peticio, timeout=60) as resposta:
        return json.load(resposta)


def arrodoneix(coordenades):
    """Coordenades a 5 decimals (≈ 1 m): el fitxer pesa molt menys."""
    if isinstance(coordenades[0], (int, float)):
        return [round(coordenades[0], 5), round(coordenades[1], 5)]
    return [arrodoneix(c) for c in coordenades]


propis = [
    f for f in json.loads(CLUBS.read_text())["features"]
    if f["properties"]["segment"] == "propia" and f["properties"]["estat"] == "obert"
]
print(f"Centres propis oberts: {len(propis)}")

avui = date.today().isoformat()
sortida = []
for i, club in enumerate(propis, 1):
    lon, lat = club["geometry"]["coordinates"]
    nom = club["properties"]["nom"]
    for mode, perfil in MODES.items():
        try:
            resposta = isocrones(lon, lat, perfil)
        except urllib.error.HTTPError as error:
            raise SystemExit(f"Error {error.code} a {nom} ({mode}): {error.read()[:300]}")
        for f in resposta["features"]:
            sortida.append({
                "type": "Feature",
                "properties": {
                    "nom": nom,
                    "lat": lat,
                    "lon": lon,
                    "mode": mode,
                    "minuts": round(f["properties"]["value"] / 60),
                    "data_consulta": avui,
                },
                "geometry": {"type": f["geometry"]["type"],
                             "coordinates": arrodoneix(f["geometry"]["coordinates"])},
            })
        time.sleep(PAUSA_S)
    print(f"  {i:2}/{len(propis)} {nom}")

SORTIDA.write_text(json.dumps({"type": "FeatureCollection", "features": sortida},
                              ensure_ascii=False, separators=(",", ":")))
print(f"Desades {len(sortida)} isòcrones a {SORTIDA.relative_to(ARREL)} "
      f"({SORTIDA.stat().st_size / 1024:.0f} KB)")
