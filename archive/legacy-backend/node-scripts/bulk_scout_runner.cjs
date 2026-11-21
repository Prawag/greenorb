require('dotenv').config();
const { Pool } = require('pg');
const { spawn } = require('child_process');

const fs = require('fs');
const path = require('path');

// Database configuration targeting your Neon instance
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('⚠️ Unexpected pool client error:', err.message);
});

// Helper for randomized delay (jitter) to humanize search signatures
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runScoutForCompany(companyName, year) {
  return new Promise((resolve, reject) => {
    // Spawns the standalone python scout script with target year
    const pyProcess = spawn('python', ['bulk_scout_only.py', companyName, year], {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
    });
    let output = '';

    // 5-minute timeout because free proxies are slow and need time to rotate
    const timeout = setTimeout(() => {
      pyProcess.kill('SIGKILL');
      reject(new Error(`Timeout: Python process exceeded 5 minutes.`));
    }, 300000);

    pyProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    pyProcess.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        // Regex to extract the final static URL from the python stdout
        const match = output.match(/STATIC_URL_RESULT:\s*(https?:\/\/\S+)/);
        resolve(match ? match[1] : null);
      } else {
        reject(new Error(`Python process exited with code ${code}`));
      }
    });
  });
}

async function startPipeline() {
  const targetYears = ['2024', '2023', '2022', '2021', '2020'];
  
  // Step 1: Target only companies missing one or more of the target years
  const res = await pool.query(
    "SELECT name FROM companies ORDER BY name ASC"
  );
  
  const allCompanies = res.rows;
  const companiesToProcess = [];
  
  for (const co of allCompanies) {
    const missingYears = [];
    for (const yr of targetYears) {
      const filename = `${co.name.toLowerCase().replace(/ /g, '_').replace(/&/g, 'and')}_sustainability_report_${yr}.pdf`;
      const filepath = path.join('downloaded_reports', filename);
      if (!fs.existsSync(filepath) || fs.statSync(filepath).size < 10000) {
        missingYears.push(yr);
      }
    }
    
    if (missingYears.length > 0) {
      companiesToProcess.push({
        name: co.name,
        missingYears
      });
    }
  }

  console.log(`🚀 Bulk pipeline activated. Found ${companiesToProcess.length} companies needing report downloads (out of ${allCompanies.length} total).`);

  for (let i = 0; i < companiesToProcess.length; i++) {
    const company = companiesToProcess[i];
    console.log(`\n[${i + 1}/${companiesToProcess.length}] Target: ${company.name} | Missing Years: ${company.missingYears.join(', ')}`);

    let latestPdfUrl = null;

    for (const yr of company.missingYears) {
      console.log(`  👉 Downloading report for year ${yr}...`);
      let success = false;
      let pdfUrl = null;

      try {
        pdfUrl = await runScoutForCompany(company.name, yr);
        success = true;
      } catch (err) {
        console.error(`  ⚠️ Failed to download for ${company.name} (${yr}): ${err.message}`);
      }

      if (success && pdfUrl) {
        latestPdfUrl = pdfUrl;
        console.log(`  ✅ Downloaded successfully: ${pdfUrl}`);
      }
      
      // Jitter delay between different year downloads of the same company
      await delay(2000);
    }

    if (latestPdfUrl) {
      try {
        await pool.query("UPDATE companies SET url = $1, report_url = $1 WHERE name = $2", [latestPdfUrl, company.name]);
        console.log(`✅ Database synced for ${company.name} -> ${latestPdfUrl}`);
      } catch (dbErr) {
        console.error(`❌ DB Sync failed for ${company.name}: ${dbErr.message}`);
      }
    }

    // Dynamic anti-ban throttle window (sleeps between 4 to 8 seconds randomly)
    const dynamicThrottle = Math.floor(Math.random() * (8000 - 4000 + 1)) + 4000;
    await delay(dynamicThrottle);
  }

  await pool.end();
  console.log('🏁 Bulk collection pipeline finished running.');
}

startPipeline().catch(console.error);
