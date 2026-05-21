// Esta es una aplicación web mínima de rastreo satelital construida con Web WorldWind y Satellite.js,
// y basada en el trabajo de Yann Voumard: https://github.com/AkeluX
//
// ¿QUÉ HACE ESTE PROGRAMA?
// Muestra en tiempo real la posición orbital del satélite MXÁO-1 sobre un globo 3D,
// junto con su traza orbital pasada (en rojo) y futura (en verde), y las estaciones
// terrenas que lo soportan operativamente.
//
// ¿CÓMO LO HACE?
// 1. Toma un TLE (Two-Line Element set) que describe el estado orbital del satélite.
// 2. Usa el algoritmo SGP4 (implementado en satellite.js) para propagar la órbita
//    hacia adelante y hacia atrás en el tiempo desde el momento actual.
// 3. Dibuja todo en un globo virtual 3D usando Web WorldWind, que renderiza con WebGL.

// ---------------------------------------------------------------------------
// ACTUALIZACIÓN DE LA INTERFAZ: latitud, longitud y altitud en la pantalla
// ---------------------------------------------------------------------------
// Obtenemos referencias a los elementos del DOM donde se mostrarán los valores
// actuales del satélite. Estos elementos están definidos en el HTML.
var latitudePlaceholder = document.getElementById('latitude');
var longitudePlaceholder = document.getElementById('longitude');
var altitudePlaceholder = document.getElementById('altitude');

// Esta función toma una posición {latitud, longitud, altitud} y la formatea
// para mostrarla al usuario. La altitud se convierte de metros a kilómetros
// con dos decimales, y las coordenadas se formatean como grados-minutos-segundos
// con su correspondiente letra cardinal (N/S, E/W).
function updateLatitudeLongitudeAltitude(position) {
    latitudePlaceholder.textContent = degreesToText(position.latitude, 'NS');
    longitudePlaceholder.textContent = degreesToText(position.longitude, 'EW');
    altitudePlaceholder.textContent = (Math.round(position.altitude / 10) / 100) + "km";
}

// ---------------------------------------------------------------------------
// CAPAS BASE DE WORLDWIND
// ---------------------------------------------------------------------------
// WorldWind organiza el contenido visual en "capas" que se apilan unas sobre otras.
// Aquí preparamos las capas base que dan al globo su apariencia realista:
//   - BMNGOneImageLayer: una sola imagen de baja resolución de toda la Tierra,
//     útil como respaldo y para cuando la conexión es lenta.
//   - BMNGLayer: imágenes Blue Marble Next Generation de mayor resolución
//     servidas por mosaicos (tiles) desde servidores de NASA.
//   - AtmosphereLayer: el halo azulado de la atmósfera y el efecto día/noche.
//   - StarFieldLayer: el campo de estrellas que rodea al globo en el espacio.
var bmngOneImageLayer = new WorldWind.BMNGOneImageLayer();
var bmngLayer = new WorldWind.BMNGLayer();
var atmosphereLayer = new WorldWind.AtmosphereLayer();
var starfieldLayer = new WorldWind.StarFieldLayer();

// ---------------------------------------------------------------------------
// ESTACIONES TERRENAS
// ---------------------------------------------------------------------------
// Estas son las instalaciones que tienen rol operativo respecto a MXÁO-1:
//   - Macrolab: opera el Centro de Monitoreo y Análisis de MXÁO-1 en Santa Fe, CDMX.
//   - SvalSat (Svalbard, Noruega, 78°N) y TrollSat (Antártida, 72°S): estaciones
//     terrenas comerciales de KSAT que reciben datos en banda X de satélites
//     en órbita solar-síncrona como MXÁO-1.
//
// ¿Por qué estaciones polares? Una órbita SSO inclinada ~97° pasa cerca de los
// polos en cada revolución, lo cual permite que las estaciones polares vean al
// satélite ~14 veces por día, contra solo 2-4 veces de estaciones en latitudes medias.
var groundStations = [
    {name: 'Macrolab',  latitude:  19.3631, longitude:  -99.2580},
    {name: 'SvalSat',   latitude:  78.2308, longitude:   15.3897},
    {name: 'TrollSat',  latitude: -72.0117, longitude:    2.5350},
];

// Atributos visuales que se aplican a todos los marcadores (placemarks) de
// estaciones terrenas: imagen del ícono, escala, anclaje (offset) y atributos
// del texto que aparece junto al ícono.
var placemarkAttributes = new WorldWind.PlacemarkAttributes(null);
placemarkAttributes.imageSource = "resources/icons/ground-station.png";
placemarkAttributes.imageScale = 0.5;
placemarkAttributes.imageOffset = new WorldWind.Offset(
    WorldWind.OFFSET_FRACTION, 0.3,
    WorldWind.OFFSET_FRACTION, 0.0);
