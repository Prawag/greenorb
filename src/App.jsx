import React, { useState, useRef, useEffect } from "react";
import TopBar from "./components/TopBar";
import BottomNav from "./components/BottomNav";
import GlobeTab from "./tabs/GlobeTab";
import AuditTab from "./tabs/AuditTab"; // UI label: Audit
import CompareTab from "./tabs/CompareTab";
import TrustDashboard from "./tabs/TrustDashboard";
import CityDashboard from "./tabs/CityDashboard";
import ESGDataTab from "./tabs/ESGDataTab";
import FacilitiesTab from "./tabs/FacilitiesTab";

const TABS = [
    { key: "globe", Component: GlobeTab },
    { key: "audit", Component: AuditTab },
    { key: "esg", Component: ESGDataTab },
    { key: "facilities", Component: FacilitiesTab },
    { key: "compare", Component: CompareTab },
    { key: "trust", Component: TrustDashboard },
    { key: "indore", Component: CityDashboard },
];

export default function App() {
    const [tab, setTab] = useState("globe");
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [tab]);

    return (
        <div className="app-shell">
            <TopBar tab={tab} />
            <div
                ref={scrollRef}
                className="app-content"
            >
                {/* Keep ALL tabs mounted but only show active one */}
                {TABS.map(({ key, Component }) => (
                    <div
                        key={key}
                        style={{ display: tab === key ? "block" : "none" }}
                    >
                        <Component />
                    </div>
                ))}
            </div>
            <BottomNav active={tab} set={setTab} />
        </div>
    );
}
