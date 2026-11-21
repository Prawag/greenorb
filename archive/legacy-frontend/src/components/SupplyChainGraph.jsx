import React, { useMemo } from 'react';

/**
 * A force-directed SVG graph for visualizing Supply Chain B2B networks.
 * Uses pure React + SVG (no D3 required for this simplified view).
 */
export default function SupplyChainGraph({ centralCompany, suppliers, buyers }) {
  const nodes = useMemo(() => {
    const list = [{ id: centralCompany, type: 'central', size: 40 }];
    
    suppliers.forEach((s, i) => {
      list.push({ 
        id: s.supplier_name, 
        type: 'supplier', 
        size: Math.min(30, 10 + (s.shipment_count / 10)),
        angle: (i / suppliers.length) * Math.PI, // Top half for suppliers
        radius: 120
      });
    });

    buyers.forEach((b, i) => {
      list.push({ 
        id: b.name, 
        type: 'buyer', 
        size: 30,
        angle: Math.PI + (i / buyers.length) * Math.PI, // Bottom half for buyers
        radius: 120
      });
    });

    return list;
  }, [centralCompany, suppliers, buyers]);

  return (
    <div style={{ width: '100%', height: '300px', background: 'var(--bg2)', borderRadius: '8px', border: '1px solid var(--bd)', position: 'relative', overflow: 'hidden' }}>
      <svg width="100%" height="100%" viewBox="0 0 400 300">
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="5" refY="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 Z" fill="var(--tx3)" />
          </marker>
        </defs>

        {/* Links */}
        {nodes.filter(n => n.type !== 'central').map(n => {
          const x2 = 200 + Math.cos(n.angle) * n.radius;
          const y2 = 150 + Math.sin(n.angle) * n.radius;
          return (
            <line 
              key={`link-${n.id}`}
              x1="200" y1="150" x2={x2} y2={y2} 
              stroke={n.type === 'supplier' ? '#f97316' : '#22c55e'} 
              strokeWidth="1.5" 
              strokeDasharray="4 2"
              opacity="0.6"
            />
          );
        })}

        {/* Nodes */}
        {nodes.map(n => {
          const x = n.type === 'central' ? 200 : 200 + Math.cos(n.angle) * n.radius;
          const y = n.type === 'central' ? 150 : 150 + Math.sin(n.angle) * n.radius;
          
          return (
            <g key={`node-${n.id}`}>
              <circle 
                cx={x} cy={y} r={n.size} 
                fill={n.type === 'central' ? 'var(--ac)' : n.type === 'supplier' ? '#fdba74' : '#86efac'} 
                stroke={n.type === 'central' ? 'white' : 'none'}
                strokeWidth="2"
              />
              <text 
                x={x} y={y + n.size + 12} 
                textAnchor="middle" 
                fontSize="9" 
                fill="var(--tx1)"
                style={{ fontWeight: n.type === 'central' ? 'bold' : 'normal' }}
              >
                {n.id.length > 15 ? n.id.substring(0, 12) + '...' : n.id}
              </text>
            </g>
          );
        })}
      </svg>
      
      <div style={{ position: 'absolute', bottom: '10px', right: '10px', fontSize: '0.7rem', color: 'var(--tx3)' }}>
        <span style={{ marginRight: '8px' }}><span style={{ color: '#f97316' }}>●</span> Suppliers</span>
        <span><span style={{ color: '#22c55e' }}>●</span> Buyers</span>
      </div>
    </div>
  );
}