placemarkAttributes.imageColor = WorldWind.Color.WHITE;
placemarkAttributes.labelAttributes.offset = new WorldWind.Offset(
    WorldWind.OFFSET_FRACTION, 0.5,
    WorldWind.OFFSET_FRACTION, 1.0);
placemarkAttributes.labelAttributes.color = WorldWind.Color.WHITE;

// Capa que contendrá todas las estaciones terrenas. Una capa "Renderable" puede
// contener múltiples objetos visualizables.
var groundStationsLayer = new WorldWind.RenderableLayer("Estaciones Terrenas");

// Recorremos el arreglo de estaciones y creamos un Placemark para cada una.
// La altitud se fija en 1000 m sobre el terreno (RELATIVE_TO_GROUND) para que
// el ícono no quede enterrado en la topografía.
for(var i = 0, len = groundStations.length; i < len; i++) {
    var groundStation = groundStations[i];

    var placemark = new WorldWind.Placemark(new WorldWind.Position(groundStation.latitude,
                                                                   groundStation.longitude,
                                                                   1e3));

    placemark.altitudeMode = WorldWind.RELATIVE_TO_GROUND;
    placemark.label = groundStation.name;
    placemark.attributes = placemarkAttributes;

    groundStationsLayer.addRenderable(placemark);
}

// ---------------------------------------------------------------------------
// PROPAGACIÓN ORBITAL CON SGP4
// ---------------------------------------------------------------------------
// satellite.js (licencia MIT, https://github.com/shashwatak/satellite-js) implementa
// el algoritmo SGP4 (Simplified General Perturbations 4), el estándar de la industria
// para propagar órbitas a partir de un TLE.
//
// Dado un objeto "satrec" (creado a partir de las dos líneas del TLE) y un instante
// de tiempo, esta función calcula la posición del satélite en ese instante y la
// devuelve como un objeto WorldWind.Position con latitud, longitud y altitud.
//
// El proceso es:
//   1. Propagar el TLE al tiempo deseado → posición en coordenadas ECI
//      (Earth-Centered Inertial, marco inercial centrado en la Tierra).
//   2. Calcular el GMST (Greenwich Mean Sidereal Time) para esa fecha y hora.
//   3. Rotar de ECI a coordenadas geodésicas (lat/lon/alt sobre el elipsoide WGS84)
//      usando el GMST. Esta rotación es necesaria porque la Tierra está girando bajo
//      la órbita, y queremos saber sobre qué punto geográfico está el satélite "ahora".
function getPosition(satrec, time) {
    var position_and_velocity = satellite.propagate(satrec,
                                                    time.getUTCFullYear(),
                                                    time.getUTCMonth() + 1,
                                                    time.getUTCDate(),
                                                    time.getUTCHours(),
                                                    time.getUTCMinutes(),
                                                    time.getUTCSeconds());
    var position_eci = position_and_velocity["position"];

    var gmst = satellite.gstime (time.getUTCFullYear(),
                                           time.getUTCMonth() + 1,
                                           time.getUTCDate(),
                                           time.getUTCHours(),
                                           time.getUTCMinutes(),
                                           time.getUTCSeconds());

    var position_gd = satellite.eciToGeodetic (position_eci, gmst);
    var latitude    = satellite.degreesLat(position_gd["latitude"]);
    var longitude   = satellite.degreesLong(position_gd["longitude"]);
    var altitude    = position_gd["height"] * 1000;

    return new WorldWind.Position(latitude, longitude, altitude);
}

// ---------------------------------------------------------------------------
// TLE DE MXÁO-1
// ---------------------------------------------------------------------------
// El TLE (Two-Line Element set) es un formato compacto desarrollado por NORAD
// que describe el estado orbital de un satélite con suficiente información para
// propagar su posición durante días con buena precisión.
//
// La precisión de la propagación SGP4 degrada con el tiempo desde la "época"
// del TLE (la fecha y hora a la que el TLE fue calculado). Para uso operativo
// se recomienda actualizar el TLE al menos semanalmente. Para uso educativo,
// un TLE de varias semanas sigue dando una visualización razonable.
//
// Cómo leer los campos clave de este TLE:
//   - "66771"     = número de catálogo NORAD (identificador único del satélite)
//   - "25276DK"   = designador internacional (lanzamiento 276 de 2025, pieza DK)
//   - "26139..."  = época: día 139 del año 2026 + fracción de día
//   - "97.4241"   = inclinación orbital en grados (cerca de 97° = SSO)
//   - "15.20..."  = mean motion en revoluciones por día (~95 minutos por órbita)
//
// Podemos leer miles de TLEs desde uno de los archivos en la carpeta data,
// pero para este ejemplo educativo usamos solo uno.
var tle_line_1 = '1 66771U 25276DK  26139.45358582  .00003258  00000-0  15274-3 0  9991'
var tle_line_2 = '2 66771  97.4241 213.8051 0001618  42.3630 317.7730 15.20385221 26075'
// Algunas APIs para actualizar los datos de manera procedural:
//  https://www.n2yo.com/satellite/?s=66771&api=1
//  https://celestrak.org/NORAD/elements/gp.php?CATNR=66771

