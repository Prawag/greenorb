import React, { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';

export default function SatelliteMiniMap({ facilities, companyName }) {
  const mapRef = useRef(null);
  const viewerRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current) return;
    
    // Minimal Cesium config to save resources
    const viewer = new Cesium.Viewer(mapRef.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      timeline: false,
      navigationInstructionsInitiallyVisible: false,
      selectionIndicator: false,
      creditContainer: document.createElement('div'), // Hide credits
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
      contextOptions: {
        webgl: {
          preserveDrawingBuffer: true,
          powerPreference: 'low-power' // Save battery/resources for mini-map
        }
      }
    });

    // Dark theme OSM
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(
      new Cesium.OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/'
      })
    );

    viewerRef.current = viewer;

    // Plot facilities
    if (facilities && facilities.length > 0) {
      const pc = new Cesium.PointPrimitiveCollection();
      facilities.forEach(f => {
        pc.add({
          position: Cesium.Cartesian3.fromDegrees(f.lng, f.lat, 10),
          color: Cesium.Color.RED,
          pixelSize: 8,
          id: f
        });
      });
      viewer.scene.primitives.add(pc);

      // Centered flyTo
      const avgLat = facilities.reduce((s, f) => s + f.lat, 0) / facilities.length;
      const avgLng = facilities.reduce((s, f) => s + f.lng, 0) / facilities.length;
      viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(avgLng, avgLat, 5000)
      });
    }

    return () => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        console.log(`[Cesium Cleanup] Destroying viewer for ${companyName}`);
        viewerRef.current.destroy();
      }
    };
  }, [facilities, companyName]);

  return (
    <div 
      ref={mapRef} 
      style={{ 
        width: '100%', 
        height: '240px', 
        borderRadius: '8px', 
        overflow: 'hidden', 
        border: '1px solid var(--bd)',
        marginTop: '12px'
      }} 
    />
  );
}
