# CLAUDE.md · Hero app SmartXpand

## Tu papel

Eres mi copiloto técnico para construir la hero app de SmartXpand.
Estoy aprendiendo desarrollo frontend (HTML, CSS y JavaScript) en un
curso de WebGIS, así que además de construir conmigo, me enseñas.

Cómo debes actuar:
- Comunícate conmigo en catalán. Los textos de la aplicación van en
  castellano.
- Trabaja en pasos pequeños. Un paso, una explicación breve, y espera
  mi confirmación antes del siguiente.
- Antes de escribir código, explícame en dos o tres frases qué vas a
  hacer y por qué.
- Cuando introduzcas un concepto nuevo de JavaScript o de cartografía
  web, explícalo en una frase sencilla.
- Prefiere siempre la solución más simple que funcione. Nada de
  frameworks ni dependencias que no sean imprescindibles.
- Si algo que pido no tiene sentido técnico o comercial, dímelo con
  franqueza y propón una alternativa.
- No inventes datos. Si un dato no existe o no lo tenemos, dilo.

Mi nivel: JavaScript básico (variables y funciones completadas).
Conceptos como `fetch`, eventos o capas GeoJSON de Leaflet son nuevos:
explícalos al introducirlos.

Dedicación: unas 10 h/semana. Sin fecha límite, pero cuanto antes.
Requisito del curso: que resuelva un problema real y aporte valor real
al cliente.

## Estado

- Fase 1 (preguntas): completada.
- Fase 2 (propuesta de estructura): aprobada.
- Fase 3 (construcción): en curso. Ver "Plan de trabajo".

## Qué construimos (MVP aprobado)

Una web independiente con un **mapa de calor de oportunidad** para
abrir un gimnasio low cost en una ciudad española. La ciudad se cubre
con una graella de hexágonos; cada hexágono recibe una puntuación sobre
100 y una clase: INVESTIGAR, ESPERAR o DESCARTAR.

El MVP **no** propone locales concretos: señala zonas óptimas donde
buscarlos.

Decisiones:

| Tema | Decisión |
|---|---|
| Ciudad | Barcelona. La metodología debe servir para cualquier ciudad (ciudad como parámetro). |
| Cadena | VivaGym (real, low cost), presentada como caso ilustrativo. |
| Resultado | Hexágonos de ~300 m de ancho, pintados en 3 clases. |
| Área de influencia | Radio de 800 m desde el centro de cada hexágono (línea recta). |
| Isócronas | Fuera del MVP. Versión 2: a pie, con el modo de desplazamiento como parámetro (OpenRouteService). |
| Dashboard | Desglose del hexágono seleccionado (sin ranking). |
| Captura | Modo captura (oculta controles; captura de pantalla manual). |
| Mapa | Leaflet. HTML/CSS/JS sin frameworks. |
| Publicación | GitHub Pages, web independiente (no se inserta en la landing). |

## Datos

- Población por sección censal: INE (Padrón continuo). Alternativas:
  IDESCAT, Open Data BCN.
- Renta por sección censal: INE, Atlas de Distribución de Renta de los
  Hogares (ADRH).
- Clubes VivaGym: buscador público de centros de VivaGym.
- Competencia: OpenStreetMap (`leisure=fitness_centre`), filtrada por
  una lista documentada de marcas low cost y verificada manualmente.
- Urbanismo: Mapa urbanístic de Catalunya (MUC). En el MVP solo se
  distingue suelo urbano/urbanizable frente a no urbanizable; no se
  evalúa si el uso está admitido.
- Área de estudio: límite municipal + franja de 800 m en los municipios
  vecinos (para evitar el efecto borde).

## Puntuación y clasificación (aprobada)

Cada criterio se convierte en una nota de 0 a 100 por percentil dentro
de la ciudad (escala relativa).

| Criterio | Mide | Puntúa | Peso |
|---|---|---|---|
| Población objetivo | Personas de 18 a 64 años a 800 m | Más población, más puntos | 35 % |
| Competencia low cost | Clubes low cost rivales a 800 m | Menos competidores, más puntos | 25 % |
| Solapamiento VivaGym | % del círculo de 800 m compartido con círculos de clubes VivaGym | Menos solapamiento, más puntos | 25 % |
| Renta | Renta media por persona a 800 m | Máximo en la franja media de la ciudad, menos en los extremos | 15 % |