// Convertimos las dos líneas del TLE en un objeto "satrec" que satellite.js
// puede usar para propagar la órbita en cualquier momento futuro o pasado.
var satrec = satellite.twoline2satrec(tle_line_1, tle_line_2);

// ---------------------------------------------------------------------------
// CONSTRUCCIÓN DE LA TRAZA ORBITAL
// ---------------------------------------------------------------------------
// Para dibujar la órbita pasada y futura, propagamos la posición del satélite
// cada minuto desde -98 hasta +98 minutos respecto al momento actual.
// Esto cubre aproximadamente una órbita completa antes y otra después
// (el período orbital de MXÁO-1 es ~95 minutos), suficiente para que el
// usuario vea la traza completa.
var now = new Date();
var pastOrbit = [];
var futureOrbit = [];
var currentPosition = null;
for(var i = -98; i <= 98; i++) {
    var time = new Date(now.getTime() + i*60000);  // i minutos en milisegundos

    var position = getPosition(satrec, time)

    if(i < 0) {
        // Posiciones anteriores al momento actual → traza pasada (roja)
        pastOrbit.push(position);
    } else if(i > 0) {
        // Posiciones posteriores al momento actual → traza futura (verde)
        futureOrbit.push(position);
    } else {
        // i == 0 → posición actual del satélite. La agregamos a ambas trazas
        // para que se unan visualmente sin gap, y la guardamos aparte para
        // mostrar el ícono del satélite.
        currentPosition = new WorldWind.Position(position.latitude,
                                                 position.longitude,
                                                 position.altitude);
        pastOrbit.push(position);
        futureOrbit.push(position);
    }
}

// ---------------------------------------------------------------------------
// VISUALIZACIÓN DE LA TRAZA ORBITAL
// ---------------------------------------------------------------------------
// Atributos visuales para la traza pasada: línea roja con relleno semi-transparente.
var pathAttributes = new WorldWind.ShapeAttributes(null);
pathAttributes.outlineColor = WorldWind.Color.RED;
pathAttributes.interiorColor = new WorldWind.Color(1, 0, 0, 0.5);

// La traza pasada es un objeto Path (camino) que conecta los puntos calculados.
// useSurfaceShapeFor2D = true hace que, cuando el globo está en modo 2D, la
// línea se proyecte sobre la superficie en lugar de "flotar" en altitud.
var pastOrbitPath = new WorldWind.Path(pastOrbit);
pastOrbitPath.useSurfaceShapeFor2D = true;
pastOrbitPath.altitudeMode = WorldWind.RELATIVE_TO_GROUND;
pastOrbitPath.attributes = pathAttributes;

// Atributos para la traza futura: copiamos los anteriores y solo cambiamos
// el color a verde.
var pathAttributes = new WorldWind.ShapeAttributes(pathAttributes);
pathAttributes.outlineColor = WorldWind.Color.GREEN;
pathAttributes.interiorColor = new WorldWind.Color(0, 1, 0, 0.5);

var futureOrbitPath = new WorldWind.Path(futureOrbit);
futureOrbitPath.useSurfaceShapeFor2D = true;
futureOrbitPath.altitudeMode = WorldWind.RELATIVE_TO_GROUND;
futureOrbitPath.attributes = pathAttributes;

// Capa que agrupa ambas trazas (pasada y futura).
var orbitLayer = new WorldWind.RenderableLayer("Órbita");

orbitLayer.addRenderable(pastOrbitPath);
orbitLayer.addRenderable(futureOrbitPath);

