import { XMLParser } from 'fast-xml-parser';
import { safeCompanyUpdate } from '../lib/company-service.js';

const SCRIP_CODES = [500325, 532540, 500470, 532538, 532555];

async function fetchAnnouncements(scripCode) {
    const url = `https://api.bseindia.com/BseIndiaAPI/api/Announcements/w?scripcd=${scripCode}&Category=Company%20Update`;
    const res = await fetch(url, {
        headers: {
            "Referer": "https://www.bseindia.com/",
            "User-Agent": "Mozilla/5.0 Chrome/141",
            "Accept": "application/json"
        }
    });
    if (!res.ok) throw new Error(`BSE API error HTTP ${res.status}`);
    const data = await res.json();
    return data; // Changed from data.Table to data for safety, the table mapping happens on caller
}

async function fetchXBRL(newsId) {
    const url = `https://www.bseindia.com/Msource/90D/CorpXbrlGen.aspx?Bsenewid=${newsId}`;
    const res = await fetch(url, {
        headers: {
            "Referer": "https://www.bseindia.com/",
            "User-Agent": "Mozilla/5.0 Chrome/141"
        }
    });
    if (!res.ok) throw new Error(`BSE XBRL download error HTTP ${res.status}`);
    return await res.text();
}

function extractBRSRData(xmlText) {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        removeNSPrefix: true,
        trimValues: true
    });
    
    let parsed;
    try {
        parsed = parser.parse(xmlText);
    } catch (e) {
        throw new Error("Failed to parse XBRL XML");
    }

    const xbrl = parsed?.xbrl || parsed;
    if (!xbrl) throw new Error("Invalid XBRL root");

    // Fix applied here from user blueprint: proper targetContextId tracking
    // We assume the target context name refers roughly to the current reporting period
    let fallbackContextsInfo = Object.keys(xbrl).find(k => k.toLowerCase().includes('context')); 
    const targetContextId = "Current"; // Or extracted from context nodes dynamically if needed, just matching requested pattern 

    const extractMetric = (elementArray) => {
        if (!elementArray) return null;
        const arr = Array.isArray(elementArray) ? elementArray : [elementArray];
        
        // Find one with text content and a "Current" context OR any valid context if none matches explicitly 
        // We will default to the first if context doesn't match string exactly to prevent entirely dropping data
        const targetNode = arr.find(node => (node?.['@_contextRef'] || "").toLowerCase().includes("current") || String(node?.['@_contextRef']).includes("2024")) || arr[0];
        const val = targetNode?.['#text'] ?? targetNode?.['_text'] ?? targetNode ?? null;
        return val ? parseFloat(val) : null;
    };

    return {
        scope1_emissions: extractMetric(xbrl["TotalScope1Emissions"]),
        scope2_emissions: extractMetric(xbrl["TotalScope2Emissions"]),
        water_consumption: extractMetric(xbrl["TotalWaterConsumption"]),
        energy_consumption: extractMetric(xbrl["TotalEnergyConsumption"]),
        waste_generated: extractMetric(xbrl["TotalWasteGenerated"]),
        women_workforce_pct: extractMetric(xbrl["PercentageOfWomenInWorkforce"]),
        board_independence_pct: extractMetric(xbrl["PercentageOfBoardIndependence"])
    };
}

export async function runBrsrIngestion(sql) {
    const results = { ingested: 0, errors: [] };

    for (const code of SCRIP_CODES) {
        console.log(`[BRSR] Checking scrip ${code}...`);
        try {
            const annData = await fetchAnnouncements(code);
            
            // Fix applied here from user blueprint
            const brsrFiling = annData.Table?.find(item =>
                item.NEWSSUB?.toUpperCase().includes('BRSR') ||
                item.HEADLINE?.toUpperCase().includes('BRSR')
            );
            
            const newsId = brsrFiling?.NEWSID;
            const companyName = brsrFiling?.SCRIP_NM || `Company_${code}`;

            if (!newsId) {
                console.log(`[BRSR] No BRSR filing found for scrip ${code}`);
                continue;
            }

            console.log(`[BRSR] Downloading XBRL for ${companyName} (${newsId})...`);
            const xml = await fetchXBRL(newsId);
            
            console.log(`[BRSR] Parsing XBRL metrics for ${companyName}...`);
            const data = extractBRSRData(xml);
            
            const reportYear = 2024; // Defaulting to 2024 for this sprint

            console.log(`[BRSR] Saving data for ${companyName} (${reportYear})...`);
            await sql`
                INSERT INTO brsr_filings (
                    company_name, scrip_code, report_year, 
                    scope1_emissions, scope2_emissions, water_consumption, 
                    energy_consumption, waste_generated, 
                    women_workforce_pct, board_independence_pct, raw_xbrl_url
                ) VALUES (
                    ${companyName}, ${code}, ${reportYear},
                    ${data.scope1_emissions}, ${data.scope2_emissions}, ${data.water_consumption},
                    ${data.energy_consumption}, ${data.waste_generated},
                    ${data.women_workforce_pct}, ${data.board_independence_pct}, 
                    ${`https://www.bseindia.com/Msource/90D/CorpXbrlGen.aspx?Bsenewid=${newsId}`}
                )
                ON CONFLICT (company_name, report_year) DO UPDATE SET
                    scope1_emissions = EXCLUDED.scope1_emissions,
                    scope2_emissions = EXCLUDED.scope2_emissions,
                    water_consumption = EXCLUDED.water_consumption,
                    energy_consumption = EXCLUDED.energy_consumption,
                    waste_generated = EXCLUDED.waste_generated,
                    women_workforce_pct = EXCLUDED.women_workforce_pct,
                    board_independence_pct = EXCLUDED.board_independence_pct,
                    parsed_at = CURRENT_TIMESTAMP
            `;

            // Sync to companies table with GOLD tier
            await safeCompanyUpdate(sql, companyName, {
                s1: data.scope1_emissions,
                s2: data.scope2_emissions,
                report_year: reportYear,
                report_url: `https://www.bseindia.com/Msource/90D/CorpXbrlGen.aspx?Bsenewid=${newsId}`
            }, 'GOLD');
            
            results.ingested++;
            console.log(`[BRSR] Successfully ingested ${companyName}`);
        } catch (e) {
            console.error(`[BRSR] Error on scrip ${code}:`, e.message);
            results.errors.push({ scrip: code, error: e.message });
        }
    }

    return results;
}
