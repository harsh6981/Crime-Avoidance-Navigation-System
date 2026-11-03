import {
  createElementObject,
  createTileLayerComponent,
  updateGridLayer,
  withPane,
} from "@react-leaflet/core";
import L from "leaflet";
import "@maplibre/maplibre-gl-leaflet";

/**
 * MapLibreTileLayer — drops in place of <TileLayer> but renders
 * crisp Stadia Maps vector tiles via MapLibre GL JS.
 *
 * Based on: https://docs.stadiamaps.com/tutorials/vector-tiles-with-react-leaflet/
 */
export const MapLibreTileLayer = createTileLayerComponent(
  function createTileLayer({ url, attribution, ...options }, context) {
    const layer = L.maplibreGL(
      { style: url, attribution: attribution, noWrap: true },
      withPane(options, context)
    );
    return createElementObject(layer, context);
  },
  function updateTileLayer(layer, props, prevProps) {
    updateGridLayer(layer, props, prevProps);
    const { url, attribution } = props;
    if (url != null && url !== prevProps.url) {
      layer.getMaplibreMap().setStyle(url);
    }
    if (attribution != null && attribution !== prevProps.attribution) {
      layer.options.attribution = attribution;
    }
  }
);
