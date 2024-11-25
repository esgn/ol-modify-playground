import Map from 'ol/Map.js';
import View from 'ol/View.js';
import {Circle as CircleStyle, Fill, Stroke, Style} from 'ol/style.js';
import {Draw, Modify, Translate} from 'ol/interaction.js';
import {MultiPoint, Point} from 'ol/geom.js';
import {OSM, Vector as VectorSource} from 'ol/source.js';
import {Tile as TileLayer, Vector as VectorLayer} from 'ol/layer.js';
import {getCenter, getHeight, getWidth} from 'ol/extent.js';
import {
  never,
  platformModifierKeyOnly,
  primaryAction,
} from 'ol/events/condition.js';

const raster = new TileLayer({
  source: new OSM(),
});

const source = new VectorSource();

// Definition du style de représentation.
// Feinte : Si modifyGeometry est présente sur la feature c'est elle qui est retournée plutôt que la géométrie.
const style = new Style({
  geometry: function (feature) {
    const modifyGeometry = feature.get('modifyGeometry');
    return modifyGeometry ? modifyGeometry.geometry : feature.getGeometry();
  },
  fill: new Fill({
    color: 'rgba(255, 255, 255, 0.2)',
  }),
  stroke: new Stroke({
    color: '#ffcc33',
    width: 2,
  }),
  image: new CircleStyle({
    radius: 7,
    fill: new Fill({
      color: '#ffcc33',
    }),
  }),
});

function calculateCenter(geometry) {

  let center, coordinates, minRadius;

  const type = geometry.getType();

  // calcul du centre d'un polygone
  if (type === 'Polygon') {
    let x = 0;
    let y = 0;
    let i = 0;
    coordinates = geometry.getCoordinates()[0].slice(1);
    coordinates.forEach(function (coordinate) {
      x += coordinate[0];
      y += coordinate[1];
      i++;
    });
    center = [x / i, y / i];
  } else if (type === 'LineString') { // calcul du centre d'une linestring
    center = geometry.getCoordinateAt(0.5);
    coordinates = geometry.getCoordinates();
  } else { // calcul du centre de la bounding box pour le reste
    center = getCenter(geometry.getExtent());
  }

  // calcul de sqDistances et minRadius
  // sqDistances : distance au centre au carré pour chaque point
  // minRadius : distance euclidienne du centre au point le plus éloigné du centre divisée par 3. Pourquoi 3 ?
  let sqDistances;
  if (coordinates) {
    sqDistances = coordinates.map(function (coordinate) {
      const dx = coordinate[0] - center[0];
      const dy = coordinate[1] - center[1];
      return dx * dx + dy * dy;
    });
    minRadius = Math.sqrt(Math.max.apply(Math, sqDistances)) / 3;
  } else {
    minRadius =
      Math.max(
        getWidth(geometry.getExtent()),
        getHeight(geometry.getExtent()),
      ) / 3;
  }
  return {
    center: center,
    coordinates: coordinates,
    minRadius: minRadius,
    sqDistances: sqDistances,
  };
}

const vector = new VectorLayer({
  source: source,
  style: function (feature) {
    const styles = [style];
    // Si on a une modifiyGeometry sur la feature c'est elle qu'on set comme geometry
    const modifyGeometry = feature.get('modifyGeometry');
    const geometry = modifyGeometry
      ? modifyGeometry.geometry
      : feature.getGeometry();
    const result = calculateCenter(geometry);
    const center = result.center;
    if (center) {
      styles.push(
        new Style({
          geometry: new Point(center),
          image: new CircleStyle({
            radius: 4,
            fill: new Fill({
              color: '#ff3333',
            }),
          }),
        }),
      );
      const coordinates = result.coordinates;
      if (coordinates) {
        const minRadius = result.minRadius;
        const sqDistances = result.sqDistances;
        const rsq = minRadius * minRadius;
        const points = coordinates.filter(function (coordinate, index) {
          return sqDistances[index] > rsq;
        });
        styles.push(
          new Style({
            geometry: new MultiPoint(points),
            image: new CircleStyle({
              radius: 4,
              fill: new Fill({
                color: '#33cc33',
              }),
            }),
          }),
        );
      }
    }
    return styles;
  },
});

const map = new Map({
  layers: [raster, vector],
  target: 'map',
  view: new View({
    center: [-11000000, 4600000],
    zoom: 4,
  }),
});

const defaultStyle = new Modify({source: source})
  .getOverlay()
  .getStyleFunction();

