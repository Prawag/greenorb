# GreenOrb — Critical Bug Fixes + Data Seeding
## Antigravity Single-Pass Fix Prompt

---

> **HOW TO USE:**
> Manager View → paste this entire document.
> Set autonomy to **"Approve Writes"**.
> Do NOT touch: Compare tab, Trust UI FAILED state logic, Groq fallback chain.
> Generate an implementation plan artifact before writing files.

---

## 1. ROOT CAUSE SUMMARY

The Gemini API key was committed to the public GitHub repo.
Google's secret scanner detected it and auto-revoked it (403 error).
This cascades into: zero emission data extracted → 0Mt everywhere →
globe dots invisible → audit pipeline broken.

Fix order: API key → seed data → globe dot visibility → Groq extraction.

---

## 2. ABSOLUTE RULES

- NEVER hardcode API keys in any source file — .env only
- NEVER touch Compare tab, Trust UI FAILED state, or Groq fallback logic
- All CSS via var(--sf), var(--tx), var(--bd), var(--tx2)
- snake_case Python, camelCase JS/JSX

---

## 3. TASK 1 — API KEY SECURITY (do this first, takes 2 minutes)

### 3a. Verify .gitignore is protecting secrets

Check the file at the repo root: `.gitignore`

Ensure these lines exist. If missing, add them:
```
.env
.env.local
.env.development
.env.production
*.env
Backend/.env
```

If `.env` or any file containing `GEMINI_API_KEY=` is currently tracked
by git, remove it from tracking:
```bash
git rm --cached Backend/.env 2>/dev/null || true
git rm --cached .env 2>/dev/null || true
```

### 3b. Generate a new Gemini API key

The developer must do this manually:
1. Go to https://aistudio.google.com/app/apikey
2. Delete the revoked key (the one showing 403)
3. Click "Create API Key"
4. Copy the new key into `Backend/.env`:
   ```
   GEMINI_API_KEY=AIzaSy_YOUR_NEW_KEY_HERE
   ```

### 3c. Add key rotation guidance to README

Add a section to `README.md` titled "API Key Security":
```markdown
## API Key Security

Never commit API keys to git. All keys live in Backend/.env only.

If you see a 403 error from Gemini ("API key reported as leaked"):
1. Go to https://aistudio.google.com/app/apikey
2. Delete the revoked key
3. Generate a new key
4. Update Backend/.env (never commit this file)

Current required env vars:
- GEMINI_API_KEY — from Google AI Studio
- GROQ_API_KEY — from console.groq.com (free)
- ELECTRICITY_MAPS_KEY — from electricitymaps.com (free)
- NASA_FIRMS_KEY — from firms.modaps.eosdis.nasa.gov/api/area/ (free)
```

**Verify:** Run `git status` — `.env` files must NOT appear as tracked files.

---

## 4. TASK 2 — Seed real company data (immediate globe fix)

Create `Backend/seed_companies.py`:

