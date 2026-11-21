"""
Noms nets dels clubs per a la web. Ho fan servir 07_exportar_web.py i
11_exportar_clubs_segments.py, perquè els noms es netegin en un sol lloc.
"""

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


def nom_net(marca, nom, font_url):
    """Nom curt i net d'un club per mostrar a la web."""
    if marca == "VivaGym":
        clau = font_url.rstrip("/").split("/")[-1]
        nom = f"VivaGym {NOMS_VIVAGYM.get(clau, clau)}"
    return nom.replace("Centre Esportiu Municipal ", "CEM ")
