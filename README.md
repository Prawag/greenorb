# ◎ GreenOrb v3 — Open Carbon Intelligence Platform

GreenOrb is an AI-powered carbon intelligence platform that gives anyone access to real, verifiable CO₂ data for countries, companies, and products. Built with React + Vite, powered by Google Gemini AI.

![GreenOrb](https://img.shields.io/badge/version-3.0.0-00e87a?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-00d4e8?style=flat-square)

## 🌍 Features

| Tab | Description |
|-----|-------------|
| **Globe** | Interactive 3D globe (Three.js) — tap any country for verified CO₂ data, per-capita emissions, net zero targets, and forest offsets |
| **ESG DB** | 20+ companies with real ESG report links, Scope 1/2/3 breakdown, calculation methodology, and live AI search |
| **Compare** | Side-by-side LCA product comparison (smartphones, laptops, EVs, food) with source citations |
| **Scan** | Upload any PDF (invoice, ESG report, audit) — Gemini AI produces a full Greendex score + recommendations |
| **Agent** | Autonomous AI agent using Gemini + Google Search to continuously discover ESG reports and build a live carbon database |

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- A free [Google AI Studio API key](https://aistudio.google.com)

### Installation
```bash
git clone https://github.com/YOUR_USERNAME/greenorb.git
cd greenorb
npm install
```

### Configuration
Create a `.env` file in the root:
```env
VITE_GEMINI_KEY=your_gemini_api_key_here
```

### Run locally
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173)

## 🛠 Tech Stack

- **React 18** + **Vite 6** — fast modern toolchain
- **Three.js** — WebGL 3D globe rendering
- **Google Gemini 1.5 Flash** — AI analysis, web search grounding, PDF parsing
- **localStorage** — persistent ESG discovery database
- CSS Variables — zero-dependency dark theme design system

## 📁 Project Structure

```
src/
├── components/      # Shared UI: primitives, TopBar, BottomNav
├── data/            # Static datasets: countries, companies, products
├── tabs/            # GlobeTab, CompaniesTab, CompareTab, ScanTab, AgentTab
├── utils.js         # Gemini API wrapper, helpers, localStorage shim
└── styles/          # global.css (CSS variables + keyframes)
```

## 📊 Data Sources

- **Countries**: IEA, EPA, Global Carbon Project, UNFCCC inventories (2023)
- **Companies**: Official ESG/Sustainability Reports (linked in-app)
- **Products**: ISO 14040/14044 LCA data from manufacturer disclosures

## 🎯 Vision

> "Map 10M+ product carbon footprints · 500k+ companies · All 195 countries"

There is no single database of carbon footprints. ESG reports are scattered across thousands of PDFs. GreenOrb's AI agent reads them all.

---

Built with ❤️ and data by [@prawa](https://github.com/prawa)
