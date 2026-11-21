import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let gridFactors = null;

try {
    const dataPath = path.join(__dirname, '..', 'data', 'cea-grid-factors.json');
    const fileContents = fs.readFileSync(dataPath, 'utf8');
    gridFactors = JSON.parse(fileContents);
} catch (error) {
    console.warn("Could not load cea-grid-factors.json");
    gridFactors = {};
}

export const getGridFactor = (country, state) => {
    if (country === 'IN' || country === 'India') {
        if (!state) return gridFactors['india_national'];
        
        const southernStates = ['Karnataka', 'Tamil Nadu', 'Kerala', 'Andhra Pradesh', 'Telangana'];
        if (southernStates.includes(state)) {
             return gridFactors['southern_grid'];
        }
        
        const northernStates = ['Delhi', 'Haryana', 'Punjab', 'Rajasthan', 'Uttar Pradesh'];
        if (northernStates.includes(state)) {
             return gridFactors['northern_grid'];
        }
        
        return gridFactors['india_national'];
    }
    
    // Default fallback
    return { tco2_per_mwh: 0.5, source: 'global_average_fallback' };
};