// ---------------------------------------------------------------------------
// VISUALIZACIÓN DEL SATÉLITE (ÍCONO QUE SIGUE LA POSICIÓN ACTUAL)
// ---------------------------------------------------------------------------
// Atributos del ícono normal del satélite.
var placemarkAttributes = new WorldWind.PlacemarkAttributes(null);
placemarkAttributes.imageSource = "resources/icons/satellite.png";
placemarkAttributes.imageScale = 1;
placemarkAttributes.imageOffset = new WorldWind.Offset(
    WorldWind.OFFSET_FRACTION, 0.5,
    WorldWind.OFFSET_FRACTION, 0.5);
placemarkAttributes.imageColor = WorldWind.Color.WHITE;
placemarkAttributes.labelAttributes.offset = new WorldWind.Offset(
    WorldWind.OFFSET_FRACTION, 0.5,
    WorldWind.OFFSET_FRACTION, 1.5);
placemarkAttributes.labelAttributes.color = WorldWind.Color.WHITE;

// Atributos del ícono "resaltado" (cuando el usuario pasa el cursor por encima):
// idénticos al normal pero 20% más grandes.
var highlightPlacemarkAttributes = new WorldWind.PlacemarkAttributes(placemarkAttributes);
highlightPlacemarkAttributes.imageScale = 1.2;

var satelliteLayer = new WorldWind.RenderableLayer("Satélite");

// Creamos el placemark en la posición actual y le asignamos los atributos.
// Inicializamos también la interfaz con la posición actual.
var placemark = new WorldWind.Placemark(currentPosition);
updateLatitudeLongitudeAltitude(currentPosition);

placemark.altitudeMode = WorldWind.RELATIVE_TO_GROUND;
placemark.label = "MXAO-1";
placemark.attributes = placemarkAttributes;
placemark.highlightAttributes = highlightPlacemarkAttributes;

satelliteLayer.addRenderable(placemark);

// ---------------------------------------------------------------------------
// CONFIGURACIÓN DE LA VENTANA PRINCIPAL DE WORLDWIND
// ---------------------------------------------------------------------------
// "wwd" es el contenedor 3D principal. Le decimos qué fondo usar (transparente)
// y le pegamos todas las capas en el orden en que queremos que se rendericen
// (las primeras se dibujan al fondo, las últimas al frente).
var wwd = new WorldWind.WorldWindow("wwd");
wwd.drawContext.clearColor = WorldWind.Color.colorFromBytes(0,0,0,0);
wwd.addLayer(bmngOneImageLayer);
wwd.addLayer(bmngLayer);
wwd.addLayer(atmosphereLayer);
wwd.addLayer(starfieldLayer);
wwd.addLayer(groundStationsLayer);
wwd.addLayer(orbitLayer);
wwd.addLayer(satelliteLayer);

// Asignamos la fecha y hora actual a las capas de atmósfera y campo de estrellas
// para que muestren correctamente el lado nocturno de la Tierra y la posición
// de las constelaciones del momento.
starfieldLayer.time = now;
atmosphereLayer.time = now;

// Altitud inicial de la cámara responsive al tamaño de pantalla:
// en pantallas grandes mostramos toda la Tierra (40,000 km), en móviles
// nos acercamos más (10,000 km) para que el satélite se vea sin necesidad
// de hacer zoom adicional.
if (screen.width > 900 ) {
  wwd.navigator.range = 4e7;
} else {
  wwd.navigator.range = 1e7;
}

// Guardamos referencias a los dos modos de globo: 3D (esférico) y 2D (plano,
// proyección equirrectangular). Más adelante el usuario podrá alternar entre
// ambos con un botón.
var globe = wwd.globe;

var map = new WorldWind.Globe2D();
map.projection = new WorldWind.ProjectionEquirectangular();

// Configuramos la cámara inicial para que mire hacia donde está el satélite.
wwd.navigator.lookAtLocation = new WorldWind.Location(currentPosition.latitude,
                                                      currentPosition.longitude);

// Forzamos un redibujado inicial para reflejar todos los cambios anteriores.
wwd.redraw();

// ---------------------------------------------------------------------------
// ACTUALIZACIÓN PERIÓDICA DE LA POSICIÓN DEL SATÉLITE
// ---------------------------------------------------------------------------
// Cada 5 segundos recalculamos la posición actual del satélite y la actualizamos
// tanto en la interfaz como en el ícono sobre el globo. Si el modo "seguir"
// está activado, también movemos la cámara para mantener al satélite centrado.
var follow = false;
window.setInterval(function() {
    var position = getPosition(satrec, new Date());
    currentPosition.latitude = position.latitude;
    currentPosition.longitude = position.longitude;
    currentPosition.altitude = position.altitude;

    updateLatitudeLongitudeAltitude(currentPosition);

    if(follow) {
        toCurrentPosition();
    }

    wwd.redraw();
}, 5000);

