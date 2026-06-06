/**
 * BRSR Gap Report Schema Definition.
 * Standardizes the structured JSON output of the BRSR Audit Pipeline.
 */
export const GapReportSchema = {
    metadata: {
        company_name: "string (required)",
        reporting_year: "string (YYYY-YYYY)",
        audit_date: "string (ISO timestamp)",
        compliance_rating: "High | Medium | Low (required)",
        compliance_score: "number (0-100)"
    },
    metrics: {
        scope_1: "number | null",
        scope_2: "number | null",
        scope_3: "number | null",
        energy_consumption: "number | null",
        water_withdrawal: "number | null",
        waste_generated: "number | null",
        renewable_energy_pct: "number | null",
        women_workforce_pct: "number | null"
    },
    framework_tags: {
        // e.g. "scope_1": { "BRSR": "P6 Essential 1", "CSRD": "ESRS E1-4", ... }
    },
    reporting_gaps: [
        {
            metric: "string",
            metric_label: "string",
            peer_disclosure_rate: "number (percent)",
            severity: "HIGH | MEDIUM",
            message: "string"
        }
    ],
    anomaly_flags: [
        {
            metric: "string",
            metric_label: "string",
            type: "MATH_DISCREPANCY | GRID_DISCREPANCY | STATISTICAL_ANOMALY",
            severity: "HIGH | MEDIUM",
            message: "string",
            details: "object"
        }
    ],
    cbam_risk: {
        applicable: "boolean",
        sector: "string",
        net_liability_eur: "number",
        verified_offset_eur: "number",
        penalty_liability_eur: "number"
    },
    recommendations: [
        {
            category: "COMPLIANCE | DECARBONIZATION | DATA_QUALITY",
            message: "string",
            priority: "HIGH | MEDIUM"
        }
    ]
};

/**
 * Validates a Gap Report object against the schema.
 * @param {Object} data The Gap Report data to validate.
 * @returns {Object} { valid: boolean, errors: Array }
 */
export function validateGapReport(data) {
    const errors = [];
    if (!data) {
        return { valid: false, errors: ["Gap Report data is null or undefined"] };
    }
    
    if (!data.metadata) {
        errors.push("Missing metadata block");
    } else {
        if (!data.metadata.company_name) errors.push("Missing company_name in metadata");
        if (!data.metadata.compliance_rating) errors.push("Missing compliance_rating in metadata");
    }
    
    if (!data.metrics) {
        errors.push("Missing metrics block");
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}
