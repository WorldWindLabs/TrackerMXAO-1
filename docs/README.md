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

## Cómo correrlo localmente

* `git clone` o descarga este repositorio como `.zip` y extrae el contenido.
* Descarga e instala [NodeJS](https://nodejs.org/es/download/).
* Abre una terminal y ejecuta `npm install http-server -g` para instalar un servidor de desarrollo.
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

Descarga el TLE de CelesTrak y pega las dos líneas en `tracker.js`. No requiere
modificar más código. Bonus: cambia el ícono y la etiqueta del satélite.

**Lo que vas a aprender:** lectura del formato TLE, cómo se cataloga un objeto
en órbita, qué significa cada parámetro orbital.

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
- Ángulo de incidencia del satélite (off-nadir < 30° para mantener resolución)
- Pronóstico de nubosidad para la hora estimada (vía API meteorológica como
  Open-Meteo o NOAA GFS)
- Ángulo de fase Sol-objeto-sensor (para minimizar especulares)

**Output:** lista priorizada de ventanas de adquisición para los próximos 7 días
sobre un área de interés.

**Lo que vas a aprender:** geometría Sol-Tierra-satélite, integración de datos
externos, lógica de planificación de misión real.

### Investigación — visualización de conjunciones orbitales

Una "conjunción" es una aproximación peligrosa entre dos objetos en órbita. Con
~30,000 objetos catalogados y miles más por debajo del umbral de detección
óptico, las conjunciones son un problema creciente —especialmente para SSO,
donde la densidad de tráfico es alta.

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
(SSA). Es un área de investigación con relevancia creciente para la industria
espacial.

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