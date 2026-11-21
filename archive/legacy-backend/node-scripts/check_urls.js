import dotenv from 'dotenv';
import { neon } from '@neondatabase/serverless';

dotenv.config();

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function run() {
    // 1. Companies in the companies table that have a PDF URL (either url or report_url is valid and not N/A)
    const withUrl = await sql`
        SELECT COUNT(*) FROM companies 
        WHERE (url IS NOT NULL AND url != 'N/A' AND url != '') 
           OR (report_url IS NOT NULL AND report_url != 'N/A' AND report_url != '')
    `;

    // 2. Companies in the companies table that do NOT have a PDF URL
    const withoutUrl = await sql`
        SELECT COUNT(*) FROM companies 
        WHERE (url IS NULL OR url = 'N/A' OR url = '') 
          AND (report_url IS NULL OR report_url = 'N/A' OR report_url = '')
    `;

    console.log('Companies with ESG PDF URL:', withUrl[0].count);
    console.log('Companies without ESG PDF URL:', withoutUrl[0].count);

    // Let's see some companies with url
    const examples = await sql`
        SELECT name, url, report_url FROM companies 
        WHERE (url IS NOT NULL AND url != 'N/A' AND url != '') 
           OR (report_url IS NOT NULL AND report_url != 'N/A' AND report_url != '')
        LIMIT 15
    `;
    console.log('\nExamples of companies with URL:');
    console.table(examples);
}

run().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
