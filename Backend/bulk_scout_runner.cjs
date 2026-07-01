const { Pool } = require('pg');
const { spawn } = require('child_process');

// Database configuration targeting your Neon instance
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Helper for randomized delay (jitter) to humanize search signatures
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runScoutForCompany(companyName) {
  return new Promise((resolve, reject) => {
    // Spawns the standalone python scout script
    const pyProcess = spawn('python', ['bulk_scout_only.py', companyName], {
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
  // Step 1: Target only companies missing an authentic ESG asset link
  const res = await pool.query(
    "SELECT name FROM companies WHERE url IS NULL OR url = '' OR url = 'N/A' ORDER BY name ASC"
  );
  const companies = res.rows;
  console.log(`🚀 Bulk pipeline activated. Found ${companies.length} target companies.`);

  for (let i = 0; i < companies.length; i++) {
    const company = companies[i];
    console.log(`\n[${i + 1}/${companies.length}] Target: ${company.name}`);

    let attempts = 0;
    let success = false;
    let pdfUrl = null;

    // Retry loop (reduced to 1 attempt to vastly speed up the pipeline)
    while (attempts < 1 && !success) {
      try {
        pdfUrl = await runScoutForCompany(company.name);
        success = true;
      } catch (err) {
        attempts++;
        console.error(`⚠️ Attempt ${attempts} failed for ${company.name}: ${err.message}.`);
      }
    }

    if (success && pdfUrl) {
      // Step 2: Immediate database mutation once local download finishes
      try {
        await pool.query("UPDATE companies SET url = $1, report_url = $1 WHERE name = $2", [pdfUrl, company.name]);
        console.log(`✅ Database synced for ${company.name} -> ${pdfUrl}`);
      } catch (dbErr) {
        console.error(`❌ DB Sync failed for ${company.name}: ${dbErr.message}`);
      }
    } else {
      console.log(`❌ Skipped ${company.name} after max retries or empty PDF resolution.`);
    }

    // Dynamic anti-ban throttle window (sleeps between 4 to 8 seconds randomly)
    const dynamicThrottle = Math.floor(Math.random() * (8000 - 4000 + 1)) + 4000;
    await delay(dynamicThrottle);
  }

  await pool.end();
  console.log('🏁 Bulk collection pipeline finished running.');
}

startPipeline().catch(console.error);