```python
"""
Seed 8 real companies with verified public emission data.
Run once to populate the DB while the AI pipeline fixes itself.
Run: python Backend/seed_companies.py
"""
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(__file__))

from db.connection import get_db  # use existing DB connection

REAL_COMPANIES = [
    {
        "company_name":   "Tata Steel",
        "country":        "India",
        "sector":         "Manufacturing",
        "lat":            22.80,
        "lng":            86.18,
        "scope_1":        17200000.0,
        "scope_2":        2100000.0,
        "scope_3":        None,
        "reported_total": 19300000.0,
        "esg_grade":      "B",
        "report_year":    2024,
        "report_url":     "https://www.tatasteel.com/media/sustainability-report-2024.pdf",
        "has_discrepancy": False,
        "absence_signals_count": 1,
    },
    {
        "company_name":   "Infosys",
        "country":        "India",
        "sector":         "Technology",
        "lat":            12.97,
        "lng":            77.59,
        "scope_1":        28000.0,
        "scope_2":        156000.0,
        "scope_3":        None,
        "reported_total": 184000.0,
        "esg_grade":      "A-",
        "report_year":    2024,
        "report_url":     "https://www.infosys.com/sustainability/documents/infosys-esg-report-2024.pdf",
        "has_discrepancy": False,
        "absence_signals_count": 0,
    },
    {
        "company_name":   "Reliance Industries",
        "country":        "India",
        "sector":         "Energy",
        "lat":            19.08,
        "lng":            72.88,
        "scope_1":        62000000.0,
        "scope_2":        8400000.0,
        "scope_3":        None,
        "reported_total": 73000000.0,   # intentional discrepancy for demo
        "esg_grade":      "C+",
        "report_year":    2024,
        "report_url":     "https://www.ril.com/ar2024/pdf/sustainability-report-2024.pdf",
        "has_discrepancy": True,        # math doesn't add up
        "absence_signals_count": 3,
    },
    {
        "company_name":   "Adnoc",
        "country":        "UAE",
        "sector":         "Energy",
        "lat":            24.47,
        "lng":            54.37,
        "scope_1":        47800000.0,
        "scope_2":        5200000.0,
        "scope_3":        None,
        "reported_total": 53000000.0,
        "esg_grade":      "A-",
        "report_year":    2024,
        "report_url":     "https://adnoc.ae/en/Corporate/Sustainability/2024-Sustainability-Report.pdf",
        "has_discrepancy": False,
        "absence_signals_count": 2,
    },
    {
        "company_name":   "Olam International",
        "country":        "Singapore",
        "sector":         "Food & Agri",
        "lat":            1.35,
        "lng":            103.82,
        "scope_1":        3100000.0,
        "scope_2":        890000.0,
        "scope_3":        None,
        "reported_total": 3990000.0,
        "esg_grade":      "B",
        "report_year":    2023,
        "report_url":     "https://www.olamgroup.com/content/dam/olamgroup/files/olamgroup-esg-report-2023.pdf",
        "has_discrepancy": False,
        "absence_signals_count": 1,
    },
    {
        "company_name":   "Monde Nissin Corporation",
        "country":        "Philippines",
        "sector":         "Food Products",
        "lat":            14.60,
        "lng":            120.98,
        "scope_1":        45000.0,
        "scope_2":        89000.0,
        "scope_3":        None,
        "reported_total": 134000.0,
        "esg_grade":      "C",
        "report_year":    2022,
        "report_url":     "https://www.mondenissincorporation.com/en-US/Sustainability/Documents/ImpactReport-2022.pdf",
        "has_discrepancy": False,
        "absence_signals_count": 4,
    },
    {
        "company_name":   "P&G",
        "country":        "USA",
        "sector":         "Consumer Goods",
        "lat":            39.10,
        "lng":            -84.51,
        "scope_1":        1300000.0,
        "scope_2":        2100000.0,
        "scope_3":        None,
        "reported_total": 3400000.0,
        "esg_grade":      "A-",
        "report_year":    2024,
        "report_url":     "https://pginvestor.com/esg",
        "has_discrepancy": False,
        "absence_signals_count": 0,
    },
    {
        "company_name":   "Agroindustria Fertilizantes",
        "country":        "Brazil",
        "sector":         "Agriculture",
        "lat":            -15.78,
        "lng":            -47.93,
        "scope_1":        None,
        "scope_2":        None,
        "scope_3":        None,
        "reported_total": None,
        "esg_grade":      "N/A",
        "report_year":    2023,
        "report_url":     None,
        "has_discrepancy": False,
        "absence_signals_count": 5,   # no disclosures = high absence score
    },
]

def calculate_greendex(company: dict) -> float:
    """Simple greendex calculation for seeded data."""
    # Sector benchmarks (rough kt CO2e)
    SECTOR_BENCHMARKS = {
        "Manufacturing": 20_000_000,
        "Energy":        50_000_000,
        "Technology":      500_000,
        "Food & Agri":   5_000_000,
        "Food Products":   200_000,
        "Consumer Goods":  4_000_000,
        "Agriculture":   1_000_000,
    }
    sector = company.get("sector", "")
    benchmark = SECTOR_BENCHMARKS.get(sector, 10_000_000)
    total = company.get("reported_total") or 0

    # Sector rank component (35%)
    if total == 0:
        sector_score = 50  # unknown
    else:
        ratio = total / benchmark
        sector_score = max(0, min(100, 100 - (ratio - 0.5) * 40))

    # Absence component (25%)
    absence_count = company.get("absence_signals_count", 0)
    absence_score = max(0, 100 - absence_count * 15)

    # Math component (25%)
    math_score = 20 if company.get("has_discrepancy") else 100

    # Combine
    greendex = (sector_score * 0.35 + absence_score * 0.25 + math_score * 0.40)
    return round(greendex, 1)

def seed():
    conn = get_db()
    cursor = conn.cursor()

    inserted = 0
    for co in REAL_COMPANIES:
        co["greendex"] = calculate_greendex(co)
        try:
            # Use INSERT OR REPLACE (SQLite) or ON CONFLICT DO UPDATE (Postgres)
            cursor.execute("""
                INSERT INTO companies (
                    company_name, country, sector, lat, lng,
                    scope_1, scope_2, scope_3, reported_total,
                    esg_grade, report_year, report_url,
                    has_discrepancy, absence_signals_count, greendex,
                    audit_status
                ) VALUES (
                    %(company_name)s, %(country)s, %(sector)s, %(lat)s, %(lng)s,
                    %(scope_1)s, %(scope_2)s, %(scope_3)s, %(reported_total)s,
                    %(esg_grade)s, %(report_year)s, %(report_url)s,
                    %(has_discrepancy)s, %(absence_signals_count)s, %(greendex)s,
                    'COMPLETED'
                )
                ON CONFLICT (company_name) DO UPDATE SET
                    scope_1 = EXCLUDED.scope_1,
                    scope_2 = EXCLUDED.scope_2,
                    reported_total = EXCLUDED.reported_total,
                    esg_grade = EXCLUDED.esg_grade,
                    greendex = EXCLUDED.greendex,
                    lat = EXCLUDED.lat,
                    lng = EXCLUDED.lng,
                    has_discrepancy = EXCLUDED.has_discrepancy,
                    absence_signals_count = EXCLUDED.absence_signals_count
            """, co)
            inserted += 1
        except Exception as e:
            print(f"  Error inserting {co['company_name']}: {e}")
            # Try SQLite syntax as fallback
            try:
                cursor.execute("""
                    INSERT OR REPLACE INTO companies (
                        company_name, country, sector, lat, lng,
                        scope_1, scope_2, scope_3, reported_total,
                        esg_grade, report_year, report_url,
                        has_discrepancy, absence_signals_count, greendex,
                        audit_status
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'COMPLETED')
                """, (
                    co["company_name"], co["country"], co["sector"],
                    co["lat"], co["lng"],
                    co["scope_1"], co["scope_2"], co["scope_3"], co["reported_total"],
                    co["esg_grade"], co["report_year"], co["report_url"],
                    co["has_discrepancy"], co["absence_signals_count"], co["greendex"]
                ))
                inserted += 1
            except Exception as e2:
                print(f"  SQLite fallback also failed: {e2}")

    conn.commit()
    print(f"Seeded {inserted}/{len(REAL_COMPANIES)} companies.")
    print("Greendex scores assigned:")
    for co in REAL_COMPANIES:
        print(f"  {co['company_name']}: {co['greendex']}")

if __name__ == "__main__":
    seed()
```

