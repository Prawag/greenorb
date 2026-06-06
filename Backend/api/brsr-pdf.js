import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import fetch from 'node-fetch';

/**
 * API Route to trigger PDF extraction for BRSR data.
 * Used by AuditTab to hydrate missing company metrics and run the complete audit.
 */
export default function mountBrsrPdf(sql) {
    return async (req, res) => {
        const { pdfUrl, pdfData, companyName, sector } = req.body;
        
        if (!pdfUrl && !pdfData) {
            return res.status(400).json({ error: "Missing pdfUrl or pdfData" });
        }

        const tempDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const timestamp = Date.now();
        const tempFilePath = path.join(tempDir, `temp_audit_${timestamp}.pdf`);

        try {
            if (pdfData) {
                console.log(`[BRSR-PDF] Writing uploaded base64 PDF to temp file...`);
                // Handle base64 upload
                const buffer = Buffer.from(pdfData, 'base64');
                fs.writeFileSync(tempFilePath, buffer);
            } else {
                // Download from URL
                console.log(`[BRSR-PDF] Downloading PDF from URL: ${pdfUrl}`);
                const response = await fetch(pdfUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });
                if (!response.ok) throw new Error(`HTTP ${response.status} fetching PDF`);
                const buffer = await response.buffer();
                fs.writeFileSync(tempFilePath, buffer);
            }

            // Determine python executable path dynamically (handles root .venv and Backend/venv)
            let pythonPath = path.join(process.cwd(), 'venv', 'Scripts', 'python.exe');
            if (!fs.existsSync(pythonPath)) {
                pythonPath = path.join(process.cwd(), '..', '.venv', 'Scripts', 'python.exe');
            }
            if (!fs.existsSync(pythonPath)) {
                // Fallback to global python
                pythonPath = 'python';
            }
            
            const scriptPath = path.join(process.cwd(), 'run_brsr_audit.py');
            
            console.log(`[BRSR-PDF] Launching python BRSR audit for ${companyName || 'Unknown'} (Sector: ${sector || 'Unknown'})...`);
            
            execFile(pythonPath, [
                scriptPath, 
                tempFilePath, 
                companyName || "Unknown", 
                sector || "Unknown"
            ], { 
                maxBuffer: 1024 * 1024 * 50 
            }, (error, stdout, stderr) => {
                // Delete the temp PDF file immediately
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (e) {
                    console.error("[BRSR-PDF] Failed to delete temp file:", e.message);
                }

                if (error) {
                    console.error("[BRSR-PDF] Python script error:", error, stderr);
                    return res.status(500).json({ 
                        error: "BRSR audit pipeline failed", 
                        details: error.message,
                        stderr 
                    });
                }

                try {
                    const result = JSON.parse(stdout);
                    
                    // If company name was provided, we can optionally save or update metrics in Neon DB.
                    // This creates a seamless loop that hydrates the company list dynamically upon audit!
                    if (companyName && result.metrics) {
                        const m = result.metrics;
                        const s1 = m.scope_1;
                        const s2 = m.scope_2;
                        const s3 = m.scope_3;
                        const energy = m.energy_consumption;
                        const water = m.water_withdrawal;
                        const waste = m.waste_generated;
                        
                        console.log(`[BRSR-PDF] Hydrating database records for company: ${companyName}...`);
                        sql`
                            UPDATE companies
                            SET s1 = COALESCE(${s1}, s1),
                                s2 = COALESCE(${s2}, s2),
                                s3 = COALESCE(${s3}, s3),
                                
                                
                                
                                audit_status = 'COMPLETED',
                                ts = CURRENT_TIMESTAMP
                            WHERE name = ${companyName}
                        `.catch(dbErr => {
                            console.error("[BRSR-PDF] Database hydration failed:", dbErr.message);
                        });
                    }

                    res.json(result);
                } catch (e) {
                    console.error("[BRSR-PDF] JSON Parse error of python output. Raw stdout:", stdout);
                    res.status(500).json({ 
                        error: "Failed to parse audit results", 
                        raw: stdout 
                    });
                }
            });

        } catch (error) {
            console.error("[BRSR-PDF] Pipeline failed:", error.message);
            // Cleanup temp file if exists
            if (fs.existsSync(tempFilePath)) {
                try { fs.unlinkSync(tempFilePath); } catch (e) {}
            }
            res.status(500).json({ 
                error: "BRSR pipeline processing failed", 
                details: error.message 
            });
        }
    };
}
