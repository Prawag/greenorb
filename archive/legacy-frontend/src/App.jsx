import React, { useState } from "react";
import DashboardScreen from "./screens/Dashboard";
import DirectoryScreen from "./screens/ESGDirectory";
import AuditScreen from "./screens/AuditFlags";
import CompanyScreen from "./screens/CompanyProfile";
import ReportScreen from "./screens/ReportDetail";
import UploadScreen from "./screens/UploadReport";
import GlobeTab from "./tabs/GlobeTab";

const SIDEBAR_PATHS = {
    home: "M21 20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V9.48907C3 9.18048 3.14247 8.88917 3.38606 8.69972L11.3861 2.47749C11.7472 2.19663 12.2528 2.19663 12.6139 2.47749L20.6139 8.69972C20.8575 8.88917 21 9.18048 21 9.48907V20ZM19 19V9.97815L12 4.53371L5 9.97815V19H19Z",
    directory: "M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z",
    audit: "M14.4 6L14 4H5V21H7V14H12.6L13 16H20V6H14.4Z",
    building: "M21 19H23V21H1V19H3V4C3 3.44772 3.44772 3 4 3H14C14.5523 3 15 3.44772 15 4V19H19V11H17V9H20C20.5523 9 21 9.44772 21 10V19ZM5 5V19H13V5H5ZM7 11H11V13H7V11ZM7 7H11V9H7V7Z",
    report: "M3 12H5V21H3V12ZM19 8H21V21H19V8ZM11 2H13V21H11V2Z",
    upload: "M4 19H20V12H22V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V12H4V19ZM13 9V16H11V9H6L12 3L18 9H13Z",
    globe: "M13.0003 21.0004H18.0003V23.0004H6.00032V21.0004H11.0003V19.951C7.70689 19.624 4.88351 17.6991 3.31641 14.9626L5.05319 13.9701C6.43208 16.378 9.02674 18.0004 12.0003 18.0004C16.4186 18.0004 20.0003 14.4186 20.0003 10.0003C20.0003 7.02674 18.378 4.43208 15.9701 3.05319L16.9626 1.31641C19.9724 3.04002 22.0003 6.28334 22.0003 10.0003C22.0003 15.1857 18.0536 19.4493 13.0003 19.951V21.0004ZM12.0003 17.0004C8.13433 17.0004 5.00032 13.8663 5.00032 10.0003C5.00032 6.13433 8.13433 3.00032 12.0003 3.00032C15.8663 3.00032 19.0003 6.13433 19.0003 10.0003C19.0003 13.8663 15.8663 17.0004 12.0003 17.0004ZM12.0003 15.0004C14.7617 15.0004 17.0003 12.7618 17.0003 10.0003C17.0003 7.2389 14.7617 5.00032 12.0003 5.00032C9.2389 5.00032 7.00032 7.2389 7.00032 10.0003C7.00032 12.7618 9.2389 15.0004 12.0003 15.0004Z",
};

const NAV_ITEMS = [
    { id: "dashboard", pathKey: "home", label: "Dashboard" },
    { id: "directory", pathKey: "directory", label: null, multiLine: ["ESG", "Directory"] },
    { id: "audit", pathKey: "audit", label: "Audit" },
    { id: "company", pathKey: "building", label: "Company" },
    { id: "report", pathKey: "report", label: "Report" },
    { id: "upload", pathKey: "upload", label: "Upload" },
    { id: "globe", pathKey: "globe", label: null, multiLine: ["Globe", "View"] },
];

function Sidebar({ active, onSelect }) {
    return (
        <div className="sidebar">
            {/* Black ellipse background */}
            <div className="sidebar-ellipse" />

            {/* GreenOrb wordmark */}
            <div className="sidebar-brand">
                GREEN<br />ORB
            </div>

            {/* Navigation items */}
            {NAV_ITEMS.map((item) => {
                const isActive = active === item.id;
                const color = isActive ? "#97ffa1" : "white";

                return (
                    <button
                        key={item.id}
                        onClick={() => onSelect(item.id)}
                        className="sidebar-btn"
                    >
                        <svg fill="none" viewBox="0 0 24 24">
                            <path d={SIDEBAR_PATHS[item.pathKey]} fill={color} />
                        </svg>
                        {item.multiLine ? (
                            <div className="sidebar-label" style={{ color }}>
                                <div style={{ lineHeight: 1.1 }}>{item.multiLine[0]}</div>
                                <div style={{ lineHeight: 1.1 }}>{item.multiLine[1]}</div>
                            </div>
                        ) : (
                            <span className="sidebar-label" style={{ color }}>
                                {item.label}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

export default function App() {
    const [page, setPage] = useState("dashboard");
    const [selectedCompanyId, setSelectedCompanyId] = useState(null);
    const [selectedReportId, setSelectedReportId] = useState(null);

    const navigateToCompany = (id) => {
        setSelectedCompanyId(id);
        setPage("company");
    };

    const navigateToReport = (id) => {
        setSelectedReportId(id);
        setPage("report");
    };

    return (
        <div className="app-layout">
            {/* Sidebar — sticky left column */}
            <div style={{ position: 'sticky', top: 0, alignSelf: 'flex-start', height: '100vh', flexShrink: 0, zIndex: 50 }}>
                <Sidebar active={page} onSelect={setPage} />
            </div>

            {/* Content area */}
            <div className="app-content">
                {page === "dashboard" && (
                    <DashboardScreen
                        onNavigateToDirectory={() => setPage("directory")}
                        onNavigateToCompany={navigateToCompany}
                    />
                )}
                {page === "directory" && (
                    <DirectoryScreen
                        onSelectCompany={navigateToCompany}
                    />
                )}
                {page === "audit" && (
                    <AuditScreen
                        onSelectCompany={navigateToCompany}
                    />
                )}
                {page === "company" && (
                    <CompanyScreen
                        companyId={selectedCompanyId}
                        onSelectReport={navigateToReport}
                        onBack={() => setPage("directory")}
                    />
                )}
                {page === "report" && (
                    <ReportScreen
                        reportId={selectedReportId}
                        onSelectReport={navigateToReport}
                        onBack={() => setPage("company")}
                    />
                )}
                {page === "upload" && <UploadScreen />}
                {page === "globe" && (
                    <div className="globe-container">
                        <GlobeTab />
                    </div>
                )}
            </div>
        </div>
    );
}