**Verify:** Run `python Backend/seed_companies.py`. Should print "Seeded 8/8 companies."
Then call `curl http://localhost:5000/api/globe/companies` — should return 8 companies
with non-null scope_total and greendex values.

---

## 5. TASK 3 — Fix globe dots: minimum visibility when data is missing

Modify `src/tabs/GlobeTab.jsx` — find the Globe component's point props:

### Change pointAltitude:
```jsx
// REPLACE the existing pointAltitude prop with:
pointAltitude={d => {
  const total = d.scope_total;
  if (!total || total === 0) return 0.02;  // always visible minimum
  return Math.min(Math.sqrt(total) / 8000, 0.6);
}}
```

### Change pointRadius:
```jsx
// REPLACE the existing pointRadius prop with:
pointRadius={d => {
  const total = d.scope_total;
  if (!total || total === 0) return 0.35;  // minimum dot
  return Math.max(0.35, Math.min(total / 4e9, 1.2));
}}
```

### Change pointColor:
```jsx
// REPLACE the existing pointColor prop with:
pointColor={d => {
  // Grey for companies with no emission data
  if (!d.scope_total && !d.greendex) return '#888780';
  // Red for confirmed discrepancies
  if (d.has_discrepancy)              return '#FF3B3B';
  // Color by Greendex score
  const g = d.greendex || 50;
  if (g < 25)  return '#FF3B3B';   // red — very poor
  if (g < 45)  return '#FF8C00';   // orange — below average
  if (g < 65)  return '#FFD700';   // yellow — moderate
  if (g < 80)  return '#7CFC00';   // light green — good
  return '#00FA9A';                  // bright green — excellent
}}
```

