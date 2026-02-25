import React, { useState, useRef, useEffect } from "react";
import TopBar from "./components/TopBar";
import BottomNav from "./components/BottomNav";
import GlobeTab from "./tabs/GlobeTab";
import CompaniesTab from "./tabs/CompaniesTab";
import CompareTab from "./tabs/CompareTab";
import ScanTab from "./tabs/ScanTab";
import AgentTab from "./tabs/AgentTab";

const VIEWS = {
    globe: <GlobeTab />,
    companies: <CompaniesTab />,
    compare: <CompareTab />,
    scan: <ScanTab />,
    agent: <AgentTab />,
};

export default function App() {
    const [tab, setTab] = useState("globe");
    const scrollRef = useRef(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [tab]);

    return (
        <div style={{
            display: "flex", flexDirection: "column",
            height: "100%", background: "var(--bg)",
            maxWidth: 430, margin: "0 auto",
            position: "relative", overflow: "hidden",
        }}>
            <TopBar tab={tab} />
            <div
                key={tab}
                ref={scrollRef}
                style={{
                    flex: 1, overflowY: "auto", overflowX: "hidden",
                    paddingBottom: `calc(var(--nav) + var(--safe) + 8px)`,
                    background: "var(--bg)",
                }}
            >
                {VIEWS[tab]}
            </div>
            <BottomNav active={tab} set={setTab} />
        </div>
    );
}
