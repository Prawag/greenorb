/**
 * getPointStyle(layerId, dataPoint) → { pixelSize, color }
 * Centralized visual encoding for all globe layers.
 */
export function getPointStyle(layerId, point) {
  switch (layerId) {
    case 'companies': {
      const co2 = point.scope_total || point.co2e_mt || 0;
      const esg = point.greendex || 50;
      const pixelSize = Math.max(6, Math.min(20, Math.log(co2 + 1) * 2.5));
      const color = esg >= 70 ? '#00C48C' : esg >= 40 ? '#FFB347' : '#FF5F5F';
      return { pixelSize, color };
    }

    case 'coral_bleaching': {
      const alert = point.alert_level ?? 0;
      const pixelSize = (alert + 1) * 3 + 4;
      const colors = ['#888888', '#FFFF00', '#FFA500', '#FF0000', '#CC00CC'];
      const color = colors[alert] ?? '#888888';
      return { pixelSize, color };
    }

    case 'gpm_precipitation': {
      const cat = point.precip_category || 'none';
      const sizeMap = { none: 4, light: 6, moderate: 10, heavy: 16 };
      const colorMap = { none: '#334455', light: '#88CCFF', moderate: '#4499FF', heavy: '#0044FF' };
      return { pixelSize: sizeMap[cat] ?? 5, color: colorMap[cat] ?? '#4499FF' };
    }

    case 'biodiversity_index': {
      const species = point.species_count || 0;
      const threat = point.threat_index || 0;
      const pixelSize = Math.max(6, Math.log(species + 1) * 3);
      const color = threat > 0.7 ? '#FF5F5F' : threat > 0.4 ? '#FFB347' : '#00C48C';
      return { pixelSize, color };
    }

    case 'satellites':
      return { pixelSize: 4, color: '#FFFFFF' };

    case 'airQuality': {
      const aqi = point.aqi || 0;
      const pixelSize = Math.max(5, (aqi / 60) * 4 + 4);
      const color = aqi <= 50 ? '#00C48C' : aqi <= 100 ? '#FFD700' : aqi <= 150 ? '#FFA500' : '#FF0000';
      return { pixelSize, color };
    }

    case 'earthquakes': {
      const mag = point.mag || point.magnitude || 5;
      const pixelSize = Math.max(6, mag * 2);
      return { pixelSize, color: mag >= 6 ? '#FF0000' : mag >= 4 ? '#FF6600' : '#FFAA00' };
    }

    case 'floods':
      return { pixelSize: 8, color: '#3b82f6' };

    case 'cyclones':
      return { pixelSize: 10, color: '#a855f7' };

    case 'volcanoes':
      return { pixelSize: 9, color: '#f97316' };

    case 'fires': {
      const frp = point.frp || 10;
      return { pixelSize: Math.max(4, frp / 50), color: '#ef4444' };
    }

    case 'ocean_currents':
      return { pixelSize: 4, color: '#06b6d4' };

    case 'forest_loss':
      return { pixelSize: 6, color: '#16a34a' };

    case 'fishing_watch':
      return { pixelSize: 5, color: '#0ea5e9' };

    case 'newsVelocity':
    case 'gdelt':
      return { pixelSize: 6, color: '#f472b6' };

    case 'greenwashVelocity': {
      const gvi = point.gvi || 0;
      const color = gvi > 70 ? '#FF0000' : gvi > 40 ? '#FFB347' : '#00C48C';
      return { pixelSize: 10, color };
    }

    default:
      return { pixelSize: 5, color: '#888888' };
  }
}
