import { extractBrsrMetrics } from '../workers/pdf-extractor.js';

/**
 * API Route to trigger PDF extraction for BRSR data.
 * Used by AuditTab to hydrate missing company metrics from BSE filings.
 */
export default function mountBrsrPdf(sql) {
    return async (req, res) => {
        const { pdfUrl, companyName } = req.body;
        
        if (!pdfUrl) {
            return res.status(400).json({ error: "Missing pdfUrl" });
        }

        try {
            const metrics = await extractBrsrMetrics(pdfUrl);
            
            // If companyName is provided, we could optionally update the database here.
            // For now, we return the parsed data to the frontend for verification.
            
            res.json({
                data: metrics,
                source: "BSE PDF Extraction (pdf2json)",
                company: companyName || "Unknown",
                ts: new Date().toISOString()
            });
        } catch (error) {
            console.error("[BRSR-PDF] Extraction Failed:", error.message);
            res.status(500).json({ 
                error: "Extraction failed", 
                details: error.message 
            });
        }
    };
}
