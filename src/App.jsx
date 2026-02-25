import React, { useState, useRef, useEffect } from "react";
import TopBar from "./components/TopBar";
import BottomNav from "./components/BottomNav";
import GlobeTab from "./tabs/GlobeTab";
import CompaniesTab from "./tabs/CompaniesTab";
import CompareTab from "./tabs/CompareTab";
import ScanTab from "./tabs/ScanTab";
import AgentTab from "./tabs/AgentTab";

const TABS = [
    { key: "globe", Component: GlobeTab },
    { key: "companies", Component: CompaniesTab },
    { key: "compare", Component: CompareTab },
    { key: "scan", Component: ScanTab },
    { key: "agent", Component: AgentTab },
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