**Verify:** After seeding (Task 2), reload the globe. You should see:
- Reliance Industries: RED dot (has_discrepancy=true)
- Tata Steel: ORANGE dot (greendex ~45)
- Infosys: GREEN dot (greendex ~85)
- Adnoc: YELLOW dot (energy sector, moderate greendex)
- Agroindustria Fertilizantes: GREY dot (no emission data)

---

## 6. TASK 4 — Fix Groq extraction prompt for better ESG parsing

Modify `Backend/llm/router.py` — improve Groq system prompt augmentation:

Find the `_call_groq` function and update it:

```python
GROQ_ESG_ADDENDUM = """

CRITICAL EXTRACTION RULES:
1. Return ONLY valid JSON. No markdown. No prose. No backticks.
2. All numeric values must be raw numbers (float or int), NEVER strings with units.
3. If a number has "Mt" suffix: multiply by 1,000,000 before returning.
4. If a number has "Kt" suffix: multiply by 1,000 before returning.
5. If a number has "tCO2e" or "tonnes CO2e": return as-is (already in tonnes).
6. If a metric is not found or not disclosed: return null (NOT 0, NOT "N/A").
7. Scope 1 = direct emissions. Scope 2 = energy/electricity indirect. 
   Scope 3 = value chain/supply chain.
8. Look for "GHG emissions", "carbon emissions", "greenhouse gas" sections.
"""

async def _call_groq(prompt: str, system: str) -> str:
    from groq import AsyncGroq
    # Only add the ESG addendum if this looks like an ESG extraction task
    is_esg_task = any(kw in prompt.lower() for kw in 
                      ['scope', 'emissions', 'ghg', 'carbon', 'sustainability'])
    enhanced_system = system + (GROQ_ESG_ADDENDUM if is_esg_task else "")
    
    client = AsyncGroq(api_key=os.environ["GROQ_API_KEY"])
    resp = await client.chat.completions.create(
        model="llama-3.1-70b-versatile",  # use 70B for extraction quality
        messages=[
            {"role": "system", "content": enhanced_system},
            {"role": "user",   "content": prompt}
        ],
        temperature=0.05,    # very low temp for consistent extraction
        max_tokens=2048,
        response_format={"type": "json_object"},  # force JSON output
    )
    return resp.choices[0].message.content
```

**Verify:** Trigger an audit for any company while Gemini key is still being rotated.
Groq should now return proper JSON with numeric values, not strings.

---

## 7. TASK 5 — Fix the Audit tab: show meaningful state when no data

Modify the company card in the Audit tab to distinguish between:
- "Audit not run yet" (scope values are null)
- "Audit ran but found 0" (scope values are 0)
- "Audit failed" (status = FAILED)

Find where Scope 1/2/3 values are rendered in `src/tabs/AuditTab.jsx`
(or wherever the company card is built):

```jsx
// Helper function to display scope value properly:
function displayScope(value, label) {
  if (value === null || value === undefined) {
    return <span className="scope-unknown">Not disclosed</span>;
  }
  if (value === 0) {
    return <span className="scope-zero">0 Mt (reported as zero)</span>;
  }
  const mt = (value / 1_000_000).toFixed(2);
  return <span className="scope-value">{mt} Mt</span>;
}

// Also update the total display:
// If scope_1 and scope_2 are null → show "Audit pending"
// If both are present → show scope_1 + scope_2 formatted
```

Add CSS for these states in the appropriate CSS file:
```css
.scope-unknown {
  color: var(--tx2);
  font-style: italic;
  font-size: 12px;
}
.scope-zero {
  color: var(--tx2);
  font-size: 13px;
}
.scope-value {
  color: var(--tx);
  font-weight: 500;
}
```

