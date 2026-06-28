# GreenOrb UI — Antigravity Implementation Prompt (v2)
## Base: Figma Make project · Scope: UI changes only

---

## WHAT THIS IS

You have a Figma Make project (React + Vite + Tailwind v4 + shadcn/ui) that has been designed with a sidebar layout and multiple screens. We are adapting it into **GreenOrb's ESG Report Intelligence UI** — keeping the exact same sidebar aesthetic and layout structure, but replacing the page content with GreenOrb-specific screens.

**Do not start a new project. Work inside the existing Figma Make project files.**

---

## WHAT STAYS EXACTLY THE SAME

- The sidebar component — black ellipse, 90px width, Manrope font, `#97ffa1` active color, white inactive
- The layout pattern: `flex w-full min-h-screen` with sticky sidebar + scrollable content area
- All files inside `src/components/ui/` — do not touch Badge, Button, Card, Chart, Dialog, Drawer, etc.
- The `postcss.config.mjs`, `vite.config.ts`, `package.json`, `pnpm-workspace.yaml`
- The `#f2f3bf` background — this warm yellow-green works well for ESG data tables
- The `useState` navigation pattern — no react-router needed

---

## STEP 1 — UPDATE `src/app/App.tsx`

Replace the entire `App.tsx` with the following. This keeps the exact same sidebar architecture but remaps the navigation to GreenOrb pages.

```tsx
import { useState } from "react";
import DashboardScreen from "@/screens/Dashboard";
import DirectoryScreen from "@/screens/ESGDirectory";
import AuditScreen from "@/screens/AuditFlags";
import CompanyScreen from "@/screens/CompanyProfile";
import ReportScreen from "@/screens/ReportDetail";
import UploadScreen from "@/screens/UploadReport";

type Page = "dashboard" | "directory" | "audit" | "company" | "report" | "upload" | "globe";

// SVG paths — keeping original icons where they map well, swapping where needed
const sidebarPaths = {
  home:     "M21 20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V9.48907C3 9.18048 3.14247 8.88917 3.38606 8.69972L11.3861 2.47749C11.7472 2.19663 12.2528 2.19663 12.6139 2.47749L20.6139 8.69972C20.8575 8.88917 21 9.18048 21 9.48907V20ZM19 19V9.97815L12 4.53371L5 9.97815V19H19Z",
  // Document/list icon for ESG Directory
  directory: "M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z",
  // Flag icon for Audit
  audit:    "M14.4 6L14 4H5V21H7V14H12.6L13 16H20V6H14.4Z",
  // Building icon for Company Profile
  building: "M21 19H23V21H1V19H3V4C3 3.44772 3.44772 3 4 3H14C14.5523 3 15 3.44772 15 4V19H19V11H17V9H20C20.5523 9 21 9.44772 21 10V19ZM5 5V19H13V5H5ZM7 11H11V13H7V11ZM7 7H11V9H7V7Z",
  // Bar chart icon for individual report
  report:   "M3 12H5V21H3V12ZM19 8H21V21H19V8ZM11 2H13V21H11V2Z",
  upload:   "M4 19H20V12H22V20C22 20.5523 21.5523 21 21 21H3C2.44772 21 2 20.5523 2 20V12H4V19ZM13 9V16H11V9H6L12 3L18 9H13Z",
  globe:    "M13.0003 21.0004H18.0003V23.0004H6.00032V21.0004H11.0003V19.951C7.70689 19.624 4.88351 17.6991 3.31641 14.9626L5.05319 13.9701C6.43208 16.378 9.02674 18.0004 12.0003 18.0004C16.4186 18.0004 20.0003 14.4186 20.0003 10.0003C20.0003 7.02674 18.378 4.43208 15.9701 3.05319L16.9626 1.31641C19.9724 3.04002 22.0003 6.28334 22.0003 10.0003C22.0003 15.1857 18.0536 19.4493 13.0003 19.951V21.0004ZM12.0003 17.0004C8.13433 17.0004 5.00032 13.8663 5.00032 10.0003C5.00032 6.13433 8.13433 3.00032 12.0003 3.00032C15.8663 3.00032 19.0003 6.13433 19.0003 10.0003C19.0003 13.8663 15.8663 17.0004 12.0003 17.0004ZM12.0003 15.0004C14.7617 15.0004 17.0003 12.7618 17.0003 10.0003C17.0003 7.2389 14.7617 5.00032 12.0003 5.00032C9.2389 5.00032 7.00032 7.2389 7.00032 10.0003C7.00032 12.7618 9.2389 15.0004 12.0003 15.0004Z",
};

const NAV_ITEMS: {
  id: Page;
  pathKey: keyof typeof sidebarPaths;
  viewBox: string;
  label: string | null;
  multiLine?: [string, string];
  external?: string;
}[] = [
  { id: "dashboard",  pathKey: "home",      viewBox: "0 0 24 24", label: "Dashboard" },
  { id: "directory",  pathKey: "directory", viewBox: "0 0 24 24", label: null, multiLine: ["ESG", "Directory"] },
  { id: "audit",      pathKey: "audit",     viewBox: "0 0 24 24", label: "Audit" },
  { id: "company",    pathKey: "building",  viewBox: "0 0 24 24", label: "Company" },
  { id: "report",     pathKey: "report",    viewBox: "0 0 24 24", label: "Report" },
  { id: "upload",     pathKey: "upload",    viewBox: "0 0 24 24", label: "Upload" },
  { id: "globe",      pathKey: "globe",     viewBox: "0 0 24 24", label: null, multiLine: ["Globe", "View"], external: "http://localhost:5173" },
];

function Sidebar({ active, onSelect }: { active: Page; onSelect: (p: Page) => void }) {
  return (
    <div className="relative flex flex-col gap-[20px] items-center overflow-clip pb-[180px] pt-[150px] px-[16px] w-[90px] min-h-screen">
      {/* Black ellipse — keep exactly as designed */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 254,
          height: 996,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: "black",
        }}
      />

      {/* GreenOrb wordmark at top */}
      <div
        className="absolute top-[60px] z-10 flex flex-col items-center"
        style={{ left: "50%", transform: "translateX(-50%)" }}
      >
        <div style={{ color: "#97ffa1", fontSize: 11, fontFamily: "Manrope, sans-serif", fontWeight: 700, letterSpacing: 1, textAlign: "center" }}>
          GREEN<br />ORB
        </div>
      </div>

      {NAV_ITEMS.map((item) => {
        const isActive = active === item.id;
        const color = isActive ? "#97ffa1" : "white";

        return (
          <button
            key={item.id}
            onClick={() => {
              if (item.external) {
                window.open(item.external, "_blank");
              } else {
                onSelect(item.id);
              }
            }}
            className="relative flex flex-col items-center w-full cursor-pointer z-10"
            style={{ gap: 0 }}
          >
            <div style={{ width: 24, height: 24, flexShrink: 0, position: "relative" }}>
              <svg
                fill="none"
                viewBox={item.viewBox}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              >
                <path d={sidebarPaths[item.pathKey]} fill={color} />
              </svg>
            </div>

            {item.multiLine ? (
              <div
                className="font-['Manrope',sans-serif] font-normal text-[12px] text-center leading-tight"
                style={{ color }}
              >
                <p className="leading-tight mb-0">{item.multiLine[0]}</p>
                <p className="leading-tight">{item.multiLine[1]}</p>
              </div>
            ) : (
              <p
                className="font-['Manrope',sans-serif] font-normal text-[12px] text-center leading-normal"
                style={{ color }}
              >
                {item.label}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  // For drill-down navigation — company ID and report ID state
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);

  const navigateToCompany = (id: number) => {
    setSelectedCompanyId(id);
    setPage("company");
  };

  const navigateToReport = (id: number) => {
    setSelectedReportId(id);
    setPage("report");
  };

  return (
    <div className="flex w-full min-h-screen bg-[#f2f3bf]">
      {/* Sidebar — sticky left column */}
      <div className="sticky top-0 self-start h-screen shrink-0 z-50">
        <Sidebar active={page} onSelect={setPage} />
      </div>

      {/* Content area */}
      <div className="relative flex-1 overflow-auto min-h-screen">
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
            onBack={() => setPage("company")}
          />
        )}
        {page === "upload" && <UploadScreen />}
      </div>
    </div>
  );
}
```

