import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
    try {
        console.log('============================================================');
        console.log('              GreenOrb Extraction Progress                  ');
        console.log('============================================================');

        // 1. Scan downloaded reports directory
        const reportsDir = path.join(__dirname, '..', 'downloaded_reports');
        if (!fs.existsSync(reportsDir)) {
            console.log('⚠️ downloaded_reports directory not found!');
            return;
        }

        const files = fs.readdirSync(reportsDir);
        const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));
        const totalPdfCount = pdfFiles.length;

        // 2. Read processed.txt log
        const processedLogPath = path.join(reportsDir, 'processed.txt');
        let processedCount = 0;
        if (fs.existsSync(processedLogPath)) {
            const content = fs.readFileSync(processedLogPath, 'utf8');
            const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            processedCount = lines.length;
        }

        // 3. Count rows in Neon DB companies table
        const { rows } = await db.query('SELECT COUNT(*) as count FROM companies');
        const dbRecordCount = parseInt(rows[0]?.count || 0, 10);

        // 4. Calculate progress percentages
        const progressPct = totalPdfCount > 0 ? ((processedCount / totalPdfCount) * 100).toFixed(1) : '0.0';

        // 5. Output Console Dashboard
        console.log(`📂 Total PDF Reports in Directory : ${totalPdfCount}`);
        console.log(`✅ Processed Reports (Logged)     : ${processedCount} / ${totalPdfCount} (${progressPct}%)`);
        console.log(`🗄️ Total Company Records in DB    : ${dbRecordCount}`);
        console.log('------------------------------------------------------------');

        // Show remaining
        const remaining = totalPdfCount - processedCount;
        console.log(`⏳ Remaining Queue Size           : ${remaining} documents`);
        
        if (progressPct === '100.0') {
            console.log('🎉 Ingestion complete!');
        } else {
            console.log('🚀 Extraction active in background...');
        }
        console.log('============================================================');

    } catch (err) {
        console.error('❌ Error checking progress:', err);
    }
}

run().then(() => process.exit(0));