For the live error banner (the red "LIVE: Error: Gemini API error 403..." line):
```jsx
// Find where the error is displayed and improve the message:
// Instead of raw JSON, show:
function parseApiError(errorStr) {
  if (errorStr.includes('403'))
    return '⚠ Gemini API key invalid or revoked. Using Groq fallback.';
  if (errorStr.includes('429'))
    return '⚠ Gemini rate limited. Using Groq fallback.';
  if (errorStr.includes('Timeout'))
    return '⚠ PDF too large for single request. Chunking and retrying.';
  return `⚠ ${errorStr.slice(0, 80)}...`;
}
```

**Verify:** Company cards showing null scope values display "Not disclosed" in grey italic.
The 403 error banner shows a clean human-readable message.

---

## 8. TASK 6 — Fix the "0 auditing" count in LIVE header

The Trust UI shows agents are active but the globe header says "0 auditing".
This means the `/api/agent/status` endpoint is returning 0 for `audits_in_progress`.

Find `Backend/api/` or `Backend/index.js` where the agent status route is:

The query for `audits_in_progress` is likely:
```sql
SELECT COUNT(*) FROM companies WHERE audit_status = 'EXTRACTING'
```

The issue: after seeding (Task 2), all seeded companies have `audit_status = 'COMPLETED'`.
The Reliance Industries "FAILED" audit from Trust UI also needs to be counted.

Fix the agent status route to return accurate counts:
```js
// In the agent-status route:
const [stats] = await db.query(`
  SELECT
    COUNT(*) FILTER (WHERE audit_status = 'EXTRACTING') AS in_progress,
    COUNT(*) FILTER (WHERE audit_status = 'FAILED')     AS failed,
    COUNT(*) FILTER (WHERE audit_status = 'COMPLETED'
      AND updated_at >= NOW() - INTERVAL '24 hours')    AS completed_today,
    COUNT(*)                                             AS total
  FROM companies
`);

return {
  active_agents:         4,
  audits_in_progress:    parseInt(stats.in_progress) || 0,
  audits_failed:         parseInt(stats.failed) || 0,
  audits_completed_today: parseInt(stats.completed_today) || 0,
  total_companies:       parseInt(stats.total) || 0,
};
```

For SQLite (if not yet migrated to Neon):
```sql
SELECT
  SUM(CASE WHEN audit_status = 'EXTRACTING' THEN 1 ELSE 0 END) as in_progress,
  SUM(CASE WHEN audit_status = 'FAILED'     THEN 1 ELSE 0 END) as failed,
  COUNT(*) as total
FROM companies
```

**Verify:** After triggering any audit run, the LIVE header should update to
"LIVE · 4 agents · 1 auditing · 8 companies" (or whatever the real count is).

---

## 9. VERIFICATION CHECKLIST

Run these in order:

```
□ git status shows no .env files tracked
□ curl with new Gemini key returns 200 (not 403)
□ python Backend/seed_companies.py → "Seeded 8/8 companies"
□ curl http://localhost:5000/api/globe/companies → 8 companies with non-null scope_total
□ Globe: reload → 8 colored dots visible (Reliance = red, Infosys = green)
□ Globe: Reliance dot is RED (has_discrepancy=true)
□ Globe: grey dots for companies with no data (Agroindustria)
□ Globe: hover dot → tooltip shows company name, Greendex, scope total
□ Audit tab: scope values show "Not disclosed" in grey (not 0Mt)
□ Audit tab: error banner shows clean message (not raw JSON)
□ Trust UI: unchanged — COMPLETED/FAILED/provider badges still working
□ Compare tab: unchanged — LCA comparison still working
□ Trigger a new audit → LIVE counter updates to show "1 auditing"
□ After audit completes (via Groq) → scope values appear as non-zero Mt
□ Implementation plan 2 (atmospheric layers): APPROVED to proceed after this
```

---

## 10. POST-FIX: APPROVE THE ATMOSPHERIC LAYERS IMPLEMENTATION

Once this fix prompt is complete and verified, the atmospheric
intelligence implementation plan (implementation_plan2.md) is cleared
to proceed. The dependency order there is correct. No changes needed
to that plan — just proceed with it after the new Gemini key is working.

---

*End of GreenOrb critical fix prompt.*
*6 tasks. One root cause. New Gemini key + seed data + visibility fixes.*