---

## STEP 2 — CREATE `src/screens/` DIRECTORY

Create all screen files here. These use the existing `src/components/ui/` components directly.

---

### `src/screens/Dashboard.tsx`

```tsx
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts";

interface DashboardProps {
  onNavigateToDirectory: () => void;
  onNavigateToCompany: (id: number) => void;
}

interface Stats {
  total_companies: number;
  total_reports: number;
  total_flags: number;
  total_metrics: number;
  recent_flags: Array<{
    id: number;
    company_name: string;
    company_id: number;
    metric_name: string;
    severity: string;
    flag_type: string;
    year: number;
  }>;
  sector_breakdown: Array<{ sector: string; count: number }>;
}

const chartConfig = {
  count: { label: "Companies", color: "#97ffa1" },
};

export default function DashboardScreen({ onNavigateToDirectory, onNavigateToCompany }: DashboardProps) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:5000/api/esg/stats")
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => {
        // Graceful fallback with placeholder data
        setStats({
          total_companies: 0,
          total_reports: 0,
          total_flags: 0,
          total_metrics: 0,
          recent_flags: [],
          sector_breakdown: [],
        });
        setLoading(false);
      });
  }, []);

  const STAT_CARDS = [
    { label: "Companies Indexed", value: stats?.total_companies ?? "—", color: "text-black" },
    { label: "Reports Parsed", value: stats?.total_reports ?? "—", color: "text-black" },
    { label: "Metrics Extracted", value: stats?.total_metrics ?? "—", color: "text-black" },
    { label: "Audit Flags", value: stats?.total_flags ?? "—", color: stats?.total_flags ? "text-red-600" : "text-black" },
  ];

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-['Oxygen',sans-serif] text-[32px] font-bold text-black leading-tight">
          ESG Intelligence
        </h1>
        <p className="font-['Manrope',sans-serif] text-[15px] text-[#42434b] mt-1">
          Automated discovery, extraction and auditing of corporate sustainability reports.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {STAT_CARDS.map(card => (
          <Card key={card.label} className="bg-white border-black/10 shadow-none rounded-2xl">
            <CardContent className="pt-6 pb-6">
              <div className={`font-['Oxygen',sans-serif] text-[36px] font-bold ${card.color}`}>
                {loading ? "—" : card.value}
              </div>
              <p className="font-['Manrope',sans-serif] text-[13px] text-[#42434b] mt-1">
                {card.label}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent audit flags */}
        <Card className="bg-white border-black/10 shadow-none rounded-2xl">
          <CardHeader>
            <CardTitle className="font-['Oxygen',sans-serif] text-[18px] font-bold text-black">
              Recent Audit Flags
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-[#42434b] text-sm">Loading...</p>
            ) : stats?.recent_flags.length === 0 ? (
              <p className="text-[#42434b] text-sm">No flags detected yet.</p>
            ) : (
              <div className="space-y-3">
                {stats?.recent_flags.slice(0, 5).map(flag => (
                  <div
                    key={flag.id}
                    className="flex items-start justify-between gap-3 cursor-pointer hover:bg-[#f2f3bf]/60 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
                    onClick={() => onNavigateToCompany(flag.company_id)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-['Manrope',sans-serif] text-[13px] font-semibold text-black truncate">
                        {flag.company_name}
                      </p>
                      <p className="font-['Manrope',sans-serif] text-[12px] text-[#42434b]">
                        {flag.metric_name} · {flag.year}
                      </p>
                    </div>
                    <Badge
                      variant={flag.severity === "high" ? "destructive" : "outline"}
                      className="shrink-0 text-[11px]"
                    >
                      {flag.severity}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sector breakdown chart */}
        <Card className="bg-white border-black/10 shadow-none rounded-2xl">
          <CardHeader>
            <CardTitle className="font-['Oxygen',sans-serif] text-[18px] font-bold text-black">
              Companies by Sector
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.sector_breakdown && stats.sector_breakdown.length > 0 ? (
              <ChartContainer config={chartConfig} className="h-[180px] w-full">
                <BarChart data={stats.sector_breakdown} layout="vertical">
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="sector" tick={{ fontSize: 11 }} width={80} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="#97ffa1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[180px] flex items-center justify-center">
                <p className="text-[#42434b] text-sm">No sector data yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* CTA */}
      <div className="mt-8">
        <Button
          onClick={onNavigateToDirectory}
          className="bg-black text-[#97ffa1] hover:bg-black/80 font-['Manrope',sans-serif] rounded-xl px-6"
        >
          Browse ESG Directory →
        </Button>
      </div>
    </div>
  );
}
```

