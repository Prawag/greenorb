import WebSocket from 'ws';

const AIS_KEY = process.env.AIS_STREAM_KEY;
const TRACKED_MMSI = new Set(); // populated from company vessel registry or routes

export function startAisTracker(sql) {
  if (!AIS_KEY) {
    console.error('[ais-tracker] AIS_STREAM_KEY not set in Backend/.env');
    return;
  }

  const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

  async function updateVesselPosition(mmsi, lat, lng, sog, name) {
    try {
      await sql`
        INSERT INTO vessel_positions (mmsi, vessel_name, lat, lng, sog_knots, last_seen)
        VALUES (${mmsi}, ${name || 'Unknown'}, ${lat}, ${lng}, ${sog}, CURRENT_TIMESTAMP)
        ON CONFLICT (mmsi) DO UPDATE SET
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          sog_knots = EXCLUDED.sog_knots,
          last_seen = CURRENT_TIMESTAMP
      `;
    } catch (e) {
      console.error(`[ais-tracker] DB update error for MMSI ${mmsi}:`, e.message);
    }
  }

  ws.on('open', () => {
    ws.send(JSON.stringify({
      APIKey: AIS_KEY,
      BoundingBoxes: [
        [[5.0, 60.0], [25.0, 68.0]],   // North Sea / Hamburg / Rotterdam
        [[5.0, 50.0], [25.0, 55.0]],   // English Channel / Antwerp
        [[60.0, 8.0], [80.0, 18.0]],   // Arabian Sea / Indian Ocean exit
        [[68.0, 18.0], [80.0, 25.0]],  // Gulf of Oman / Mundra approach
      ]
    }));
    console.log('[ais-tracker] Connected to AISstream.io');
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.MessageType === 'PositionReport') {
      const { MMSI, Latitude, Longitude, Cog, Sog } = msg.Message.PositionReport;
      const shipName = msg.MetaData?.ShipName || '';
      
      // Update vessel tracking in DB
      updateVesselPosition(MMSI, Latitude, Longitude, Sog, shipName);
    }
  });

  ws.on('close', () => {
    console.log('[ais-tracker] Disconnected. Reconnecting in 30s...');
    setTimeout(() => startAisTracker(sql), 30000);
  });

  ws.on('error', (err) => {
    console.error('[ais-tracker] WS Error:', err.message);
    ws.close();
  });
}
