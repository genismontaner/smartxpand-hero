// =============================================================
// Pas 5.2 · Puntuació sobre 100 i classe de cada hexàgon
// No depèn del mapa: rep les dades i la configuració (scoring.json)
// i afegeix a cada hexàgon les notes, la puntuació i la classe.
// =============================================================

// Percentil d'un valor dins d'una llista (0-100).
// Empats: compten la meitat. Ex.: si el 40 % té menys i el 20 % té el mateix valor → 50.
function percentil(valor, llista) {
  let menors = 0;
  let iguals = 0;
  for (const v of llista) {
    if (v < valor) menors++;
    else if (v === valor) iguals++;
  }
  return ((menors + iguals / 2) / llista.length) * 100;
}

// Converteix el percentil en una nota de 0 a 100 segons el sentit del criteri
function nota(criteri, p) {
  if (criteri.sentit === "mes_es_millor") return p;
  if (criteri.sentit === "menys_es_millor") return 100 - p;

  // "franja_mitjana": 100 punts dins la franja; baixa en línia recta cap als extrems
  const [baix, alt] = criteri.franja_percentils;
  if (p < baix) return (p / baix) * 100;
  if (p > alt) return ((100 - p) / (100 - alt)) * 100;
  return 100;
}

// Retorna la primera regla prèvia que compleix l'hexàgon (o null si cap)
function reglaPrevia(props, regles) {
  for (const r of regles) {
    if (r.valor !== undefined && props[r.camp] === r.valor) return r;
    if (r.minim !== undefined && props[r.camp] < r.minim) return r;
  }
  return null;
}

// Classe segons la puntuació: la primera amb mínim <= puntuació (ordenades de més a menys)
function classePerPuntuacio(puntuacio, classes) {
  return classes.find((c) => puntuacio >= c.minim).id;
}

// Funció principal: afegeix 'puntuacio', 'notes', 'classe' i 'motiu' a cada hexàgon
function calculaPuntuacions(hexagons, config) {
  const candidats = [];

  // 1. Regles prèvies
  for (const hex of hexagons.features) {
    const p = hex.properties;
    const regla = reglaPrevia(p, config.regles_previes);
    if (regla) {
      p.classe = regla.classe;
      p.puntuacio = null;
      p.motiu = regla.motiu;
    } else {
      candidats.push(hex);
    }
  }

  // 2. Llista de valors de cada criteri entre els candidats (per als percentils)
  const valors = {};
  for (const c of config.criteris) {
    valors[c.id] = candidats.map((hex) => hex.properties[c.camp]);
  }

  // 3. Notes, puntuació i classe de cada candidat
  for (const hex of candidats) {
    const p = hex.properties;
    p.notes = {};
    let suma = 0;
    for (const c of config.criteris) {
      const n = nota(c, percentil(p[c.camp], valors[c.id]));
      p.notes[c.id] = Math.round(n);
      suma += n * c.pes;
    }
    p.puntuacio = Math.round(suma / 100);
    p.classe = classePerPuntuacio(p.puntuacio, config.classes);
    p.motiu = null;
  }
}
