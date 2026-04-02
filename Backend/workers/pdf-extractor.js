import PDFParser from 'pdf2json';
import fetch from 'node-fetch';
import fs from 'fs';

/**
 * GreenOrb PDF Extractor Worker
 * Connects to BSE endpoints and uses spatial formatting to identify tables.
 */
export async function extractBrsrMetrics(pdfUrl) {
    console.log(`[PDF-Extractor] Fetching ${pdfUrl} ...`);
    
    return new Promise(async (resolve, reject) => {
        try {
            const res = await fetch(pdfUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
                    'Referer': 'https://www.bseindia.com/corporates/ann.html',
                    'Accept': 'application/pdf'
                }
            });
            
            if (!res.ok) throw new Error(`HTTP ${res.status} from BSE`);
            
            const buffer = await res.buffer();
            const pdfParser = new PDFParser();
            
            pdfParser.on("pdfParser_dataError", errData => reject(errData.parserError));
            
            pdfParser.on("pdfParser_dataReady", pdfData => {
                let textElements = [];
                
                // Flatten to purely localized DOM strings
                pdfData.formImage.Pages.forEach(page => {
                    page.Texts.forEach(text => {
                        const str = decodeURIComponent(text.R[0].T);
                        textElements.push({
                            text: str.replace(/%20/g, ' ').trim(),
                            x: text.x, 
                            y: text.y,
                            page: page.Height
                        });
                    });
                });
                
                const metrics = {
                    scope_1_emissions: null,
                    scope_2_emissions: null,
                    water_withdrawal_kl: null,
                    energy_consumption_gj: null,
                    waste_generated_mt: null
                };

                // Spatial matching for Scope 1
                const scope1Label = textElements.find(t => t.text.toLowerCase().includes("scope 1"));
                if (scope1Label) {
                    // Find node on the exact same Y axis, immediately right
                    const valueNodes = textElements.filter(t => Math.abs(t.y - scope1Label.y) < 0.5 && t.x > scope1Label.x);
                    valueNodes.sort((a,b) => a.x - b.x); // closest first
                    if (valueNodes.length > 0) metrics.scope_1_emissions = parseFloat(valueNodes[0].text.replace(/,/g, ''));
                }

                // Spatial matching for Scope 2
                const scope2Label = textElements.find(t => t.text.toLowerCase().includes("scope 2"));
                if (scope2Label) {
                    const valueNodes = textElements.filter(t => Math.abs(t.y - scope2Label.y) < 0.5 && t.x > scope2Label.x);
                    valueNodes.sort((a,b) => a.x - b.x);
                    if (valueNodes.length > 0) metrics.scope_2_emissions = parseFloat(valueNodes[0].text.replace(/,/g, ''));
                }

                resolve(metrics);
            });
            
            pdfParser.parseBuffer(buffer);
        } catch (e) {
            reject(e);
        }
    });
}

// Support CLI test execution
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('pdf-extractor.js')) {
    const url = process.argv[2];
    if (url) {
        extractBrsrMetrics(url)
            .then(res => console.log("Extracted Metrics:", res))
            .catch(err => console.error("Error:", err.message));
    } else {
        console.log("Usage: node pdf-extractor.js [PDF_URL]");
    }
}
