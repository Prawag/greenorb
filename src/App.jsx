import React, { useState, useRef, useEffect } from "react";
import TopBar from "./components/TopBar";
import AuditTab from "./tabs/AuditTab";

import ESGDataTab from "./tabs/ESGDataTab";
import CompareTab from "./tabs/CompareTab";
import CityDashboard from "./tabs/CityDashboard";

const TABS = [
    { key: "esg", Component: ESGDataTab },
    { key: "compare", Component: CompareTab },
    { key: "audit", Component: AuditTab },
    { key: "indore", Component: CityDashboard },
];

export default function App() {
    const [tab, setTab] = useState("esg");
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [tab]);

    return (
        <div className="app-shell" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            <TopBar tab={tab} setTab={setTab} />
            <div
                ref={scrollRef}
                className="app-content"
                style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)', paddingBottom: '32px' }}
            >
                {/* Keep active tab mounted */}
                {TABS.map(({ key, Component }) => (
                    <div
                        key={key}
                        style={{ display: tab === key ? "block" : "none", height: '100%' }}
                    >
                        <Component setTab={setTab} tab={tab} />
                    </div>
                ))}
            </div>
            
            {/* Quiet Institutional Footer */}
            <footer style={{
                background: 'var(--bg)',
                borderTop: '1px solid var(--bd)',
                padding: '32px 24px',
                textAlign: 'center',
                color: 'var(--muted)',
                fontSize: '13px'
            }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <strong>GreenOrb Intelligence Network</strong> · © 2026 Institutional ESG Compliance
                    </div>
                    <div style={{ display: 'flex', gap: '16px' }}>
                        <span style={{ cursor: 'pointer' }}>Hedera Ledger</span>
                        <span style={{ cursor: 'pointer' }}>Sentinel-5P Satellite Verify</span>
                        <span style={{ cursor: 'pointer' }}>API Docs</span>
                    </div>
                </div>
            </footer>
        </div>
    );
}

