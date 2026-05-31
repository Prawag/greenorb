"""
GreenOrb Intelligence Platform — Streamlit Dashboard
Premium redesign with full DESIGN.md compliance.
"""

import html
import os
from datetime import datetime, timezone

import altair as alt
import folium
import pandas as pd
import requests
import streamlit as st
from folium.plugins import MarkerCluster
from streamlit_folium import st_folium

# ---------------------------------------------------------------------------
# Page Configuration
# ---------------------------------------------------------------------------
st.set_page_config(
    page_title="GreenOrb Intelligence",
    page_icon="GO",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------------
# Design System CSS — DESIGN.md compliant
# ---------------------------------------------------------------------------
st.markdown(
    """
<style>
/* ── Fonts ─────────────────────────────────────────────────── */
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

html, body, [class*="css"] {
    font-family: 'Outfit', sans-serif !important;
    color: #18181B;
}

code, .stMetricValue, [data-testid="stMetricValue"] {
    font-family: 'JetBrains Mono', monospace !important;
}

/* ── Surfaces ──────────────────────────────────────────────── */
.stApp {
    background-color: #F9FAFB;
}

/* ── Sidebar ───────────────────────────────────────────────── */
[data-testid="stSidebar"] {
    background-color: #FFFFFF;
    border-right: 1px solid rgba(226,232,240,0.5);
}
[data-testid="stSidebar"] [data-testid="stMarkdownContainer"] p {
    font-size: 0.88rem;
    color: #71717A;
}

/* ── Cards ─────────────────────────────────────────────────── */
div[data-testid="stMetric"] {
    background-color: #FFFFFF;
    padding: 1.25rem 1.5rem;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    border: 1px solid rgba(226,232,240,0.5);
    transition: all 0.2s ease;
}
div[data-testid="stMetric"]:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

div.stDataFrame {
    background-color: #FFFFFF;
    padding: 1rem;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    border: 1px solid rgba(226,232,240,0.5);
}

/* ── Tabs ──────────────────────────────────────────────────── */
button[data-baseweb="tab"] {
    font-family: 'Outfit', sans-serif !important;
    font-weight: 500;
    font-size: 0.92rem;
    color: #71717A;
    transition: all 0.2s ease;
}
button[data-baseweb="tab"][aria-selected="true"] {
    color: #10B981 !important;
    border-bottom-color: #10B981 !important;
}

/* ── Buttons ───────────────────────────────────────────────── */
.stDownloadButton button, .stButton button {
    font-family: 'Outfit', sans-serif !important;
    font-weight: 500;
    border-radius: 8px;
    border: 1px solid rgba(226,232,240,0.5);
    box-shadow: none !important;
    transition: all 0.2s ease;
}
.stDownloadButton button:hover, .stButton button:hover {
    border-color: #10B981;
    color: #10B981;
}

/* ── Section headings ─────────────────────────────────────── */
h1 { font-weight: 700 !important; letter-spacing: -0.02em; }
h2 { font-weight: 600 !important; letter-spacing: -0.01em; }
h3 { font-weight: 500 !important; color: #71717A !important; }

/* ── Hide Streamlit chrome ─────────────────────────────────── */
#MainMenu {visibility: hidden;}
footer {visibility: hidden;}
header {visibility: hidden;}
</style>
""",
    unsafe_allow_html=True,
)

# ---------------------------------------------------------------------------
# API Configuration
# ---------------------------------------------------------------------------
API_BASE = os.getenv("GREENORB_API_URL", "http://localhost:8000/api")
METRICS_URL = f"{API_BASE}/metrics"
COMPANIES_URL = f"{API_BASE}/companies"
REPORTS_URL = f"{API_BASE}/reports"

# ---------------------------------------------------------------------------
# Color Tokens (from DESIGN.md)
# ---------------------------------------------------------------------------
EMERALD = "#10B981"
CRIMSON = "#EF4444"
AMBER = "#F59E0B"
CHARCOAL = "#18181B"
STEEL = "#71717A"
SURFACE = "#FFFFFF"
CANVAS = "#F9FAFB"
WHISPER = "rgba(226,232,240,0.5)"

# ---------------------------------------------------------------------------
# Data Fetching — cached & guarded
# ---------------------------------------------------------------------------

@st.cache_data(ttl=60)
def fetch_globe_data() -> list:
    """Fetch aggregated carbon data from the FastAPI backend."""
    try:
        resp = requests.get(f"{METRICS_URL}/globe-data", timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return []


@st.cache_data(ttl=120)
def fetch_company_details(company_id: int) -> dict | None:
    """Fetch rich ESG summary for a specific company."""
    try:
        resp = requests.get(f"{METRICS_URL}/{company_id}/summary", timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return None


@st.cache_data(ttl=120)
def fetch_companies() -> list:
    """Fetch list of all companies."""
    try:
        resp = requests.get(f"{COMPANIES_URL}/", timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return []


@st.cache_data(ttl=120)
def fetch_reports(company_id: int) -> list:
    """Fetch documents / reports for a company."""
    try:
        resp = requests.get(f"{REPORTS_URL}/{company_id}", timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _emission_color(val: float) -> str:
    """Return a semantic hex color based on emission magnitude."""
    if val <= 0:
        return STEEL
    if val < 500_000:
        return EMERALD
    if val < 2_000_000:
        return AMBER
    return CRIMSON


def _folium_color(val: float) -> str:
    """Map emission value to a folium icon color name."""
    if val <= 0:
        return "gray"
    if val < 500_000:
        return "green"
    if val < 2_000_000:
        return "orange"
    return "red"


def _safe(text) -> str:
    """HTML-escape any dynamic content for popup safety."""
    return html.escape(str(text)) if text else ""


def _now_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------

def render_sidebar(data: list) -> str:
    """Render the sidebar and return the selected page name."""

    # Logo / brand area
    st.sidebar.markdown(
        "<div style='padding:0.5rem 0 1rem 0;'>"
        "<span style='font-family:Outfit,sans-serif;font-weight:700;font-size:1.5rem;"
        "color:#10B981;letter-spacing:-0.03em;'>GreenOrb</span>"
        "<br/>"
        "<span style='font-family:Outfit,sans-serif;font-weight:400;font-size:0.78rem;"
        "color:#71717A;letter-spacing:0.04em;text-transform:uppercase;'>"
        "Intelligence Platform</span>"
        "</div>",
        unsafe_allow_html=True,
    )

    st.sidebar.markdown("---")

    # Navigation
    page = st.sidebar.radio(
        "Navigate",
        [
            "Global Corporate Map",
            "Smart City Dashboard",
            "Company Intelligence",
            "Data Pipeline Status",
        ],
        label_visibility="collapsed",
    )

    st.sidebar.markdown("---")

    # Sidebar quick metrics
    if data:
        df = pd.DataFrame(data)
        total = len(df)
        extracted = int((df.get("total_emissions", pd.Series(dtype="float64")) > 0).sum())
        pending = total - extracted
        st.sidebar.metric("Companies Tracked", f"{total}")
        st.sidebar.metric("Data Extracted", f"{extracted}")
        st.sidebar.metric("Pending Extraction", f"{pending}")
    else:
        st.sidebar.warning("Backend offline")

    st.sidebar.markdown("---")

    # Timestamp
    st.sidebar.caption(f"Last refreshed: {_now_stamp()}")

    return page


# ═══════════════════════════════════════════════════════════════════════════
# PAGE 1 — Global Corporate Map
# ═══════════════════════════════════════════════════════════════════════════

def page_global_map(data: list):
    st.markdown(
        "<h1 style='margin-bottom:0;'>Global Corporate Footprint</h1>",
        unsafe_allow_html=True,
    )
    st.markdown(
        "<p style='color:#71717A;margin-top:0.25rem;margin-bottom:1.5rem;'>"
        "Spatial view of tracked operations and emissions intensity</p>",
        unsafe_allow_html=True,
    )

    if not data:
        st.info("No spatial data available. Ensure the backend is running.")
        return

    try:
        # Asymmetric layout: map (3) + legend/export (1)
        col_map, col_side = st.columns([3, 1])

        with col_map:
            m = folium.Map(
                location=[20.0, 0.0],
                zoom_start=2,
                tiles="CartoDB positron",
            )
            cluster = MarkerCluster().add_to(m)

            for fac in data:
                lat = fac.get("lat")
                lng = fac.get("lng")
                if lat is None or lng is None:
                    continue

                emissions = fac.get("total_emissions", 0) or 0
                name = _safe(fac.get("name", "Unknown"))
                industry = _safe(fac.get("industry", "Unknown"))
                country = _safe(fac.get("country", "USA"))

                if emissions > 0:
                    fmt_em = f"{emissions:,.0f} MT CO2e"
                else:
                    fmt_em = "Pending Extraction"

                color_hex = _emission_color(emissions)
                popup_html = (
                    f"<div style=\"font-family:'Outfit',sans-serif;min-width:200px;\">"
                    f"<h4 style='margin:0 0 4px 0;color:#18181B;'>{name}</h4>"
                    f"<p style='margin:0 0 8px 0;color:#71717A;font-size:12px;'>"
                    f"{industry} &middot; {country}</p>"
                    f"<hr style='border:none;border-top:1px solid rgba(226,232,240,0.5);margin:6px 0;'/>"
                    f"<p style='margin:0;color:{color_hex};font-size:15px;font-weight:600;"
                    f"font-family:JetBrains Mono,monospace;'>{_safe(fmt_em)}</p>"
                    f"</div>"
                )

                folium.Marker(
                    location=[lat, lng],
                    popup=folium.Popup(popup_html, max_width=300),
                    tooltip=name,
                    icon=folium.Icon(
                        color=_folium_color(emissions),
                        icon="industry",
                        prefix="fa",
                    ),
                ).add_to(cluster)

            st_folium(m, height=600, use_container_width=True, returned_objects=[])

        with col_side:
            st.markdown("### Legend")
            st.markdown(
                f"<div style='line-height:2;'>"
                f"<span style='color:{EMERALD};font-weight:600;'>&#9679;</span> &lt; 500k MT<br/>"
                f"<span style='color:{AMBER};font-weight:600;'>&#9679;</span> 500k – 2M MT<br/>"
                f"<span style='color:{CRIMSON};font-weight:600;'>&#9679;</span> &gt; 2M MT<br/>"
                f"<span style='color:{STEEL};font-weight:600;'>&#9679;</span> Pending</div>",
                unsafe_allow_html=True,
            )

            st.markdown("<br/>", unsafe_allow_html=True)

            # CSV Export
            df_export = pd.DataFrame(data)
            csv_bytes = df_export.to_csv(index=False).encode("utf-8")
            st.download_button(
                label="Export Map Data (CSV)",
                data=csv_bytes,
                file_name="greenorb_map_data.csv",
                mime="text/csv",
            )

    except Exception as exc:
        st.error(f"Map rendering error: {exc}")


# ═══════════════════════════════════════════════════════════════════════════
# PAGE 2 — Smart City Dashboard
# ═══════════════════════════════════════════════════════════════════════════

def page_smart_city(data: list):
    st.markdown(
        "<h1 style='margin-bottom:0;'>Smart City Dashboard</h1>",
        unsafe_allow_html=True,
    )
    st.markdown(
        "<p style='color:#71717A;margin-top:0.25rem;margin-bottom:1.5rem;'>"
        "Macro-level analysis of tracked corporate emissions</p>",
        unsafe_allow_html=True,
    )

    if not data:
        st.info("No aggregate data available.")
        return

    try:
        df = pd.DataFrame(data)

        # Ensure total_emissions column exists
        if "total_emissions" not in df.columns:
            df["total_emissions"] = 0

        total_companies = len(df)
        total_emissions = df["total_emissions"].sum()
        reporting = df[df["total_emissions"] > 0]
        avg_emissions = reporting["total_emissions"].mean() if len(reporting) > 0 else 0
        extraction_rate = (len(reporting) / total_companies * 100) if total_companies > 0 else 0

        # ── KPIs — Asymmetric [2, 1] ────────────────────────────
        col_main, col_accent = st.columns([2, 1])

        with col_main:
            k1, k2 = st.columns(2)
            with k1:
                st.metric("Total Companies Tracked", f"{total_companies}")
            with k2:
                st.metric(
                    "Aggregate Scope 1+2 Emissions",
                    f"{total_emissions:,.0f} MT",
                )

        with col_accent:
            st.metric("Avg Emissions per Entity", f"{avg_emissions:,.0f} MT")
            st.metric("Extraction Rate", f"{extraction_rate:.1f}%")

        st.markdown("<div style='height:2rem;'></div>", unsafe_allow_html=True)

        # ── Charts — Asymmetric [3, 1] ──────────────────────────
        col_chart, col_status = st.columns([3, 1])

        with col_chart:
            st.markdown("### Top Emitting Industries")

            if "industry" in df.columns:
                industry_df = (
                    df.groupby("industry", as_index=False)["total_emissions"]
                    .sum()
                    .sort_values("total_emissions", ascending=False)
                    .head(10)
                )
                industry_df = industry_df[industry_df["total_emissions"] > 0]

                if not industry_df.empty:
                    chart = (
                        alt.Chart(industry_df)
                        .mark_bar(cornerRadiusTopLeft=6, cornerRadiusTopRight=6)
                        .encode(
                            x=alt.X(
                                "total_emissions:Q",
                                title="Total Emissions (MT CO2e)",
                                axis=alt.Axis(format="~s"),
                            ),
                            y=alt.Y(
                                "industry:N",
                                sort="-x",
                                title=None,
                            ),
                            color=alt.value(EMERALD),
                            tooltip=[
                                alt.Tooltip("industry:N", title="Industry"),
                                alt.Tooltip(
                                    "total_emissions:Q",
                                    title="Emissions (MT)",
                                    format=",.0f",
                                ),
                            ],
                        )
                        .properties(height=360)
                        .configure_axis(
                            labelFont="Outfit",
                            titleFont="Outfit",
                            labelColor=STEEL,
                            titleColor=CHARCOAL,
                        )
                        .configure_view(strokeWidth=0)
                    )
                    st.altair_chart(chart, use_container_width=True)
                else:
                    st.info("Awaiting extraction data for industries.")
            else:
                st.info("Industry data not available.")

        with col_status:
            st.markdown("### Extraction Status")

            extracted_count = int((df["total_emissions"] > 0).sum())
            pending_count = int((df["total_emissions"] == 0).sum())

            status_df = pd.DataFrame(
                {
                    "Status": ["Extracted", "Pending"],
                    "Count": [extracted_count, pending_count],
                    "Color": [EMERALD, AMBER],
                }
            )

            donut = (
                alt.Chart(status_df)
                .mark_arc(innerRadius=45, outerRadius=75, cornerRadius=4)
                .encode(
                    theta=alt.Theta("Count:Q"),
                    color=alt.Color(
                        "Status:N",
                        scale=alt.Scale(
                            domain=["Extracted", "Pending"],
                            range=[EMERALD, AMBER],
                        ),
                        legend=alt.Legend(
                            orient="bottom",
                            titleFontSize=0,
                            labelFont="Outfit",
                            labelColor=STEEL,
                        ),
                    ),
                    tooltip=[
                        alt.Tooltip("Status:N"),
                        alt.Tooltip("Count:Q"),
                    ],
                )
                .properties(height=220, width=220)
                .configure_view(strokeWidth=0)
            )
            st.altair_chart(donut, use_container_width=True)

        st.markdown("<div style='height:1rem;'></div>", unsafe_allow_html=True)

        # CSV export
        csv_bytes = df.to_csv(index=False).encode("utf-8")
        st.download_button(
            label="Export Dashboard Data (CSV)",
            data=csv_bytes,
            file_name="greenorb_dashboard.csv",
            mime="text/csv",
        )

    except Exception as exc:
        st.error(f"Dashboard rendering error: {exc}")


# ═══════════════════════════════════════════════════════════════════════════
# PAGE 3 — Company Intelligence
# ═══════════════════════════════════════════════════════════════════════════

def page_company_intelligence(data: list):
    st.markdown(
        "<h1 style='margin-bottom:0;'>Company Intelligence</h1>",
        unsafe_allow_html=True,
    )
    st.markdown(
        "<p style='color:#71717A;margin-top:0.25rem;margin-bottom:1.5rem;'>"
        "Deep dive into corporate ESG metrics and risk profiles</p>",
        unsafe_allow_html=True,
    )

    if not data:
        st.info("No company data available.")
        return

    try:
        df = pd.DataFrame(data)

        if "name" not in df.columns:
            st.error("Company name field missing from API response.")
            return

        # Company Selector
        company_name = st.selectbox(
            "Select a Company",
            sorted(df["name"].dropna().unique()),
            label_visibility="collapsed",
            placeholder="Search for a company...",
        )

        matches = df[df["name"] == company_name]
        if matches.empty:
            st.warning("No matching company found.")
            return

        selected = matches.iloc[0]
        company_id = selected.get("id")
        company_industry = selected.get("industry", "Unknown")
        company_country = selected.get("country", "USA")
        company_emissions = selected.get("total_emissions", 0) or 0

        # ── Header card — asymmetric [3, 1] ─────────────────────
        col_info, col_stat = st.columns([3, 1])

        with col_info:
            st.markdown(
                f"<div style='background:#FFF;padding:1.5rem;border-radius:12px;"
                f"border:1px solid rgba(226,232,240,0.5);"
                f"box-shadow:0 1px 3px rgba(0,0,0,0.05);'>"
                f"<h2 style='margin:0 0 0.25rem 0;'>{_safe(company_name)}</h2>"
                f"<p style='margin:0;color:#71717A;'>"
                f"{_safe(company_industry)} &middot; {_safe(company_country)}</p>"
                f"</div>",
                unsafe_allow_html=True,
            )

        with col_stat:
            em_color = _emission_color(company_emissions)
            em_label = f"{company_emissions:,.0f} MT" if company_emissions > 0 else "Pending"
            st.markdown(
                f"<div style='background:#FFF;padding:1.5rem;border-radius:12px;"
                f"border:1px solid rgba(226,232,240,0.5);"
                f"box-shadow:0 1px 3px rgba(0,0,0,0.05);text-align:center;'>"
                f"<p style='margin:0;color:#71717A;font-size:0.8rem;'>Total Emissions</p>"
                f"<p style='margin:0.25rem 0 0 0;font-family:JetBrains Mono,monospace;"
                f"font-size:1.3rem;font-weight:600;color:{em_color};'>{_safe(em_label)}</p>"
                f"</div>",
                unsafe_allow_html=True,
            )

        st.markdown("<div style='height:1rem;'></div>", unsafe_allow_html=True)

        # Fetch detailed ESG metrics
        if company_id is None:
            st.warning("Company ID unavailable.")
            return

        with st.spinner("Fetching ESG semantic metrics..."):
            details = fetch_company_details(int(company_id))

        if not details:
            st.warning("Could not load detailed metrics. The company may not have extracted data yet.")
            return

        # ── E / S / G tabs ──────────────────────────────────────
        tab_e, tab_s, tab_g = st.tabs(["Environmental", "Social", "Governance"])

        def render_metrics_table(metrics_list: list, category: str):
            """Render a styled metrics table for an ESG category."""
            if not metrics_list:
                st.info(f"No {category} metrics extracted yet.")
                return

            rows = []
            for m in metrics_list:
                source_ctx = m.get("source_context", "") or ""
                truncated = (source_ctx[:120] + "...") if len(source_ctx) > 120 else source_ctx

                confidence = m.get("confidence")
                conf_display = f"{confidence:.0%}" if isinstance(confidence, (int, float)) else "—"

                rows.append(
                    {
                        "Metric": m.get("metric_name", "Unknown"),
                        "Value": m.get("value", "N/A"),
                        "Unit": m.get("unit", ""),
                        "Year": m.get("year_reported", "—"),
                        "Confidence": conf_display,
                        "Source Context": truncated,
                    }
                )

            table_df = pd.DataFrame(rows)
            st.dataframe(table_df, use_container_width=True, hide_index=True)

            # Per-category CSV export
            csv_bytes = table_df.to_csv(index=False).encode("utf-8")
            st.download_button(
                label=f"Export {category} Metrics (CSV)",
                data=csv_bytes,
                file_name=f"greenorb_{_safe(company_name).lower().replace(' ', '_')}_{category.lower()}.csv",
                mime="text/csv",
                key=f"dl_{category}_{company_id}",
            )

        with tab_e:
            render_metrics_table(details.get("Environmental", []), "Environmental")
        with tab_s:
            render_metrics_table(details.get("Social", []), "Social")
        with tab_g:
            render_metrics_table(details.get("Governance", []), "Governance")

    except Exception as exc:
        st.error(f"Company Intelligence error: {exc}")


# ═══════════════════════════════════════════════════════════════════════════
# PAGE 4 — Data Pipeline Status
# ═══════════════════════════════════════════════════════════════════════════

def page_pipeline_status(data: list):
    st.markdown(
        "<h1 style='margin-bottom:0;'>Data Pipeline Status</h1>",
        unsafe_allow_html=True,
    )
    st.markdown(
        "<p style='color:#71717A;margin-top:0.25rem;margin-bottom:1.5rem;'>"
        "Monitor document ingestion, extraction progress, and data quality</p>",
        unsafe_allow_html=True,
    )

    try:
        companies = fetch_companies()
        globe = data or []

        df_globe = pd.DataFrame(globe) if globe else pd.DataFrame()

        total_companies = len(companies) if companies else 0
        total_globe = len(df_globe)

        extracted = 0
        pending = 0
        if not df_globe.empty and "total_emissions" in df_globe.columns:
            extracted = int((df_globe["total_emissions"] > 0).sum())
            pending = total_globe - extracted

        # ── KPI row — asymmetric [2, 1, 1] ──────────────────────
        c1, c2, c3 = st.columns([2, 1, 1])
        with c1:
            st.metric("Registered Companies", f"{total_companies}")
        with c2:
            st.metric("Metrics Extracted", f"{extracted}")
        with c3:
            st.metric("Pending Extraction", f"{pending}")

        st.markdown("<div style='height:1.5rem;'></div>", unsafe_allow_html=True)

        # ── Per-company document counts ─────────────────────────
        st.markdown("### Document Inventory")

        if companies:
            inv_rows = []
            for comp in companies:
                cid = comp.get("id")
                cname = comp.get("name", "Unknown")
                reports = fetch_reports(int(cid)) if cid else []
                report_count = len(reports) if isinstance(reports, list) else 0

                # Determine extraction status from globe data
                match = df_globe[df_globe["id"] == cid] if not df_globe.empty and "id" in df_globe.columns else pd.DataFrame()
                if not match.empty:
                    em = match.iloc[0].get("total_emissions", 0) or 0
                    status = "Extracted" if em > 0 else "Pending"
                else:
                    status = "No Data"

                inv_rows.append(
                    {
                        "Company": cname,
                        "Documents": report_count,
                        "Extraction Status": status,
                    }
                )

            inv_df = pd.DataFrame(inv_rows).sort_values("Documents", ascending=False)
            st.dataframe(inv_df, use_container_width=True, hide_index=True)

            # Export
            csv_bytes = inv_df.to_csv(index=False).encode("utf-8")
            st.download_button(
                label="Export Pipeline Report (CSV)",
                data=csv_bytes,
                file_name="greenorb_pipeline_status.csv",
                mime="text/csv",
            )
        else:
            st.info("No companies registered in the database yet.")

    except Exception as exc:
        st.error(f"Pipeline status error: {exc}")


# ═══════════════════════════════════════════════════════════════════════════
# Main Entry
# ═══════════════════════════════════════════════════════════════════════════

def main():
    data = fetch_globe_data()
    page = render_sidebar(data)

    if page == "Global Corporate Map":
        page_global_map(data)
    elif page == "Smart City Dashboard":
        page_smart_city(data)
    elif page == "Company Intelligence":
        page_company_intelligence(data)
    elif page == "Data Pipeline Status":
        page_pipeline_status(data)


if __name__ == "__main__":
    main()
