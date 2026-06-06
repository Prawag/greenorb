import React from "react";

export default function StreamlitDashboard() {
    return (
        <div style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}>
            <iframe
                src="http://localhost:8501/"
                style={{ width: "100%", height: "100%", border: "none" }}
                title="Company Insight Dashboard"
            />
        </div>
    );
}