---

### `src/screens/ESGDirectory.tsx`

```tsx
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DirectoryProps {
  onSelectCompany: (id: number) => void;
}

interface Company {
  id: number;
  name: string;
  ticker?: string;
  sector?: string;
  country?: string;
  report_count?: number;
  latest_year?: number;
  greendex_score?: number;
  flag_count?: number;
}

const SECTORS = ["All", "Energy", "Materials", "Industrials", "Technology", "Financial", "Consumer", "Healthcare"];

export default function DirectoryScreen({ onSelectCompany }: DirectoryProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("All");

  useEffect(() => {
    fetch("http://localhost:5000/api/companies")
      .then(r => r.json())
      .then(d => { setCompanies(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = companies.filter(c => {
    const matchSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.ticker || "").toLowerCase().includes(search.toLowerCase());
    const matchSector = sector === "All" || c.sector === sector;
    return matchSearch && matchSector;
  });

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-['Oxygen',sans-serif] text-[32px] font-bold text-black">
          ESG Report Directory
        </h1>
        <p className="font-['Manrope',sans-serif] text-[15px] text-[#42434b] mt-1">
          {companies.length} companies indexed · automated report discovery and metric extraction
        </p>
      </div>

      {/* Search + filter */}
      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search company or ticker..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 px-4 py-2.5 rounded-xl border border-black/20 bg-white font-['Manrope',sans-serif] text-[14px] text-black placeholder:text-[#42434b]/50 focus:outline-none focus:ring-2 focus:ring-black/20"
        />
        <select
          value={sector}
          onChange={e => setSector(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-black/20 bg-white font-['Manrope',sans-serif] text-[14px] text-black focus:outline-none focus:ring-2 focus:ring-black/20"
        >
          {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <p className="font-['Manrope',sans-serif] text-[#42434b]">Loading directory...</p>
      ) : (
        <Card className="bg-white border-black/10 shadow-none rounded-2xl overflow-hidden">
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-black/10">
                  <th className="text-left px-6 py-4 font-['Manrope',sans-serif] text-[12px] font-semibold text-[#42434b] uppercase tracking-wider">Company</th>
                  <th className="text-left px-6 py-4 font-['Manrope',sans-serif] text-[12px] font-semibold text-[#42434b] uppercase tracking-wider">Sector</th>
                  <th className="text-left px-6 py-4 font-['Manrope',sans-serif] text-[12px] font-semibold text-[#42434b] uppercase tracking-wider">Reports</th>
                  <th className="text-left px-6 py-4 font-['Manrope',sans-serif] text-[12px] font-semibold text-[#42434b] uppercase tracking-wider">Latest</th>
                  <th className="text-left px-6 py-4 font-['Manrope',sans-serif] text-[12px] font-semibold text-[#42434b] uppercase tracking-wider">Score</th>
                  <th className="text-left px-6 py-4 font-['Manrope',sans-serif] text-[12px] font-semibold text-[#42434b] uppercase tracking-wider">Flags</th>
                  <th className="px-6 py-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 font-['Manrope',sans-serif] text-[#42434b]">
                      No companies found.
                    </td>
                  </tr>
                ) : filtered.map(company => (
                  <tr
                    key={company.id}
                    className="hover:bg-[#f2f3bf]/40 transition-colors cursor-pointer"
                    onClick={() => onSelectCompany(company.id)}
                  >
                    <td className="px-6 py-4">
                      <p className="font-['Manrope',sans-serif] text-[14px] font-semibold text-black">{company.name}</p>
                      {company.ticker && (
                        <p className="font-['Manrope',sans-serif] text-[12px] text-[#42434b]">{company.ticker}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 font-['Manrope',sans-serif] text-[13px] text-[#42434b]">
                      {company.sector || "—"}
                    </td>
                    <td className="px-6 py-4 font-['Manrope',sans-serif] text-[13px] text-black">
                      {company.report_count || 0}
                    </td>
                    <td className="px-6 py-4 font-['Manrope',sans-serif] text-[13px] text-black">
                      {company.latest_year || "—"}
                    </td>
                    <td className="px-6 py-4">
                      {company.greendex_score != null ? (
                        <span className={`font-['Manrope',sans-serif] text-[14px] font-bold ${
                          company.greendex_score >= 70 ? "text-green-600" :
                          company.greendex_score >= 40 ? "text-amber-600" : "text-red-600"
                        }`}>
                          {company.greendex_score}
                        </span>
                      ) : <span className="text-[#42434b] text-[13px]">—</span>}
                    </td>
                    <td className="px-6 py-4">
                      {(company.flag_count || 0) > 0 ? (
                        <Badge variant="destructive" className="text-[11px]">
                          🚩 {company.flag_count}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[11px] text-green-600 border-green-200">
                          ✓ Clean
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="font-['Manrope',sans-serif] text-[12px] text-black hover:bg-[#f2f3bf]"
                        onClick={e => { e.stopPropagation(); onSelectCompany(company.id); }}
                      >
                        Audit →
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

---

### `src/screens/AuditFlags.tsx`

```tsx
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AuditProps {
  onSelectCompany: (id: number) => void;
}

