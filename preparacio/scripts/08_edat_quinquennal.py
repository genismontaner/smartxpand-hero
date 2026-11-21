"""
Pas 1 (v1) · Població per trams d'edat de 5 anys i secció censal.

Font: INE, Censo Anual de Población, taula 69129 de la província
("Población por sexo y edad (grupos quinquenales)"), per secció censal.
https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/69129.csv

Ús (des de l'arrel del projecte):
    python3 preparacio/scripts/08_edat_quinquennal.py

Per a una altra província, cal la taula equivalent: INEbase → Censo Anual de
Población → Resultados de secciones censales por provincias → la província.
"""
import csv
import re
from pathlib import Path

# Paràmetres
ANY = "2024"  # mateix any que l'ADRH i els contorns de secció (codis coherents)
PROVINCIA = "08"
ARREL = Path(__file__).resolve().parents[2]
ENTRADA = ARREL / f"preparacio/dades_brutes/ine_censo_anual_{ANY}/69129_edat_quinquennal.csv"
SORTIDA = ARREL / f"preparacio/dades_intermedies/censo_edat_{ANY}_seccions_p{PROVINCIA}.csv"

# Trams de sortida: de 0-4 a 80-84 tal qual; de 85 en amunt, junts
TRAMS = [f"e{a:02d}_{a + 4:02d}" for a in range(0, 85, 5)] + ["e85_mes"]


def nom_tram(etiqueta):
    """'De 20 a 24 años' → 'e20_24'; 85 anys o més → 'e85_mes'; 'Todas las edades' → None."""
    numeros = [int(n) for n in re.findall(r"\d+", etiqueta)]
    if not numeros:
        return None
    return "e85_mes" if numeros[0] >= 85 else f"e{numeros[0]:02d}_{numeros[0] + 4:02d}"


def a_numero(text):
    """'1.296' → 1296. Buit → None (secció sense dades)."""
    text = text.strip()
    return int(text.replace(".", "")) if text else None


seccions = {}
with open(ENTRADA, encoding="utf-8-sig", newline="") as f:
    lector = csv.reader(f, delimiter=";")
    next(lector)  # capçalera
    for _, municipi, seccio, sexe, edat, periode, valor in lector:
        # Només files de secció, ambdós sexes i l'any triat
        if not seccio or sexe != "Total" or periode != ANY:
            continue
        cusec = seccio[:10]
        fila = seccions.setdefault(cusec, {"cusec": cusec, "municipi": municipi[6:], "pob_censo": None,
                                           **{t: 0 for t in TRAMS}, "sense_dades": False})
        numero = a_numero(valor)
        if numero is None:
            fila["sense_dades"] = True
            continue
        tram = nom_tram(edat)
        if tram is None:
            fila["pob_censo"] = numero
        else:
            fila[tram] += numero

camps = ["cusec", "municipi", "pob_censo"] + TRAMS
SORTIDA.parent.mkdir(parents=True, exist_ok=True)
with open(SORTIDA, "w", encoding="utf-8", newline="") as f:
    escriptor = csv.DictWriter(f, fieldnames=camps, extrasaction="ignore")
    escriptor.writeheader()
    for cusec in sorted(seccions):
        fila = seccions[cusec]
        if fila["sense_dades"]:
            # Sense dades: es deixen buits (no s'inventa cap valor)
            fila = {**fila, "pob_censo": None, **{t: None for t in TRAMS}}
        escriptor.writerow(fila)

# Tipus de columna per a QGIS (el codi de secció sempre com a text)
tipus = ['"String"', '"String"', '"Integer"'] + ['"Integer"'] * len(TRAMS)
SORTIDA.with_suffix(".csvt").write_text(",".join(tipus) + "\n", encoding="utf-8")

# Comprovació: la suma dels trams ha de ser igual al total de la secció
desquadres = [c for c, s in seccions.items()
              if not s["sense_dades"] and sum(s[t] for t in TRAMS) != s["pob_censo"]]
print(f"Seccions: {len(seccions)} · sense dades: {sum(s['sense_dades'] for s in seccions.values())}"
      f" · trams que no sumen el total: {len(desquadres)}")
print(f"Desat a: {SORTIDA.relative_to(ARREL)}")
