import fs from 'fs';
import RBush from 'rbush';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import bbox from '@turf/bbox';
import * as turfHelpers from '@turf/helpers';

// Initialize a spatial index
export const waterTree = new RBush();
export let isIndexBuilt = false;

// We build pseudo-polygons (bounding boxes ~ 10 degrees wide/tall) around the center points
// to simulate true basin shapes for demonstrating the point-in-polygon pipeline.
export function buildSpatialIndex(basinsArray) {
    if (isIndexBuilt) return;
    
    basinsArray.forEach((b, i) => {
        // Approximate a large bounding box polygon for the basin
        const poly = turfHelpers.polygon([[
            [b.lng - 5, b.lat - 5],
            [b.lng + 5, b.lat - 5],
            [b.lng + 5, b.lat + 5],
            [b.lng - 5, b.lat + 5],
            [b.lng - 5, b.lat - 5]
        ]], { ...b });
        
        const [minX, minY, maxX, maxY] = bbox(poly);
        waterTree.insert({ minX, minY, maxX, maxY, feature: poly, id: i });
    });
    
    isIndexBuilt = true;
    console.log(`[water-stress] RBush spatial index built with ${basinsArray.length} features.`);
}

export function checkWaterStress(lat, lng) {
    if (!isIndexBuilt) return { stress_score: 0, stress_label: 'Low', basin_name: 'None' };

    const pt = turfHelpers.point([lng, lat]); // GeoJSON is [lng, lat]
    
    // Fast bounding box intersection check
    const candidates = waterTree.search({ minX: lng, minY: lat, maxX: lng, maxY: lat });
    
    // Pinpoint precise geometry intersection
    const match = candidates.find(item => booleanPointInPolygon(pt, item.feature));
    
    if (match) {
        return match.feature.properties;
    }
    
    return { stress_score: 0, stress_label: 'Low', basin_name: 'None' };
}
