export const CITIES = {
    "Indore": {
        name: "Indore", state: "Madhya Pradesh", swachh_rank: 1,
        description: "India's cleanest city — Carbon Credit Aggregator pioneer",
        metrics: {
            waste:  { label: "Wet Waste Processed",  unit: "Tons/day", base: 479,   variance: 40,  color: "#f59e0b" },
            biocng: { label: "Methane Capture Yield", unit: "kg/day",  base: 14307, variance: 800, color: "#10b981" },
            solar:  { label: "Solar PV Grid Output",  unit: "MW",      base: 4.23,  variance: 0.5, color: "#3b82f6" },
        },
        carbonCredit: { methodology: "ACM0022", rate_per_ton_inr: 1200, annual_credits_est: 8340 }
    },
    "Surat": {
        name: "Surat", state: "Gujarat", swachh_rank: 2,
        description: "Textile capital with aggressive solar adoption",
        metrics: {
            waste:  { label: "Wet Waste Processed",  unit: "Tons/day", base: 620,   variance: 55,  color: "#f59e0b" },
            biocng: { label: "Methane Capture Yield", unit: "kg/day",  base: 18200, variance: 900, color: "#10b981" },
            solar:  { label: "Solar PV Grid Output",  unit: "MW",      base: 6.1,   variance: 0.6, color: "#3b82f6" },
        },
        carbonCredit: { methodology: "ACM0022", rate_per_ton_inr: 1200, annual_credits_est: 10200 }
    },
    "Pune": {
        name: "Pune", state: "Maharashtra", swachh_rank: 4,
        description: "EV adoption leader with smart waste segregation",
        metrics: {
            waste:  { label: "Wet Waste Processed",  unit: "Tons/day", base: 890,   variance: 70,  color: "#f59e0b" },
            biocng: { label: "Methane Capture Yield", unit: "kg/day",  base: 22100, variance: 1100, color: "#10b981" },
            solar:  { label: "Solar PV Grid Output",  unit: "MW",      base: 8.4,   variance: 0.8, color: "#3b82f6" },
        },
        carbonCredit: { methodology: "ACM0022", rate_per_ton_inr: 1200, annual_credits_est: 14800 }
    },
    "Ahmedabad": {
        name: "Ahmedabad", state: "Gujarat", swachh_rank: 5,
        description: "Industrial hub driving BRSR supply chain reporting",
        metrics: {
            waste:  { label: "Wet Waste Processed",  unit: "Tons/day", base: 1100,  variance: 90,  color: "#f59e0b" },
            biocng: { label: "Methane Capture Yield", unit: "kg/day",  base: 27000, variance: 1400, color: "#10b981" },
            solar:  { label: "Solar PV Grid Output",  unit: "MW",      base: 11.2,  variance: 1.0, color: "#3b82f6" },
        },
        carbonCredit: { methodology: "ACM0022", rate_per_ton_inr: 1200, annual_credits_est: 18900 }
    }
};

export const CITY_IDS = Object.keys(CITIES);
export const getCity  = (id) => CITIES[id] || CITIES["Indore"];
