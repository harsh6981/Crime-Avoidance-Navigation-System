import MapComponent from "./MapComponent";

export default function MapView({
  routes, activeRoute, activeRouteData: propActiveRouteData, mapError,
  showCrimeZones, showCrimeClusters, showStreetLighting, showTrafficDensity,
  showRoadNetwork, showHazards,
  onRouteResources, showEVChargers, showPolice, showHospitals, showSafeHavens = true, onMapClick,
  navigating, onStartTrip, followPos,
  selectedClusterId, onSelectCluster,
  onSelectRoute,
}) {
  const activeRouteData = propActiveRouteData || (routes
    ? (activeRoute === "safest" ? routes.safest_route : routes.fastest_route)
    : null);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <MapComponent
        safestCoords={routes?.safest_route?.path || []}
        fastestCoords={routes?.fastest_route?.path || []}
        routes={routes}
        activeRouteData={activeRouteData}
        activeRoute={activeRoute}
        error={mapError}
        showCrimeZones={showCrimeZones}
        showCrimeClusters={showCrimeClusters !== false}
        showStreetLighting={showStreetLighting}
        showTrafficDensity={showTrafficDensity}
        showRoadNetwork={showRoadNetwork}
        showHazards={showHazards}
        onRouteResources={onRouteResources}
        showEVChargers={showEVChargers}
        showPolice={showPolice}
        showHospitals={showHospitals}
        showSafeHavens={showSafeHavens}
        onMapClick={onMapClick}
        navigating={navigating}
        onStartTrip={onStartTrip}
        followPos={followPos}
        selectedClusterId={selectedClusterId}
        onSelectCluster={onSelectCluster}
        onSelectRoute={onSelectRoute}
      />
    </div>
  );
}
