export async function computeGreendex(companyName, sql) {
    try {
        console.log(`[Greendex] Computing score for ${companyName}...`);
        
        // Fix applied here from user blueprint: proper JOIN analysis a ON sd.name = a.company
        const companyDataQuery = await sql`
            WITH SectorData AS (
                SELECT name, sector, COALESCE(co2, s1 + COALESCE(s2, 0)) as total_co2,
                       (CASE WHEN s1 IS NULL THEN 1 ELSE 0 END +
                        CASE WHEN s2 IS NULL THEN 1 ELSE 0 END +
                        CASE WHEN s3 IS NULL THEN 1 ELSE 0 END +
                        CASE WHEN esg IS NULL THEN 1 ELSE 0 END +
                        CASE WHEN co2 IS NULL THEN 1 ELSE 0 END) as null_count
                FROM companies
                WHERE sector = (SELECT sector FROM companies WHERE name = ${companyName} LIMIT 1)
                  AND COALESCE(co2, s1 + COALESCE(s2, 0)) IS NOT NULL
            ),
            Ranked AS (
                SELECT sd.name, sd.total_co2, sd.sector, sd.null_count,
                       PERCENT_RANK() OVER (ORDER BY sd.total_co2 ASC) as co2_rank,
                       a.trend, a.e_score, a.s_score, a.g_score
                FROM SectorData sd
                LEFT JOIN analysis a ON sd.name = a.company
            )
            SELECT r.*,
                   (SELECT AVG(null_count) FROM SectorData) as avg_nulls
            FROM Ranked r WHERE name = ${companyName};
        `;
        
        let sectorScore = 50; 
        let disclosureScore = 50;
        let mathScore = 20; 
        let e_score = null, s_score = null, g_score = null;

        if (companyDataQuery && companyDataQuery.length > 0) {
            const row = companyDataQuery[0];
            
            // 1. Sector benchmark score (35%)
            const co2Rank = parseFloat(row.co2_rank);
            sectorScore = (1 - co2Rank) * 100;

            // 2. Disclosure absence score (25%)
            const companyNulls = parseFloat(row.null_count);
            disclosureScore = Math.max(0, 100 - (companyNulls * 20));
            
            // 3. Math verification score (25%)
            // Fix applied here from user blueprint: row.trend === 'verified' ? 100 : 20
            mathScore = (row.trend || "").toLowerCase() === 'verified' ? 100 : 20;
            
            e_score = row.e_score;
            s_score = row.s_score;
            g_score = row.g_score;
        }

        // 4. Final Combine explicitly mapped to formula: (0.35 * sector) + (0.25 * disclosure) + (0.25 * math) + 7.5
        const greendex_score = Math.round(
            (sectorScore * 0.35) +
            (disclosureScore * 0.25) +
            (mathScore * 0.25) +
            7.5
        );

        // 5. UPSERT back to analysis
        console.log(`[Greendex] Final score for ${companyName}: ${greendex_score}`);
        await sql`
            INSERT INTO analysis (company, score, e_score, s_score, g_score)
            VALUES (${companyName}, ${greendex_score}, ${e_score}, ${s_score}, ${g_score})
            ON CONFLICT (company) DO UPDATE SET
                score = EXCLUDED.score
        `;

        return {
            company: companyName,
            greendex_score,
            breakdown: {
                sector_score: Math.round(sectorScore),
                disclosure_score: Math.round(disclosureScore),
                math_verification_score: Math.round(mathScore),
                formula_base: 7.5
            }
        };

    } catch (e) {
        console.error(`[Greendex] Error computing ${companyName}:`, e.message);
        throw e;
    }
}
