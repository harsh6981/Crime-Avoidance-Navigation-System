import MapComponent from "./MapComponent";

export default function MapView({
  routes, activeRoute, mapError,
  showCrimeZones, showStreetLighting, showTrafficDensity,
  onRouteResources, showEVChargers, showPolice, showHospitals, onMapClick,
  navigating, onStartTrip, followPos,
}) {
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <MapComponent
        safestCoords={routes?.safest_route?.path || []}
        fastestCoords={routes?.fastest_route?.path || []}
        alternativeCoords={routes?.alternative_route?.path || []}
        activeRoute={activeRoute}
        error={mapError}
        showCrimeZones={showCrimeZones}
        showStreetLighting={showStreetLighting}
        showTrafficDensity={showTrafficDensity}
        onRouteResources={onRouteResources}
        showEVChargers={showEVChargers}
        showPolice={showPolice}
        showHospitals={showHospitals}
        onMapClick={onMapClick}
        navigating={navigating}
        onStartTrip={onStartTrip}
        followPos={followPos}
      />
    </div>
  );
}