interface Flag {
  id: number;
  company_id: number;
  company_name: string;
  metric_name: string;
  flag_type: string;
  severity: "high" | "medium" | "low";
  year: number;
  description: string;
  source_page?: number;
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

const FLAG_TYPE_LABEL: Record<string, string> = {
  restatement: "Restatement",
  missing_metric: "Missing Metric",
  unit_mismatch: "Unit Mismatch",
  statistical_outlier: "Statistical Outlier",
  disclosure_gap: "Disclosure Gap",
};

export default function AuditScreen({ onSelectCompany }: AuditProps) {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");

  useEffect(() => {
    fetch("http://localhost:5000/api/esg/flags")
      .then(r => r.json())
      .then(d => { setFlags(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = flags
    .filter(f => filter === "all" || f.severity === filter)
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const counts = {
    all: flags.length,
    high: flags.filter(f => f.severity === "high").length,
    medium: flags.filter(f => f.severity === "medium").length,
    low: flags.filter(f => f.severity === "low").length,
  };

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="font-['Oxygen',sans-serif] text-[32px] font-bold text-black">Audit Flags</h1>
        <p className="font-['Manrope',sans-serif] text-[15px] text-[#42434b] mt-1">
          Automatically detected inconsistencies, restatements, and data integrity issues.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {(["all", "high", "medium", "low"] as const).map(sev => (
          <Card
            key={sev}
            className={`bg-white border shadow-none rounded-2xl cursor-pointer transition-all ${
              filter === sev ? "border-black ring-2 ring-black/10" : "border-black/10 hover:border-black/30"
            }`}
            onClick={() => setFilter(sev)}
          >
            <CardContent className="pt-5 pb-5 text-center">
              <div className={`font-['Oxygen',sans-serif] text-[28px] font-bold ${
                sev === "high" ? "text-red-600" :
                sev === "medium" ? "text-amber-600" :
                sev === "low" ? "text-[#42434b]" : "text-black"
              }`}>
                {counts[sev]}
              </div>
              <p className="font-['Manrope',sans-serif] text-[12px] text-[#42434b] capitalize mt-1">
                {sev === "all" ? "Total Flags" : `${sev} severity`}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Flags list */}
      {loading ? (
        <p className="font-['Manrope',sans-serif] text-[#42434b]">Loading flags...</p>
      ) : filtered.length === 0 ? (
        <Card className="bg-white border-black/10 shadow-none rounded-2xl">
          <CardContent className="py-16 text-center">
            <p className="font-['Manrope',sans-serif] text-[15px] text-[#42434b]">
              {filter === "all" ? "No audit flags detected." : `No ${filter} severity flags.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(flag => (
            <div
              key={flag.id}
              className={`bg-white rounded-2xl border px-6 py-4 cursor-pointer hover:shadow-sm transition-all ${
                flag.severity === "high" ? "border-red-200 hover:border-red-300" :
                flag.severity === "medium" ? "border-amber-200 hover:border-amber-300" :
                "border-black/10 hover:border-black/20"
              }`}
              onClick={() => onSelectCompany(flag.company_id)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge
                      variant={flag.severity === "high" ? "destructive" : "outline"}
                      className="text-[11px]"
                    >
                      {flag.severity === "high" ? "🚩" : flag.severity === "medium" ? "⚠️" : "ℹ️"} {flag.severity.toUpperCase()}
                    </Badge>
                    <span className="font-['Manrope',sans-serif] text-[12px] text-[#42434b] bg-[#f2f3bf] px-2 py-0.5 rounded">
                      {FLAG_TYPE_LABEL[flag.flag_type] ?? flag.flag_type}
                    </span>
                    <span className="font-['Manrope',sans-serif] text-[12px] text-[#42434b]">
                      {flag.year}
                    </span>
                    {flag.source_page && (
                      <span className="font-['Manrope',sans-serif] text-[12px] text-[#42434b]">
                        p.{flag.source_page}
                      </span>
                    )}
                  </div>
                  <p className="font-['Manrope',sans-serif] text-[14px] font-semibold text-black">
                    {flag.company_name} — {flag.metric_name}
                  </p>
                  <p className="font-['Manrope',sans-serif] text-[13px] text-[#42434b] mt-0.5">
                    {flag.description}
                  </p>
                </div>
                <span className="font-['Manrope',sans-serif] text-[12px] text-[#42434b] shrink-0 mt-1">
                  View company →
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### `src/screens/CompanyProfile.tsx`

```tsx
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";

interface CompanyProfileProps {
  companyId: number | null;
  onSelectReport: (id: number) => void;
  onBack: () => void;
}

interface CompanyDetail {
  id: number;
  name: string;
  ticker?: string;
  sector?: string;
  country?: string;
  greendex_score?: number;
  documents: Array<{ id: number; reporting_year: number; title: string; source_url: string }>;
  flags: Array<{
    id: number; flag_type: string; metric_name: string;
    year: number; description: string; severity: string; source_page?: number;
  }>;
  metrics: Array<{
    metric_name: string; unit: string;
    values: Array<{ year: number; value: number }>;
  }>;
}

const chartConfig = { value: { label: "Value", color: "#97ffa1" } };

export default function CompanyScreen({ companyId, onSelectReport, onBack }: CompanyProfileProps) {
  const [data, setData] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "flags" | "metrics" | "reports">("overview");
  const [selectedMetric, setSelectedMetric] = useState("");

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetch(`http://localhost:5000/api/esg/company/${companyId}/audit`)
      .then(r => r.json())
      .then(d => {
        setData(d);
        setSelectedMetric(d.metrics?.[0]?.metric_name || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [companyId]);

  if (loading) return <div className="p-8 font-['Manrope',sans-serif] text-[#42434b]">Loading company...</div>;
  if (!data) return <div className="p-8 font-['Manrope',sans-serif] text-[#42434b]">Company not found.</div>;

  const chartData = data.metrics
    ?.find(m => m.metric_name === selectedMetric)
    ?.values.map(v => ({ year: String(v.year), value: v.value })) || [];

  const TABS = ["overview", "flags", "metrics", "reports"] as const;

  return (
    <div className="p-8 max-w-4xl">
      {/* Back */}
      <button
        onClick={onBack}
        className="font-['Manrope',sans-serif] text-[13px] text-[#42434b] hover:text-black mb-6 flex items-center gap-1"
      >
        ← Back to Directory
      </button>

      {/* Company header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-['Oxygen',sans-serif] text-[32px] font-bold text-black">{data.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            {data.ticker && <span className="font-['Manrope',sans-serif] text-[14px] text-[#42434b]">{data.ticker}</span>}
            {data.sector && (
              <span className="font-['Manrope',sans-serif] text-[12px] bg-[#f2f3bf] border border-black/10 px-2.5 py-1 rounded-lg text-black">
                {data.sector}
              </span>
            )}
            {data.country && <span className="font-['Manrope',sans-serif] text-[13px] text-[#42434b]">{data.country}</span>}
          </div>
        </div>
        {data.greendex_score != null && (
          <div className="text-right">
            <div className={`font-['Oxygen',sans-serif] text-[48px] font-bold leading-none ${
              data.greendex_score >= 70 ? "text-green-600" :
              data.greendex_score >= 40 ? "text-amber-600" : "text-red-600"
            }`}>
              {data.greendex_score}
            </div>
            <p className="font-['Manrope',sans-serif] text-[12px] text-[#42434b] mt-1">Greendex Score</p>
          </div>
        )}
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Reports", value: data.documents?.length ?? 0 },
          { label: "High Flags", value: data.flags?.filter(f => f.severity === "high").length ?? 0 },
          { label: "Total Flags", value: data.flags?.length ?? 0 },
          { label: "Metrics", value: data.metrics?.length ?? 0 },
        ].map(s => (
          <Card key={s.label} className="bg-white border-black/10 shadow-none rounded-xl">
            <CardContent className="pt-4 pb-4 text-center">
              <div className="font-['Oxygen',sans-serif] text-[24px] font-bold text-black">{s.value}</div>
              <p className="font-['Manrope',sans-serif] text-[12px] text-[#42434b]">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-black/10">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 font-['Manrope',sans-serif] text-[13px] capitalize border-b-2 transition-colors ${
              tab === t
                ? "border-black text-black font-semibold"
                : "border-transparent text-[#42434b] hover:text-black"
            }`}
          >
            {t}
            {t === "flags" && (data.flags?.length ?? 0) > 0 && (
              <span className="ml-1.5 text-[11px] bg-red-100 text-red-600 rounded px-1.5 py-0.5">
                {data.flags.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {tab === "overview" && (
        <Card className="bg-white border-black/10 shadow-none rounded-2xl">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4 text-sm font-['Manrope',sans-serif]">
              {[
                ["Company", data.name],
                ["Ticker", data.ticker || "N/A"],
                ["Sector", data.sector || "N/A"],
                ["Country", data.country || "N/A"],
                ["Reports Indexed", String(data.documents?.length ?? 0)],
                ["Latest Report Year", data.documents?.[0]?.reporting_year ? String(data.documents[0].reporting_year) : "N/A"],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="text-[#42434b] text-[12px]">{label}</p>
                  <p className="text-black font-semibold mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab: Flags */}
      {tab === "flags" && (
        <div className="space-y-3">
          {data.flags?.length === 0 ? (
            <Card className="bg-white border-black/10 shadow-none rounded-2xl">
              <CardContent className="py-12 text-center">
                <p className="font-['Manrope',sans-serif] text-[#42434b]">✓ No audit flags detected.</p>
              </CardContent>
            </Card>
          ) : data.flags.map(flag => (
            <div
              key={flag.id}
              className={`bg-white rounded-2xl border px-5 py-4 ${
                flag.severity === "high" ? "border-red-200" :
                flag.severity === "medium" ? "border-amber-200" : "border-black/10"
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <Badge variant={flag.severity === "high" ? "destructive" : "outline"} className="text-[11px]">
                  {flag.severity.toUpperCase()}
                </Badge>
                <span className="font-['Manrope',sans-serif] text-[11px] bg-[#f2f3bf] px-2 py-0.5 rounded text-black">
                  {flag.flag_type.replace(/_/g, " ")}
                </span>
                <span className="font-['Manrope',sans-serif] text-[12px] text-[#42434b]">{flag.year}</span>
                {flag.source_page && (
                  <span className="font-['Manrope',sans-serif] text-[12px] text-[#42434b]">p.{flag.source_page}</span>
                )}
              </div>
              <p className="font-['Manrope',sans-serif] text-[14px] font-semibold text-black">{flag.metric_name}</p>
              <p className="font-['Manrope',sans-serif] text-[13px] text-[#42434b] mt-0.5">{flag.description}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tab: Metrics */}
      {tab === "metrics" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              value={selectedMetric}
              onChange={e => setSelectedMetric(e.target.value)}
              className="px-3 py-2 rounded-xl border border-black/20 bg-white font-['Manrope',sans-serif] text-[13px] text-black focus:outline-none"
            >
              {data.metrics?.map(m => (
                <option key={m.metric_name} value={m.metric_name}>{m.metric_name}</option>
              ))}
            </select>
            {data.metrics?.find(m => m.metric_name === selectedMetric)?.unit && (
              <span className="font-['Manrope',sans-serif] text-[12px] text-[#42434b]">
                Unit: {data.metrics.find(m => m.metric_name === selectedMetric)?.unit}
              </span>
            )}
          </div>
          {chartData.length > 0 ? (
            <Card className="bg-white border-black/10 shadow-none rounded-2xl">
              <CardContent className="pt-6">
                <ChartContainer config={chartConfig} className="h-[200px] w-full">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="year" tick={{ fontSize: 12, fontFamily: "Manrope" }} />
                    <YAxis tick={{ fontSize: 12, fontFamily: "Manrope" }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line type="monotone" dataKey="value" stroke="#000" strokeWidth={2} dot={{ fill: "#97ffa1", stroke: "#000", r: 4 }} />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-white border-black/10 shadow-none rounded-2xl">
              <CardContent className="py-12 text-center">
                <p className="font-['Manrope',sans-serif] text-[#42434b]">No trend data available.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Tab: Reports */}
      {tab === "reports" && (
        <div className="space-y-2">
          {data.documents?.length === 0 ? (
            <Card className="bg-white border-black/10 shadow-none rounded-2xl">
              <CardContent className="py-12 text-center">
                <p className="font-['Manrope',sans-serif] text-[#42434b]">No reports indexed yet.</p>
              </CardContent>
            </Card>
          ) : data.documents.map(doc => (
            <div
              key={doc.id}
              className="flex items-center justify-between bg-white border border-black/10 rounded-xl px-5 py-3.5 hover:border-black/20 transition-colors"
            >
              <div>
                <p className="font-['Manrope',sans-serif] text-[14px] font-semibold text-black">
                  {doc.title || `${data.name} Sustainability Report ${doc.reporting_year}`}
                </p>
                <p className="font-['Manrope',sans-serif] text-[12px] text-[#42434b] mt-0.5">
                  Reporting year: {doc.reporting_year}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="font-['Manrope',sans-serif] text-[12px] hover:bg-[#f2f3bf]"
                  onClick={() => onSelectReport(doc.id)}
                >
                  View extraction →
                </Button>
                {doc.source_url && (
                  <a
                    href={doc.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-['Manrope',sans-serif] text-[12px] text-[#42434b] hover:text-black"
                  >
                    PDF ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### `src/screens/ReportDetail.tsx`

```tsx
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ReportDetailProps {
  reportId: number | null;
  onBack: () => void;
}

interface ReportData {
  id: number;
  company_name: string;
  company_id: number;
  title: string;
  reporting_year: number;
  source_url: string;
  processing_status: string;
  values: Array<{
    id: number;
    metric_name: string;
    value: number | string;
    unit: string;
    extraction_confidence: number;
    source_page?: number;
  }>;
}

export default function ReportScreen({ reportId, onBack }: ReportDetailProps) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reportId) return;
    setLoading(true);
    fetch(`http://localhost:5000/api/esg/report/${reportId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [reportId]);

  if (loading) return <div className="p-8 font-['Manrope',sans-serif] text-[#42434b]">Loading report...</div>;
  if (!data) return <div className="p-8 font-['Manrope',sans-serif] text-[#42434b]">Report not found.</div>;

  return (
    <div className="p-8 max-w-4xl">
      <button
        onClick={onBack}
        className="font-['Manrope',sans-serif] text-[13px] text-[#42434b] hover:text-black mb-6 flex items-center gap-1"
      >
        ← Back to Company
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-['Oxygen',sans-serif] text-[28px] font-bold text-black leading-tight">
            {data.title || `${data.company_name} · ${data.reporting_year}`}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <span className="font-['Manrope',sans-serif] text-[12px] bg-[#f2f3bf] border border-black/10 px-2.5 py-1 rounded-lg text-black">
              {data.reporting_year}
            </span>
            <Badge variant={data.processing_status === "completed" ? "outline" : "secondary"} className="text-[11px]">
              {data.processing_status}
            </Badge>
            <span className="font-['Manrope',sans-serif] text-[13px] text-[#42434b]">
              {data.values?.length ?? 0} metrics extracted
            </span>
          </div>
        </div>
        {data.source_url && (
          <a
            href={data.source_url}
            target="_blank"
            rel="noreferrer"
            className="font-['Manrope',sans-serif] text-[13px] border border-black/20 px-4 py-2 rounded-xl hover:bg-[#f2f3bf] transition-colors text-black"
          >
            View PDF ↗
          </a>
        )}
      </div>

      <Card className="bg-white border-black/10 shadow-none rounded-2xl overflow-hidden">
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-black/10">
                <th className="text-left px-6 py-4 font-['Manrope',sans-serif] text-[12px] font-semibold text-[#42434b] uppercase tracking-wider">Metric</th>
                <th className="text-left px-6 py-4 font-['Manrope',sans-serif] text-[12px] font-semibold text-[#42434b] uppercase tracking-wider">Value</th>
                <th className="text-left px-6 py-4 font-['Manrope',sans-serif] text-[12px] font-semibold text-[#42434b] uppercase tracking-wider">Unit</th>
                <th className="text-left px-6 py-4 font-['Manrope',sans-serif] text-[12px] font-semibold text-[#42434b] uppercase tracking-wider">Page</th>
                <th className="text-left px-6 py-4 font-['Manrope',sans-serif] text-[12px] font-semibold text-[#42434b] uppercase tracking-wider">Confidence</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {data.values?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-16 font-['Manrope',sans-serif] text-[#42434b]">
                    No extracted values yet.
                  </td>
                </tr>
              ) : data.values.map(v => (
                <tr key={v.id} className="hover:bg-[#f2f3bf]/30 transition-colors">
                  <td className="px-6 py-3.5 font-['Manrope',sans-serif] text-[14px] font-semibold text-black">{v.metric_name}</td>
                  <td className="px-6 py-3.5 font-mono text-[14px] text-black">{v.value}</td>
                  <td className="px-6 py-3.5 font-['Manrope',sans-serif] text-[13px] text-[#42434b]">{v.unit}</td>
                  <td className="px-6 py-3.5 font-['Manrope',sans-serif] text-[13px] text-[#42434b]">
                    {v.source_page ? `p.${v.source_page}` : "—"}
                  </td>
                  <td className="px-6 py-3.5">
                    <Badge
                      variant={v.extraction_confidence >= 0.85 ? "outline" : v.extraction_confidence >= 0.6 ? "secondary" : "destructive"}
                      className="text-[11px]"
                    >
                      {Math.round(v.extraction_confidence * 100)}%
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

### `src/screens/UploadReport.tsx`

```tsx
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function UploadScreen() {
  const [url, setUrl] = useState("");
  const [company, setCompany] = useState("");
  const [year, setYear] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (!url || !company) return;
    setStatus("loading");
    try {
      const res = await fetch("http://localhost:5000/api/esg/submit-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, company_name: company, reporting_year: year ? parseInt(year) : null }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus("success");
        setMessage("Report submitted for processing. It will appear in the directory once extraction is complete.");
        setUrl(""); setCompany(""); setYear("");
      } else {
        setStatus("error");
        setMessage(data.error || "Submission failed.");
      }
    } catch {
      setStatus("error");
      setMessage("Could not connect to the pipeline. Check that the backend is running.");
    }
  };

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="font-['Oxygen',sans-serif] text-[32px] font-bold text-black">Submit a Report</h1>
        <p className="font-['Manrope',sans-serif] text-[15px] text-[#42434b] mt-1">
          Provide a PDF URL and GreenOrb will automatically discover, extract, and audit the report.
        </p>
      </div>

      <Card className="bg-white border-black/10 shadow-none rounded-2xl">
        <CardContent className="pt-6 pb-6 space-y-4">
          <div>
            <label className="font-['Manrope',sans-serif] text-[13px] font-semibold text-black block mb-1.5">
              Report PDF URL *
            </label>
            <input
              type="url"
              placeholder="https://company.com/sustainability-report-2024.pdf"
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-black/20 bg-[#f2f3bf]/30 font-['Manrope',sans-serif] text-[14px] text-black placeholder:text-[#42434b]/50 focus:outline-none focus:ring-2 focus:ring-black/20"
            />
          </div>
          <div>
            <label className="font-['Manrope',sans-serif] text-[13px] font-semibold text-black block mb-1.5">
              Company Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Tata Steel"
              value={company}
              onChange={e => setCompany(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-black/20 bg-[#f2f3bf]/30 font-['Manrope',sans-serif] text-[14px] text-black placeholder:text-[#42434b]/50 focus:outline-none focus:ring-2 focus:ring-black/20"
            />
          </div>
          <div>
            <label className="font-['Manrope',sans-serif] text-[13px] font-semibold text-black block mb-1.5">
              Reporting Year (optional)
            </label>
            <input
              type="number"
              placeholder="e.g. 2024"
              value={year}
              onChange={e => setYear(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-black/20 bg-[#f2f3bf]/30 font-['Manrope',sans-serif] text-[14px] text-black placeholder:text-[#42434b]/50 focus:outline-none focus:ring-2 focus:ring-black/20"
            />
          </div>

          {status !== "idle" && (
            <div className={`px-4 py-3 rounded-xl font-['Manrope',sans-serif] text-[13px] ${
              status === "success" ? "bg-green-50 text-green-700 border border-green-200" :
              status === "error" ? "bg-red-50 text-red-700 border border-red-200" :
              "bg-[#f2f3bf] text-black"
            }`}>
              {status === "loading" ? "Submitting..." : message}
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={!url || !company || status === "loading"}
            className="w-full bg-black text-[#97ffa1] hover:bg-black/80 font-['Manrope',sans-serif] rounded-xl py-2.5 disabled:opacity-40"
          >
            {status === "loading" ? "Submitting..." : "Submit for Processing"}
          </Button>
        </CardContent>
      </Card>

      <div className="mt-6 p-4 bg-white/60 rounded-2xl border border-black/10">
        <p className="font-['Manrope',sans-serif] text-[13px] font-semibold text-black mb-2">What happens next</p>
        <ol className="space-y-1.5">
          {[
            "GreenOrb fetches and caches the PDF",
            "PyMuPDF + OCR extract all text and tables",
            "LLM maps content to GRI/SASB metric definitions",
            "Audit engine cross-checks against prior years",
            "Report appears in the ESG Directory with flags",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2 font-['Manrope',sans-serif] text-[13px] text-[#42434b]">
              <span className="text-[11px] font-bold bg-[#f2f3bf] text-black rounded px-1.5 py-0.5 mt-0.5 shrink-0">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
```

---

## STEP 3 — DELETE THESE (NO LONGER NEEDED)

Remove or keep as dead code — your choice:
- `src/imports/Home/`
- `src/imports/Home-1/`
- `src/imports/Insights/`
- `src/imports/GreenIncentivesAgents/`
- `src/imports/SmartCities/`

If Antigravity throws import errors after editing App.tsx, delete those import lines first before anything else.

---

## STEP 4 — VERIFY

Run: `npm run dev` (or `pnpm dev` if using pnpm)

Expected result:
- App loads with the same black-ellipse sidebar, `#f2f3bf` background
- Sidebar shows: Dashboard, ESG Directory, Audit, Company, Report, Upload, Globe View
- Clicking Globe View opens `http://localhost:5173` in a new tab
- All 6 GreenOrb screens render without errors (they'll show empty states until backend ESG routes exist — that's expected)
- No TypeScript errors

---

## SUMMARY — FILES CHANGED OR CREATED

```
MODIFIED:
└── src/app/App.tsx                  ← complete replacement

CREATED:
└── src/screens/
    ├── Dashboard.tsx
    ├── ESGDirectory.tsx
    ├── AuditFlags.tsx
    ├── CompanyProfile.tsx
    ├── ReportDetail.tsx
    └── UploadReport.tsx

NOT TOUCHED:
└── src/components/ui/               ← all shadcn components unchanged
└── postcss.config.mjs
└── vite.config.ts
└── package.json
└── pnpm-workspace.yaml
└── tailwind / theme CSS
```
