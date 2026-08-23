import MapComponent from "./MapComponent";

export default function MapView({ 
  routes, 
  activeRoute, 
  mapError,
  showCrimeZones,
  showStreetLighting,
  showTrafficDensity,
}) {
  const safestCoords = routes?.safest_route?.path || [];
  const fastestCoords = routes?.fastest_route?.path || [];

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <MapComponent
        safestCoords={safestCoords}
        fastestCoords={fastestCoords}
        activeRoute={activeRoute}
        error={mapError}
        showCrimeZones={showCrimeZones}
        showStreetLighting={showStreetLighting}
        showTrafficDensity={showTrafficDensity}
      />
    </div>
  );
}