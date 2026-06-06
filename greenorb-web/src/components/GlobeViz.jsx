import React, { useEffect, useRef } from 'react';
import Globe from 'globe.gl';

export default function GlobeViz({ data, onPointClick }) {
  const globeEl = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize Globe
    const globe = Globe()(containerRef.current)
      .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
      .backgroundColor('#09090B') // Canvas Charcoal
      .pointAltitude(d => d.type === 'city' ? 0.05 : Math.max(0.01, Math.min((d.total_emissions || 0) / 2000000, 0.5)))
      .pointColor(d => d.type === 'city' ? '#8B5CF6' : (d.total_emissions > 2000000 ? '#F59E0B' : '#10B981')) // Purple for cities
      .pointRadius(d => d.type === 'city' ? 0.8 : 0.5)
      .pointsData(data)
      .onPointClick(onPointClick)
      .pointLabel(d => {
        if (d.type === 'city') {
          return `
            <div style="background: #18181B; padding: 10px; border-radius: 4px; border: 1px solid rgba(139, 92, 246, 0.5); font-family: 'Outfit', sans-serif;">
              <strong style="color: #8B5CF6">${d.name} (Smart City)</strong><br/>
              <span style="color: #A1A1AA; font-family: 'JetBrains Mono', monospace; font-size: 12px;">AQI: ${d.aqi} | Energy: ${d.energy_consumption_mwh} MWh</span>
            </div>
          `;
        }
        return `
          <div style="background: #18181B; padding: 10px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); font-family: 'Outfit', sans-serif;">
            <strong>${d.name}</strong><br/>
            <span style="color: #A1A1AA; font-family: 'JetBrains Mono', monospace; font-size: 12px;">Emissions: ${Math.round(d.total_emissions || 0).toLocaleString()} tCO2e</span>
          </div>
        `;
      });

    // Setup auto-rotation
    globe.controls().autoRotate = true;
    globe.controls().autoRotateSpeed = 1.0;
    globe.controls().enableDamping = true;
    globe.controls().dampingFactor = 0.05;

    // Save instance to ref
    globeEl.current = globe;

    // Resize handling
    const handleResize = () => {
      if (containerRef.current && globeEl.current) {
        globeEl.current.width(containerRef.current.clientWidth);
        globeEl.current.height(containerRef.current.clientHeight);
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Initial size
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, []);

  // Update data when it changes
  useEffect(() => {
    if (globeEl.current && data) {
      globeEl.current.pointsData(data);
    }
  }, [data]);

  return <div ref={containerRef} style={{ width: '100%', height: '100vh', cursor: 'grab' }} />;
}
