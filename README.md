# Rastreador orbital MXÁO-1

Aplicación web mínima que muestra en tiempo real la posición orbital de MXÁO-1
—el primer satélite de observación de la Tierra de la alcaldía Álvaro Obregón—
junto con su traza orbital pasada y futura y las estaciones terrenas que lo soportan.

Estructura del proyecto:

- Un archivo HTML: `index.html`
- Un archivo en JavaScript: `app.js`
- Un archivo CSS: `style.css`
- Dos bibliotecas externas: `libraries/worldwind.js` y `libraries/satellite.js`


Construido sobre [NASA Web WorldWind](https://github.com/NASAWorldWind/WebWorldWind)
para visualización 3D y [satellite.js](https://github.com/shashwatak/satellite-js)
para propagación orbital. Basado en el [rastreador de la EEI de Yann Voumard](https://github.com/AkeluX).

Tutoriales, ejemplos y documentación de Web WorldWind:
- https://worldwind.arc.nasa.gov/web/get-started
- https://worldwind.arc.nasa.gov/web/tutorials
- https://zglueck.github.io/workshop-demo/
- https://worldwind.arc.nasa.gov/web/examples
- https://worldwind.arc.nasa.gov/autodocs/WebWorldWind/

Este proyecto está escrito en JavaScript ES5 deliberadamente, para mantener consistencia
con la biblioteca Web WorldWind 0.9.0 que también está en ES5. El objetivo es que cualquier
estudiante pueda abrir cualquier archivo del proyecto, incluyendo las dos dependencias en
`libraries/worldwind.js` y `libraries/satellite.js`, y leer código con la misma sintaxis y 
convenciones. Cuando NASA libere una versión ES6/TypeScript estable de WorldWind,
se considerará migrar este proyecto en consecuencia.

**Demo en vivo:** http://mxao-1.surge.sh/
**Licencia:** Apache 2.0

---

## Cómo correrlo localmente

* `git clone` o descarga este repositorio como `.zip` y extrae el contenido.
* Descarga e instala [NodeJS](https://nodejs.org/es/download/).
* Abre una terminal y ejecuta `npm install http-server -g` para instalar un servidor web de desarrollo.
* En la carpeta raíz del proyecto, ejecuta `http-server -o`. Se abrirá el rastreador en tu navegador.

No requiere compilación. No requiere licencias. Todo el stack es open source.

---

## Para quién es este proyecto

Este rastreador es un **punto de entrada educativo** al rastreo orbital y a la
visualización geoespacial 3D. Está pensado para:

- Estudiantes de licenciatura curiosos sobre cómo se rastrean satélites realmente.
- Participantes de hackathons que necesitan una base funcional sobre la cual construir.
- Profesores que buscan ejemplos concretos para clases de mecánica orbital, gráficos 3D,
  o sistemas de información geográfica.
- Cualquiera que quiera entender qué hace MXÁO-1 sobre su ciudad.

El código está escrito para ser **leído**, no solo ejecutado. Si te perdiste en algún
lado, abre un issue.

---

## Fuentes de TLE

El TLE (Two-Line Element set) es un formato compacto desarrollado por NORAD que
describe el estado orbital de un satélite con suficiente información para propagar
su posición durante días con precisión razonable. Es la moneda estándar del rastreo
orbital civil.

**Espacios donde obtener TLEs:**

- **[CelesTrak](https://celestrak.org/NORAD/elements/)** — el repositorio público
  más usado, mantenido por T. S. Kelso desde 1985. Acceso gratuito sin registro.
  Para MXÁO-1: `https://celestrak.org/NORAD/elements/gp.php?CATNR=66771`
- **[Space-Track](https://www.space-track.org/)** — base de datos oficial del 18th
  Space Defense Squadron de Estados Unidos. Requiere cuenta gratuita. Contiene
  TLEs más recientes y de más objetos que CelesTrak.
- **[N2YO](https://www.n2yo.com/)** — agregador con API REST simple. Útil para
  consultas programáticas: `https://www.n2yo.com/satellite/?s=66771&api=1`

**Recomendación operativa:** actualizar el TLE al menos semanalmente. La precisión
del SGP4 degrada con el tiempo desde la "época" del TLE (la fecha y hora a la que
se calcularon los elementos orbitales) — en una semana el error típico es de
varios kilómetros; en un día, de cientos de metros.

---

## Propagación SGP4, paso a paso

SGP4 (Simplified General Perturbations 4) es el algoritmo estándar para propagar
órbitas a partir de un TLE. Fue desarrollado por NORAD en los años 70 y sigue
siendo el estándar de facto cinco décadas después. Por dentro hace lo siguiente:

**1. Parsear las dos líneas del TLE.** Los 138 caracteres de las dos líneas codifican
todo lo necesario para conocer el estado orbital: número de catálogo NORAD,
identificador internacional, época, derivadas del movimiento medio, parámetros de
arrastre atmosférico, inclinación, longitud del nodo ascendente, excentricidad,
argumento del perigeo, anomalía media y movimiento medio.

**2. Calcular el tiempo transcurrido desde la época.** SGP4 propaga desde el
momento en que se midió el estado orbital hasta el momento que te interesa.

**3. Aplicar perturbaciones seculares.** Las perturbaciones "seculares" son las que
crecen linealmente con el tiempo: la Tierra no es una esfera perfecta sino un
oblato achatado (efecto J2), lo cual hace que el nodo ascendente y el argumento
del perigeo precesen. SGP4 calcula estas precesiones analíticamente.

**4. Aplicar perturbaciones periódicas.** Las perturbaciones "periódicas" oscilan
en escalas de tiempo de la órbita misma: el achatamiento terrestre, el arrastre
atmosférico, y para órbitas altas también la presión de radiación solar y la
atracción gravitacional del Sol y la Luna.

**5. Resolver la ecuación de Kepler.** Una vez aplicadas las perturbaciones, queda
una órbita kepleriana modificada. SGP4 resuelve la ecuación de Kepler iterativamente
(método de Newton-Raphson) para obtener la anomalía excéntrica a partir de la media.

**6. Convertir a coordenadas cartesianas ECI.** El resultado es la posición y
velocidad del satélite en el marco inercial centrado en la Tierra (Earth-Centered
Inertial), donde los ejes no rotan con la Tierra.

**7. Rotar de ECI a coordenadas geodésicas.** Para mostrar la posición sobre un
globo, hay que rotar de ECI al marco rotatorio terrestre (ECEF) usando el GMST
(Greenwich Mean Sidereal Time), y luego convertir a latitud, longitud y altitud
sobre el elipsoide WGS84.

En este rastreador, satellite.js hace los pasos 1 al 6, y nosotros hacemos el
paso 7 explícitamente con `satellite.eciToGeodetic()`. Todo el ciclo toma
microsegundos por punto en JavaScript moderno.

**Precisión esperada:** entre 1 y 5 km en posición para TLEs con época reciente
(días). El algoritmo no captura todas las perturbaciones físicas reales (no modela
bien el comportamiento del satélite cuando hace maniobras, por ejemplo), pero para
visualización y planeación general es más que suficiente.

---

## Geometría del satélite y huella del sensor

MXÁO-1 está en órbita solar-síncrona (SSO) a ~521 km de altitud, con inclinación
~97.4° y período ~95 minutos. Esto significa lo siguiente:

- **Pasa sobre cada lugar a la misma hora local.** La SSO mantiene un ángulo
  constante respecto al Sol, lo cual asegura iluminación consistente para
  observación de la Tierra.
- **Cubre todo el planeta cada pocos días.** Con 15 órbitas por día y un swath
  (ancho de barrido) de 14 km, en pocos días pasa sobre cualquier punto entre
  ~82°N y ~82°S.
- **El swath está rotado respecto al norte geográfico.** Esto se debe a la
  combinación de la inclinación orbital (97.4°) y la rotación de la Tierra bajo
  la órbita. En latitudes bajas como CDMX, el swath aparece rotado unos 10-15°
  hacia el este desde la dirección norte.

**El sensor:** cámara multiespectral push-broom que captura simultáneamente 7
bandas (Blue, Green, Red, tres Red Edge, NIR) más una banda pancromática.
Resolución espacial nativa de 1.5 m. El swath nominal es de 14 × 40 km por
adquisición; para Álvaro Obregón (~96 km²) eso significa cobertura completa
en una sola pasada.

Para visualizar la huella del sensor sobre el terreno, propaga el satélite a un
instante dado, calcula el "footprint" como un rectángulo perpendicular a la
dirección de vuelo, y proyecta los cuatro vértices al elipsoide WGS84 considerando
la altitud orbital. Es una de las extensiones intermedias propuestas más abajo.

---

## Ideas de extensión por nivel de dificultad

### Básico — cambiar el satélite

Reemplaza el TLE de MXÁO-1 por el de cualquier otro objeto en órbita: la EEI
(NORAD 25544), el Hubble (NORAD 20580), Starlink-1007 (NORAD 44713), o cualquier
satélite que te interese.

Descarga el TLE de CelesTrak y pega las dos líneas en `app.js`. No requiere
modificar más código. Bonus: cambia el ícono y la etiqueta del satélite.

**Lo que vas a aprender:** lectura del formato TLE, cómo se cataloga un objeto
en órbita, qué significa cada parámetro orbital.

Un momento... ese directorio de `data` ¿Qué contendrá? 🤔

### Intermedio — predicción de pases sobre un punto

Dado un punto en la superficie (por ejemplo, tu casa), calcula cuándo el satélite
va a pasar por encima en las próximas 24 horas. Un "pase" es una ventana durante
la cual el satélite está por encima del horizonte local (típicamente con elevación
mayor a 10° para que no esté obstruido por edificios o relieve).

**Pistas:** para cada minuto de las próximas 24 horas, propaga el satélite,
calcula el ángulo de elevación desde el punto del observador (vector observador-satélite
contra el plano del horizonte local), y registra cuando supere el umbral.

**Bonus:** muestra la trayectoria del pase como línea sobre el cielo (azimut vs
elevación), o sobre el globo desde una vista que siga al observador.

**Lo que vas a aprender:** transformaciones entre marcos de referencia, cálculo
de visibilidad, predicción operativa de oportunidades de comunicación.

### Avanzado — ventanas de adquisición con restricciones

Una "ventana de adquisición" es un momento en el que se pueden tomar imágenes
útiles. No basta con que el satélite pase por encima: también necesitas elevación
solar adecuada (para iluminar la escena), ángulo de incidencia razonable (para
calidad de imagen), y baja probabilidad de nubosidad.

**Restricciones a implementar:**

- Elevación solar mínima (e.g. >30° para minimizar sombras largas)
- Ángulo de incidencia del satélite (off-nadir < 10° para mantener resolución)
- Pronóstico de nubosidad para la hora estimada (vía API meteorológica como
  Open-Meteo o NOAA GFS)
- Ángulo de fase Sol-objeto-sensor (para minimizar especulares)

**Output:** lista priorizada de ventanas de adquisición para los próximos 7 días
sobre un área de interés.

**Lo que vas a aprender:** geometría Sol-Tierra-satélite, integración de datos
externos, lógica de planificación de una misión espacial real de observación terrestre.

### Investigación — visualización de conjunciones orbitales

Una "conjunción" es una aproximación peligrosa entre dos objetos en órbita. Con
~30,000 objetos catalogados y miles más por debajo del umbral de detección
óptico, las conjunciones son un problema creciente —especialmente para órbitas SSO
(síncronas con el Sol), donde la densidad de tráfico es alta.

**Tareas:**

- Cargar TLEs de muchos objetos simultáneamente (CelesTrak tiene catálogos completos:
  `https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle`)
- Propagar todos para una ventana de tiempo (e.g. próximas 48 horas)
- Detectar pares cuya distancia mínima sea menor a un umbral (e.g. 5 km)
- Visualizar las aproximaciones en el globo, con líneas que conecten los objetos
  en el momento de mínima distancia

**Referencia operativa:** los datos de SOCRATES (Satellite Orbital Conjunction
Reports Assessing Threatening Encounters in Space) publicados por CelesTrak
listan las conjunciones detectadas por los algoritmos oficiales. Comparar
con tus detecciones es un buen ejercicio.

**Lo que vas a aprender:** algoritmos espacio-temporales (k-d trees, sweep and prune),
gestión de remoción activa de basura espacial (ADR), conciencia situacional espacial
(SSA). Es un área de investigación con relevancia creciente para el sector espacial.

---

# Rastreador orbital MXÁO-1

Aplicación web mínima que muestra en tiempo real la posición orbital de MXÁO-1
—el primer satélite de observación de la Tierra de la alcaldía Álvaro Obregón—
junto con su traza orbital pasada y futura y las estaciones terrenas que lo soportan.

Construido sobre [NASA Web WorldWind](https://github.com/NASAWorldWind/WebWorldWind)
para visualización 3D y [satellite.js](https://github.com/shashwatak/satellite-js)
para propagación orbital. Basado en el [rastreador de la EEI de Yann Voumard](https://github.com/AkeluX).

**Demo en vivo:** http://mxao-1.surge.sh/
**Licencia:** Apache 2.0

---

## Recursos para empezar con Web WorldWind

- Documentación y tutoriales oficiales: https://worldwind.arc.nasa.gov/web/get-started
- Tutoriales paso a paso: https://worldwind.arc.nasa.gov/web/tutorials
- Workshop interactivo: https://zglueck.github.io/workshop-demo/
- Galería de ejemplos: https://worldwind.arc.nasa.gov/web/examples
- API reference completa: https://worldwind.arc.nasa.gov/autodocs/WebWorldWind/

Este proyecto está escrito en JavaScript ES5 deliberadamente, para mantener
consistencia con la biblioteca Web WorldWind que también está en ES5. El objetivo
es que cualquier estudiante pueda abrir cualquier archivo del proyecto —incluyendo
`libraries/worldwind.js`— y leer código con la misma sintaxis y convenciones.
Cuando WorldWind libere una versión ES6/TypeScript estable, este proyecto será
migrado en consecuencia.

El archivo `libraries/worldwind.js` se incluye **sin minificar** (3.65 MB)
deliberadamente. Es una decisión pedagógica: permite que un estudiante curioso
abra el archivo, lea los comentarios JSDoc, y entienda cómo funciona el motor
por dentro. Una versión minificada de 200 KB sería más eficiente para producción,
pero opaca para aprendizaje. Si vas a poner este código en producción, considera
servir la versión minificada vía CDN.

---

## Cómo correrlo localmente

* `git clone` o descarga este repositorio como `.zip` y extrae el contenido.
* Descarga e instala [NodeJS](https://nodejs.org/es/download/).
* Abre una terminal y ejecuta `npm install http-server -g` para instalar un
  servidor web de desarrollo.
* En la carpeta raíz del proyecto, ejecuta `http-server -o`. Se abrirá el
  rastreador en tu navegador.

No requiere compilación. No requiere licencias. Todo el stack es open source.

---

## Para quién es este proyecto

Este rastreador es un **punto de entrada educativo** al rastreo orbital y a la
visualización geoespacial 3D. Está pensado para:

- Estudiantes de licenciatura curiosos sobre cómo se rastrean satélites realmente.
- Participantes de hackathons que necesitan una base funcional sobre la cual construir.
- Profesores que buscan ejemplos concretos para clases de mecánica orbital, gráficos 3D,
  o sistemas de información geográfica.
- Cualquiera que quiera entender qué hace MXÁO-1 sobre su ciudad.

El código está escrito para ser **leído**, no solo ejecutado. Si te perdiste en algún
lado, abre un issue.

---

## El directorio `data`

Dentro de `data/` encontrarás dos recursos que el rastreador no usa por defecto
pero que están ahí esperando a ser descubiertos:

- **Catálogo de estaciones terrenas:** archivo JSON con cientos de estaciones
  terrenas de todo el mundo —comerciales, gubernamentales, científicas— con sus
  coordenadas, frecuencias soportadas, y operadores. Útil para visualizar la red
  global de seguimiento satelital, calcular ventanas de visibilidad sobre múltiples
  estaciones, o filtrar por capacidades (banda S, banda X, banda Ka).

- **Catálogo Space-Track completo:** ~20,000 objetos en órbita —satélites
  operacionales, satélites derelictos, etapas superiores de cohetes ("spent rocket
  stages"), y debris. Es un snapshot histórico, así que las posiciones específicas
  ya no son operativas, pero **los elementos orbitales fundamentales** (inclinación,
  excentricidad, altitud, tipo de objeto) siguen siendo representativos para
  ~95% de los objetos. El catálogo sirve perfectamente para:
  - Aprendizaje de SGP4 con muchos casos reales.
  - Análisis estadístico de la población orbital (¿cuántos objetos hay en SSO?
    ¿cuál es la distribución de inclinaciones? ¿qué fracción son debris?).
  - Detección de conjunciones históricas y comparación con datos oficiales
    de SOCRATES.
  - Visualización de basura espacial en LEO, MEO, GEO.

Para datos vigentes hoy, descarga TLEs frescos de [CelesTrak](https://celestrak.org/)
o de [Space-Track](https://www.space-track.org/) (cuenta gratuita).

---

## Fuentes de TLE

El TLE (Two-Line Element set) es un formato compacto desarrollado por NORAD que
describe el estado orbital de un satélite con suficiente información para propagar
su posición durante días con precisión razonable. Es la moneda estándar del rastreo
orbital civil.

**Espacios donde obtener TLEs:**

- **[CelesTrak](https://celestrak.org/NORAD/elements/)** — el repositorio público
  más usado, mantenido por T. S. Kelso desde 1985. Acceso gratuito sin registro.
  Para MXÁO-1: `https://celestrak.org/NORAD/elements/gp.php?CATNR=66771`
- **[Space-Track](https://www.space-track.org/)** — base de datos oficial del 18th
  Space Defense Squadron de Estados Unidos. Requiere cuenta gratuita. Contiene
  TLEs más recientes y de más objetos que CelesTrak.
- **[N2YO](https://www.n2yo.com/)** — agregador con API REST simple. Útil para
  consultas programáticas: `https://www.n2yo.com/satellite/?s=66771&api=1`

**Recomendación operativa:** actualizar el TLE al menos semanalmente. La precisión
del SGP4 degrada con el tiempo desde la "época" del TLE (la fecha y hora a la que
se calcularon los elementos orbitales) — en una semana el error típico es de
varios kilómetros; en un día, de cientos de metros.

---

## Propagación SGP4, paso a paso

SGP4 (Simplified General Perturbations 4) es el algoritmo estándar para propagar
órbitas a partir de un TLE. Fue desarrollado por NORAD en los años 70 y sigue
siendo el estándar de facto cinco décadas después. Por dentro hace lo siguiente:

**1. Parsear las dos líneas del TLE.** Los 138 caracteres de las dos líneas codifican
todo lo necesario para conocer el estado orbital: número de catálogo NORAD,
identificador internacional, época, derivadas del movimiento medio, parámetros de
arrastre atmosférico, inclinación, longitud del nodo ascendente, excentricidad,
argumento del perigeo, anomalía media y movimiento medio.

**2. Calcular el tiempo transcurrido desde la época.** SGP4 propaga desde el
momento en que se midió el estado orbital hasta el momento que te interesa.

**3. Aplicar perturbaciones seculares.** Las perturbaciones "seculares" son las que
crecen linealmente con el tiempo: la Tierra no es una esfera perfecta sino un
oblato achatado (efecto J2), lo cual hace que el nodo ascendente y el argumento
del perigeo precesen. SGP4 calcula estas precesiones analíticamente.

**4. Aplicar perturbaciones periódicas.** Las perturbaciones "periódicas" oscilan
en escalas de tiempo de la órbita misma: el achatamiento terrestre, el arrastre
atmosférico, y para órbitas altas también la presión de radiación solar y la
atracción gravitacional del Sol y la Luna.

**5. Resolver la ecuación de Kepler.** Una vez aplicadas las perturbaciones, queda
una órbita kepleriana modificada. SGP4 resuelve la ecuación de Kepler iterativamente
(método de Newton-Raphson) para obtener la anomalía excéntrica a partir de la media.

**6. Convertir a coordenadas cartesianas ECI.** El resultado es la posición y
velocidad del satélite en el marco inercial centrado en la Tierra (Earth-Centered
Inertial), donde los ejes no rotan con la Tierra.

**7. Rotar de ECI a coordenadas geodésicas.** Para mostrar la posición sobre un
globo, hay que rotar de ECI al marco rotatorio terrestre (ECEF) usando el GMST
(Greenwich Mean Sidereal Time), y luego convertir a latitud, longitud y altitud
sobre el elipsoide WGS84.

En este rastreador, satellite.js hace los pasos 1 al 6, y nosotros hacemos el
paso 7 explícitamente con `satellite.eciToGeodetic()`. Todo el ciclo toma
microsegundos por punto en JavaScript moderno.

**Precisión esperada:** entre 1 y 5 km en posición para TLEs con época reciente
(días). El algoritmo no captura todas las perturbaciones físicas reales (no modela
bien el comportamiento del satélite cuando hace maniobras, por ejemplo), pero para
visualización y planeación general es más que suficiente.

---

## Geometría del satélite y huella del sensor

MXÁO-1 está en órbita solar-síncrona (SSO) a ~521 km de altitud, con inclinación
~97.4° y período ~95 minutos. Esto significa lo siguiente:

- **Pasa sobre cada lugar a la misma hora local.** La SSO mantiene un ángulo
  constante respecto al Sol, lo cual asegura iluminación consistente para
  observación de la Tierra.
- **Cubre todo el planeta cada pocos días.** Con 15 órbitas por día y un swath
  (ancho de barrido) de 14 km, en pocos días pasa sobre cualquier punto entre
  ~82°N y ~82°S.
- **El swath está rotado respecto al norte geográfico.** Esto se debe a la
  combinación de la inclinación orbital (97.4°) y la rotación de la Tierra bajo
  la órbita. En latitudes bajas como CDMX, el swath aparece rotado unos 10-15°
  hacia el este desde la dirección norte.

**El sensor:** cámara multiespectral push-broom que captura simultáneamente 7
bandas (Blue, Green, Red, tres Red Edge, NIR) más una banda pancromática.
Resolución espacial nativa de 1.5 m. El swath nominal es de 14 × 40 km por
adquisición; para Álvaro Obregón (~96 km²) eso significa cobertura completa
en una sola pasada.

Para visualizar la huella del sensor sobre el terreno, propaga el satélite a un
instante dado, calcula el "footprint" como un rectángulo perpendicular a la
dirección de vuelo, y proyecta los cuatro vértices al elipsoide WGS84 considerando
la altitud orbital. Es una de las extensiones intermedias propuestas más abajo.

---

## Ideas de extensión por nivel de dificultad

### Básico — cambiar el satélite

Reemplaza el TLE de MXÁO-1 por el de cualquier otro objeto en órbita: la EEI
(NORAD 25544), el Hubble (NORAD 20580), Starlink-1007 (NORAD 44713), o cualquier
satélite que te interese.

Descarga el TLE de CelesTrak y pega las dos líneas en `app.js`. No requiere
modificar más código. Bonus: cambia el ícono y la etiqueta del satélite.

**Lo que vas a aprender:** lectura del formato TLE, cómo se cataloga un objeto
en órbita, qué significa cada parámetro orbital.

**Variante avanzada del mismo reto:** carga un grupo completo de satélites
desde el catálogo en `data/` —por ejemplo, todos los Starlink, o todos los objetos
en SSO— y visualiza la constelación entera simultáneamente. Cuidado con el
rendimiento: propagar 1000 objetos cada segundo puede saturar el navegador;
considera propagar a frecuencia más baja (cada 5-10 segundos) o usar Web Workers.

### Intermedio — predicción de pases sobre un punto

Dado un punto en la superficie (por ejemplo, tu casa), calcula cuándo el satélite
va a pasar por encima en las próximas 24 horas. Un "pase" es una ventana durante
la cual el satélite está por encima del horizonte local (típicamente con elevación
mayor a 10° para que no esté obstruido por edificios o relieve).

**Pistas:** para cada minuto de las próximas 24 horas, propaga el satélite,
calcula el ángulo de elevación desde el punto del observador (vector observador-satélite
contra el plano del horizonte local), y registra cuando supere el umbral.

**Bonus:** muestra la trayectoria del pase como línea sobre el cielo (azimut vs
elevación), o sobre el globo desde una vista que siga al observador. Otra variante
útil: predicción de pases sobre múltiples estaciones terrenas (usa el JSON del
directorio `data/`) y muestra cuál tiene el siguiente pase visible.

**Lo que vas a aprender:** transformaciones entre marcos de referencia, cálculo
de visibilidad, predicción operativa de oportunidades de comunicación.

### Avanzado — ventanas de adquisición con restricciones

Una "ventana de adquisición" es un momento en el que se pueden tomar imágenes
útiles. No basta con que el satélite pase por encima: también necesitas elevación
solar adecuada (para iluminar la escena), ángulo de incidencia razonable (para
calidad de imagen), y baja probabilidad de nubosidad.

**Restricciones a implementar:**

- Elevación solar mínima (e.g. >30° para minimizar sombras largas)
- Ángulo de incidencia del satélite (off-nadir < 10° para mantener resolución)
- Pronóstico de nubosidad para la hora estimada (vía API meteorológica como
  Open-Meteo o NOAA GFS)
- Ángulo de fase Sol-objeto-sensor (para minimizar especulares)

**Output:** lista priorizada de ventanas de adquisición para los próximos 7 días
sobre un área de interés.

**Lo que vas a aprender:** geometría Sol-Tierra-satélite, integración de datos
externos, lógica de planificación de una misión espacial real de observación terrestre.

### Investigación — visualización de conjunciones orbitales

Una "conjunción" es una aproximación peligrosa entre dos objetos en órbita. Con
~30,000 objetos catalogados y miles más por debajo del umbral de detección
óptico, las conjunciones son un problema creciente —especialmente para órbitas SSO
(síncronas con el Sol), donde la densidad de tráfico es alta.

**Tareas:**

- Cargar TLEs de muchos objetos simultáneamente (el catálogo en `data/` es buen
  punto de partida; para datos vigentes hoy usa
  `https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle`)
- Propagar todos para una ventana de tiempo (e.g. próximas 48 horas)
- Detectar pares cuya distancia mínima sea menor a un umbral (e.g. 5 km)
- Visualizar las aproximaciones en el globo, con líneas que conecten los objetos
  en el momento de mínima distancia

**Referencia operativa:** los datos de SOCRATES (Satellite Orbital Conjunction
Reports Assessing Threatening Encounters in Space) publicados por CelesTrak
listan las conjunciones detectadas por los algoritmos oficiales. Comparar
con tus detecciones es un buen ejercicio.

**Lo que vas a aprender:** algoritmos espacio-temporales (k-d trees, sweep and prune),
gestión de remoción activa de basura espacial (ADR), conciencia situacional espacial
(SSA). Es un área de investigación con relevancia creciente para el sector espacial.

---

## Proyecto sucesor — portar a WorldWind Kotlin Multiplatform

Las extensiones anteriores construyen *encima* de este rastreador. Esta sección
es distinta: propone construir un **sucesor** sobre una base tecnológica diferente.

[WorldWind Kotlin](https://github.com/WorldWindEarth/WorldWindKotlin) (WWK) es la
versión más reciente de la familia WorldWind: una biblioteca Kotlin Multiplatform
mantenida por la comunidad —no por NASA— que corre genuinamente en Web (Kotlin/JS),
Android, y JVM de escritorio compartiendo el mismo código fuente. Es Apache 2.0,
recibe actualizaciones constantes, y representa el primer WorldWind que cumple el
sueño original del proyecto: una sola base de código para todas las plataformas.

**El reto:** portar este rastreador a WWK para que MXÁO-1 pueda visualizarse en
escritorio (Linux, Windows, macOS), Android (teléfonos y tablets), y navegador,
desde un solo proyecto.

**El problema interesante:** propagación SGP4 cross-platform. satellite.js es una
biblioteca JavaScript, así que solo funciona en el target Kotlin/JS. Para que el
rastreador sea genuinamente multiplataforma, la propagación orbital debe vivir
en `commonMain`. Hay tres caminos:

- **Camino A (atajo no-multiplataforma):** interop con satellite.js solo en
  Kotlin/JS. Para Android/JVM se queda sin propagación. Útil como primer paso
  pero no es el objetivo final.
- **Camino B (fachada `expect`/`actual`):** declarar una interfaz común
  `expect fun propagate(satrec, time): Position` en `commonMain`, e implementarla
  con satellite.js en JS y con [predict4java](https://github.com/davidmoten/predict4java)
  u otra biblioteca Java en JVM/Android. Es trabajo de encapsulación, no de
  matemática.
- **Camino C (port SGP4 a Kotlin puro):** portar el algoritmo SGP4 al lenguaje
  Kotlin en `commonMain`. SGP4 es matemática pura sin dependencias de sistema,
  así que corre idénticamente en todas las plataformas. Requiere validación
  cuidadosa contra TLEs conocidos para asegurar paridad bit-exacta con los ports
  oficiales. **Este es el camino interesante**: al momento de escribir este README
  no existe biblioteca SGP4 nativa de Kotlin Multiplatform, así que quien lo haga
  primero queda como autor de referencia.

**Recursos útiles para empezar:**

- Repositorio WWK: https://github.com/WorldWindEarth/WorldWindKotlin
- Ejemplos en vivo: https://tutorials.worldwind.earth/
- Comunidad WorldWind Earth: https://github.com/WorldWindEarth
- Tutorial de Kotlin Multiplatform: https://kotlinlang.org/docs/multiplatform.html
- Algoritmo SGP4, paper original de Vallado: https://celestrak.org/publications/AIAA/2006-6753/
- Implementaciones de SGP4 en otros lenguajes para comparar:
  Python (sgp4), JavaScript (satellite.js), Go (akhenakh/sgp4), Java (predict4java).

**Lo que vas a aprender:** Kotlin Multiplatform, expect/actual, interop JS↔Kotlin,
propagación orbital en profundidad, validación numérica cross-platform. Si vas
por el camino C, también ganas: experiencia en port matemático cuidadoso entre
lenguajes, comprensión del paper de Vallado, capacidad de contribuir biblioteca
faltante a un ecosistema activo. Tema de tesis con visibilidad real.

---

## Cómo contribuir

Pull requests bienvenidos. Issues también. Para preguntas conceptuales sobre
mecánica orbital, observación de la Tierra, o WorldWind, abre un issue con el
tag `pregunta` y le entramos.

Si lo usas en un proyecto de tesis, hackathon o curso, me encantaría saberlo
(no es obligatorio, solo curiosidad). Manda un mensaje o abre un issue.

---

## Licencia

Apache License 2.0. Puedes usarlo, modificarlo y redistribuirlo libremente,
incluso para uso comercial. La única obligación es preservar el aviso de licencia
y atribución originales.

---

## Créditos

- Base original: [iss-tracker](https://github.com/AkeluX) de Yann Voumard.
- Motor de visualización: [NASA Web WorldWind](https://github.com/NASAWorldWind/WebWorldWind).
- Propagación orbital: [satellite.js](https://github.com/shashwatak/satellite-js)
  de Shashwat Kandadai et al.
- Datos satelitales: [CelesTrak](https://celestrak.org/) (T. S. Kelso) y
  [Space-Track](https://www.space-track.org/) (18 SDS, US Space Force).
- TLE histórico, época y propagación: NORAD.
- Diseño orbital y operación del satélite MXÁO-1: Macrolab, Nara Space Technologies,
  alcaldía Álvaro Obregón.