// Función auxiliar que centra la cámara sobre la posición actual del satélite
// sin tocar la altitud ni la inclinación de la vista.
function toCurrentPosition() {
    wwd.navigator.lookAtLocation.latitude = currentPosition.latitude;
    wwd.navigator.lookAtLocation.longitude = currentPosition.longitude;
}

// ---------------------------------------------------------------------------
// MODO "SEGUIR SATÉLITE"
// ---------------------------------------------------------------------------
// Cuando el modo "seguir" está activado, la cámara se centra automáticamente
// en el satélite cada 5 segundos, y se desactivan los handlers de pan/drag/tilt
// del usuario (porque cualquier movimiento manual sería sobrescrito por el
// reseteo automático). El usuario sí puede hacer zoom con la rueda del mouse.
//
// Cuando se desactiva, se restauran los handlers originales y la cámara vuelve
// a responder al usuario normalmente.
var emptyFunction = function(e) {};
var regularHandlePanOrDrag = wwd.navigator.handlePanOrDrag;
var regularHandleSecondaryDrag = wwd.navigator.handleSecondaryDrag;
var regularHandleTilt = wwd.navigator.handleTilt;
var followPlaceholder = document.getElementById('follow');
function toggleFollow() {
    follow = !follow;
    if(follow) {
        followPlaceholder.textContent = 'On';
        wwd.navigator.handlePanOrDrag = emptyFunction;
        wwd.navigator.handleSecondaryDrag = emptyFunction;
        wwd.navigator.handleTilt = emptyFunction;
    } else {
        followPlaceholder.textContent = 'Off';
        wwd.navigator.handlePanOrDrag = regularHandlePanOrDrag;
        wwd.navigator.handleSecondaryDrag = regularHandleSecondaryDrag;
        wwd.navigator.handleTilt = regularHandleTilt;
    }
    toCurrentPosition();
    wwd.redraw();
}

// ---------------------------------------------------------------------------
// ALTERNANCIA ENTRE REPRESENTACIÓN 3D Y 2D
// ---------------------------------------------------------------------------
// El globo puede mostrarse como esfera 3D o como mapa plano (proyección
// equirrectangular). Esta función intercambia entre ambos modos. La proyección
// equirrectangular es la más simple: latitud y longitud se mapean linealmente
// a y/x, lo cual deforma fuertemente las regiones polares pero es fácil de leer.
var representationPlaceholder = document.getElementById('representation');
function toggleRepresentation() {
    if(wwd.globe instanceof WorldWind.Globe2D) {
        wwd.globe = globe;
        representationPlaceholder.textContent = '3D';
    } else {
        wwd.globe = map;
        representationPlaceholder.textContent = '2D';
    }

    wwd.redraw();
}

// ---------------------------------------------------------------------------
// AYUDA AL USUARIO
// ---------------------------------------------------------------------------
// Muestra un cuadro de diálogo con instrucciones básicas de uso.
function openHelp() {
    alert("Esta herramienta muestra la ubicación actual del satélite MXÁO-1 y su centro de monitoreo y análisis. También se muestra una órbita en el pasado (roja) y una en el futuro (verde).\n\nRepresentación: 3D o 2D\nSeguir: Activado o Desactivado. Cuando está activado, la posición se bloquea en el satélite, pero aún es posible acercar y alejar la cámara.");
}

// ---------------------------------------------------------------------------
// FORMATEO DE COORDENADAS GEOGRÁFICAS
// ---------------------------------------------------------------------------
// Convierte un valor en grados decimales (e.g. 19.3631) al formato clásico
// de grados-minutos-segundos con letra cardinal (e.g. "19° 21' 47.16\" N").
//
// El parámetro "letters" es una cadena de dos caracteres: el primero se usa
// cuando el valor es positivo (N o E), el segundo cuando es negativo (S o W).
//
// Algoritmo:
//   1. Determinar la letra cardinal según el signo.
//   2. Tomar el valor absoluto.
//   3. La parte entera son los grados.
//   4. La parte fraccional × 60 = minutos. Parte entera de eso = minutos.
//   5. La parte fraccional resultante × 60 = segundos.
function degreesToText(deg, letters) {
    var letter;
    if(deg < 0) {
        letter = letters[1]
    } else {
        letter = letters[0]
    }

    var position = Math.abs(deg);

    var degrees = Math.floor(position);

    position -= degrees;
    position *= 60;

    var minutes = Math.floor(position);

    position -= minutes;
    position *= 60;

    var seconds = Math.floor(position * 100) / 100;

    return degrees + "° " + minutes + "' " + seconds + "\" " + letter;
}