const modify = new Modify({
  source: source,
  condition: function (event) {
    return primaryAction(event) && !platformModifierKeyOnly(event);
  },
  deleteCondition: never,
  insertVertexCondition: never,
  style: function (feature) {
    // Pour gérer une feature en mode multigeometry ? 
    feature.get('features').forEach(function (modifyFeature) {

      // on récupère l'objet modifyGeometry
      const modifyGeometry = modifyFeature.get('modifyGeometry');

      // Si modifyGeometry existe c'est à dire si on est passé par modifyStart
      // bref qu'on a commencé à vouloir modifier un objet
      if (modifyGeometry) {
        console.log("Passed feature type is a", feature.getGeometry().getType());
        console.log("modifyGeometry is ", modifyGeometry);
        // On récupère la coordonnées du point à modifier sélectionné par l'utilisateur
        const point = feature.getGeometry().getCoordinates();
        console.log("point is ", point);
        // On récupère la coordonnée originale du point sélectionné par l'utilisateur
        // si elle existe dans l'objet modifyGeometry
        let modifyPoint = modifyGeometry.point;
        console.log("modifyPoint is", modifyPoint);

        // Si modifyPoint n'existe pas c'est à dire si l'utilisateur vient de commencer la modification
        if (!modifyPoint) {
          // On initialise modifyPoint avec le point que l'utilisateur veut modifier
          modifyPoint = point;
          // On set la valeur point de modifyPoint avec modifyPoint
          modifyGeometry.point = modifyPoint;
          // On initialise geometry0 avec geometry
          modifyGeometry.geometry0 = modifyGeometry.geometry;
          // On calcule le centre de geometry0
          const result = calculateCenter(modifyGeometry.geometry0);
          // On définit l'attribut center de modifyGeometry avec le resultat de calculateCenter
          modifyGeometry.center = result.center;
          // On définit l'attribut minRadius de modifyGeometry avec le resultat de calculateCenter
          modifyGeometry.minRadius = result.minRadius;
          console.log("updated modifyGeometry is ", modifyGeometry);
        }

        const center = modifyGeometry.center;
        const minRadius = modifyGeometry.minRadius;

        // calcul de la distance entre le point original sélectionné par l'utilisateur
        // et le centre du polygone
        let dx, dy;
        dx = modifyPoint[0] - center[0];
        dy = modifyPoint[1] - center[1];
        const initialRadius = Math.sqrt(dx * dx + dy * dy);
        console.log("initialRadius", initialRadius)
        console.log("minRadius", minRadius)


        if (initialRadius > minRadius) {
          // on convertit la position originale du point à modifier en r,θ
          const initialAngle = Math.atan2(dy, dx);
          dx = point[0] - center[0];
          dy = point[1] - center[1];
          // on convertit la position courante du point modifié en r,θ
          const currentRadius = Math.sqrt(dx * dx + dy * dy);
          // On scale et rotate la géométrie initiale à partir de ces infos
          if (currentRadius > 0) {
            const currentAngle = Math.atan2(dy, dx);
            const geometry = modifyGeometry.geometry0.clone();
            geometry.scale(currentRadius / initialRadius, undefined, center);
            geometry.rotate(currentAngle - initialAngle, center);
            modifyGeometry.geometry = geometry;
          }
        }
      }
    });
    return defaultStyle(feature);
  },
});

// https://openlayers.org/en/latest/apidoc/module-ol_interaction_Modify.ModifyEvent.html#event:modifystart 
// Triggered upon feature modification start
modify.on('modifystart', function (event) {
  // On ajoute modifyGeometry a la feature au début de la modification
  // La variable contient la géométrie originale
  event.features.forEach(function (feature) {
    feature.set(
      'modifyGeometry',
      {geometry: feature.getGeometry().clone()},
      true,
    );
  });
});

// https://openlayers.org/en/latest/apidoc/module-ol_interaction_Modify.ModifyEvent.html#event:modifyend 
// Triggered upon feature modification end
modify.on('modifyend', function (event) {
  // On met à jour la géométrie de la feature avec la géométrie finale de modifyGeometry
  // On supprime la variable modifyGeometry de la feature
  event.features.forEach(function (feature) {
    const modifyGeometry = feature.get('modifyGeometry');
    if (modifyGeometry) {
      feature.setGeometry(modifyGeometry.geometry);
      feature.unset('modifyGeometry', true);
    }
  });
});

// on ajoute l'interaction modify a la map
map.addInteraction(modify);

// On ajoute l'interaction Translate
// elle ne sera activée que si la touche CRTL est pressée
map.addInteraction(
  new Translate({
    condition: function (event) {
      return primaryAction(event) && platformModifierKeyOnly(event);
    },
    layers: [vector],
  }),
);

let draw; // global so we can remove it later
// selection du type d'objet à dessiner
const typeSelect = document.getElementById('type');

function addInteractions() {
  draw = new Draw({
    source: source,
    type: typeSelect.value,
  });
  map.addInteraction(draw);
}

/**
 * Handle change event.
 */
typeSelect.onchange = function () {
  map.removeInteraction(draw);
  addInteractions();
};

addInteractions();
