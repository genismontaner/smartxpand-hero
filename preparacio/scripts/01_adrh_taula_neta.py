"""
Pas 1 · Converteix les taules de l'ADRH (INE) en una taula neta:
una fila per secció censal amb renda i indicadors demogràfics.

Ús (des de l'arrel del projecte):
    python3 preparacio/scripts/01_adrh_taula_neta.py

Per a una altra ciutat o any, canvia ANY i PROVINCIA i descarrega
les taules equivalents de l'INE (una per província).
"""
import csv
from pathlib import Path

# Paràmetres
ANY = "2024"
PROVINCIA = "08"  # codi INE de la província (08 = Barcelona)

ARREL = Path(__file__).resolve().parents[2]
ENTRADA = ARREL / "preparacio/dades_brutes/ine_adrh_2024"
RENDA_CSV = ENTRADA / "30896_renda.csv"
DEMO_CSV = ENTRADA / "30904_demografia.csv"
SORTIDA = ARREL / f"preparacio/dades_intermedies/adrh_{ANY}_seccions_p{PROVINCIA}.csv"

# Indicadors que ens interessen i el nom curt que els donem
INDICADORS = {
    "Renta neta media por persona": "renda_persona",
    "Población": "poblacio",
    "Porcentaje de población menor de 18 años": "pct_menors18",
    "Porcentaje de población de 65 y más años": "pct_65mes",
}


def a_numero(text):
    """Passa '13.210' o '42,2' a número. Buit o '.' → None (dada no disponible)."""
    text = text.strip()
    if text in ("", ".", ".."):
        return None
    return float(text.replace(".", "").replace(",", "."))


def llegeix(fitxer, seccions):
    """Afegeix al diccionari 'seccions' els indicadors de l'any triat."""
    with open(fitxer, encoding="utf-8-sig", newline="") as f:
        for fila in csv.reader(f, delimiter=";"):
            municipi, _, seccio, indicador, periode, valor = fila
            # Només files de secció (no municipi ni districte), de l'any i província triats
            if not seccio or periode != ANY or not seccio.startswith(PROVINCIA):
                continue
            if indicador not in INDICADORS:
                continue
            cusec = seccio[:10]  # el codi és els 10 primers caràcters
            fila_seccio = seccions.setdefault(cusec, {"cusec": cusec, "municipi": municipi[6:]})
            fila_seccio[INDICADORS[indicador]] = a_numero(valor)


seccions = {}
llegeix(RENDA_CSV, seccions)
llegeix(DEMO_CSV, seccions)

# Població de 18 a 64 anys = població × (100 − % menors de 18 − % de 65 i més) / 100
for s in seccions.values():
    pob, m18, m65 = s.get("poblacio"), s.get("pct_menors18"), s.get("pct_65mes")
    s["pob_18_64"] = round(pob * (100 - m18 - m65) / 100) if None not in (pob, m18, m65) else None

camps = ["cusec", "municipi", "renda_persona", "poblacio", "pct_menors18", "pct_65mes", "pob_18_64"]
SORTIDA.parent.mkdir(parents=True, exist_ok=True)
with open(SORTIDA, "w", encoding="utf-8", newline="") as f:
    escriptor = csv.DictWriter(f, fieldnames=camps)
    escriptor.writeheader()
    for cusec in sorted(seccions):
        escriptor.writerow({c: seccions[cusec].get(c) for c in camps})

# Fitxer .csvt: diu a QGIS el tipus de cada columna
# (sense ell, el codi de secció es llegiria com a número i perdria el zero inicial)
tipus = ['"String"', '"String"', '"Real"', '"Real"', '"Real"', '"Real"', '"Integer"']
SORTIDA.with_suffix(".csvt").write_text(",".join(tipus) + "\n", encoding="utf-8")

# Resum per comprovar que tot ha anat bé
sense_renda = sum(1 for s in seccions.values() if s.get("renda_persona") is None)
sense_edat = sum(1 for s in seccions.values() if s.get("pob_18_64") is None)
print(f"Seccions: {len(seccions)} · sense renda: {sense_renda} · sense 18-64: {sense_edat}")
print(f"Desat a: {SORTIDA.relative_to(ARREL)}")
