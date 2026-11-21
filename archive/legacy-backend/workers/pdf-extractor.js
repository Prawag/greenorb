import PDFParser from 'pdf2json';
import fetch from 'node-fetch';
import fs from 'fs';
import { reconstructTableRows } from '../lib/pdf-table-parser.js';
import llmRouter from '../lib/llm-router.js';

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
            
            pdfParser.on("pdfParser_dataReady", async (pdfData) => {
                try {
                    console.log(`[PDF-Extractor] Reconstructing tables for ${pdfUrl}...`);
                    const rows = reconstructTableRows(pdfData.formImage.Pages);
                    const tableText = rows.join('\n');

                    console.log(`[PDF-Extractor] Calling LLM for extraction...`);
                    const systemPrompt = `You are a precision ESG data extractor. Extract the following metrics from the provided BRSR report text. 
The text is reconstructed from a PDF and uses "|" to indicate cell boundaries in tables.
Look specifically for:
1. Total Scope 1 emissions (tCO2e)
2. Total Scope 2 emissions (tCO2e)
3. Total Water Withdrawal (kL)
4. Total Energy Consumption (GJ)
5. Total Waste Generated (metric tonnes)

Return ONLY a JSON object with these keys: 
{
  "scope_1_emissions": number | null,
  "scope_2_emissions": number | null,
  "water_withdrawal_kl": number | null,
  "energy_consumption_gj": number | null,
  "waste_generated_mt": number | null
}`;

                    const userPrompt = `REPORT TEXT:\n${tableText.substring(0, 50000)}`; // Cap context for safety
                    
                    const llmResult = await llmRouter.complete(systemPrompt, userPrompt, 1024);
                    
                    let metrics;
                    try {
                        const jsonStr = llmResult.text.match(/\{[\s\S]*\}/)?.[0] || llmResult.text;
                        metrics = JSON.parse(jsonStr);
                    } catch (e) {
                        console.error("[PDF-Extractor] JSON Parse Error:", e.message, llmResult.text);
                        metrics = {
                            scope_1_emissions: null,
                            scope_2_emissions: null,
                            water_withdrawal_kl: null,
                            energy_consumption_gj: null,
                            waste_generated_mt: null
                        };
                    }

                    resolve(metrics);
                } catch (e) {
                    reject(e);
                }
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