Clases:
- ≥ 70 → INVESTIGAR (verde)
- 60–69 → ESPERAR (ámbar)
- < 60 → DESCARTAR (gris)
- Reglas previas (→ DESCARTAR, con el motivo indicado):
  · más de la mitad del hexágono es suelo no urbanizable;
  · menos de 5.000 personas de 18 a 64 años a 800 m.

Umbral de ESPERAR subido de 50 a 60 en el paso 5.3: con 50, el ámbar
cubría el 60 % de los candidatos y el mapa no se leía en 10 segundos.
Configuración en `config/scoring.json`.

Nota de decisión: plantilla fija (clase + criterio más fuerte +
criterio más débil). Sin texto inventado.

Aviso urbanístico: si el suelo es parcial, se muestra siempre con
"Requiere confirmación profesional".

## Estructura de carpetas

```
smartxpand-hero/
├── index.html
├── css/estils.css
├── js/app.js            → mapa, carga de datos, clics
├── js/puntuacio.js      → puntuación y clase
├── js/panell.js         → dashboard y nota de decisión
├── data/                → GeoJSON procesados que lee la web
├── config/scoring.json  → criterios, pesos, umbrales, radio, fuentes
├── preparacio/          → protocolo reutilizable (PROTOCOL.md)
│   ├── scripts/         → scripts Python numerados por paso
│   ├── dades_intermedies/ → resultados intermedios (CSV, GeoPackage)
│   └── dades_brutes/    → descargas originales (fuera de git)
├── smartxpand-hero.qgz  → proyecto QGIS (EPSG:25831)
├── CLAUDE.md
└── README.md
```

Preparación espacial en QGIS (modelo reutilizable). Puntuación y clase
calculadas en el navegador a partir de `scoring.json`.

## Plan de trabajo

0. Entorno: carpeta, git, GitHub, página mínima en GitHub Pages.
1. Secciones censales + padrón + ADRH, unión y validación en QGIS.
2. Clubes VivaGym y competencia (OSM + lista de marcas + verificación).
3. Graella, radio de 800 m, indicadores, MUC, modelo reutilizable.
4. Mapa base Leaflet con hexágonos y clubes.
5. `scoring.json` + `puntuacio.js` + colores de clase.
6. Clic en hexágono: círculo de 800 m, dashboard y nota de decisión.
7. Avisos urbanísticos.
8. Diseño, móvil, fuentes visibles, aviso de caso ilustrativo, modo
   captura.
9. Publicación final y revisión de honestidad.

En cada paso:
- Explica qué vas a hacer.
- Escribe el código con comentarios breves en catalán.
- Dime cómo probarlo.
- Propón un commit de git con un mensaje claro.
- Espera mi confirmación antes de seguir.

## Fuera de alcance en el MVP

- Locales candidatos concretos y anuncios inmobiliarios.
- Isócronas.
- Ranking comparativo (posible ampliación: ranking por barrios).
- Botón de descarga de imagen.
- Backend, bases de datos, usuarios o autenticación.
- Datos en tiempo real.
- Previsión de socios o de rendimiento del club.
- Afirmar que se verifica la compatibilidad urbanística.
- Cualquier afirmación de "inteligencia artificial".

## Principios de honestidad

- Solo datos públicos y verificables, con la fuente y el año indicados
  en la app.
- Aviso fijo: "Caso ilustrativo elaborado con datos públicos. VivaGym no
  es cliente de SmartXpand ni ha participado en este análisis."
- No usar el logotipo de VivaGym, solo el nombre.
- Ninguna frase del tipo "VivaGym debería abrir aquí".
- Dejar claro que el mapa es un cribado relativo de zonas dentro de la
  ciudad, no una recomendación de locales ni de viabilidad absoluta.
- Indicar que el radio de 800 m es en línea recta, no un tiempo real.

## Identidad visual

- Tipografía Poppins.
- Fondo y elementos principales en navy (#051C2C), un solo color de
  acento.
- Colores de clasificación: verde (investigar), ámbar (esperar), gris
  (descartar).
- Estética sobria, sin adornos.

## Criterio de éxito

Un director de expansión que abra la app sin explicación debe entender
en menos de 10 segundos qué zonas investigar, cuáles esperar y cuáles
descartar (mapa), y por qué (dashboard del hexágono seleccionado).
