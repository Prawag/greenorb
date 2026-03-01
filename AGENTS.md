# Project: GreenOrb Agent Network
---
description: A collaborative AI network for discovering and analyzing real-time ESG metrics and carbon data.
---

## Collaborative Agents

### 1. Scout Agent (Discovery)
- **Role**: Finds new companies with sustainability reports.
- **Goal**: Identify 2024/2025 ESG reports and extract carbon footprints.
- **Skill**: Uses `skills/search.md` for high-accuracy discovery.

### 2. Analyst Agent (Diligence)
- **Role**: Deep-scans sustainability performance.
- **Goal**: Scores Environmental, Social, and Governance metrics.
- **Skill**: Uses `skills/pdf_analysis.md` for PDF deep-scanning.

### 3. Risk Agent (Verification)
- **Role**: Detects Greenwashing and regulatory risk.
- **Goal**: Analyzes vague commitments and identifies reporting gaps.

### 4. Strategy Agent (Insights)
- **Role**: Investment and policy strategist.
- **Goal**: Recommends BUY/HOLD/AVOID actions based on aggregate ESG risk.

## Tech Stack
- **Frontend**: React (Vite) + 3D Globe (Three.js).
- **Backend**: Node/Express syncing with Neon PostgreSQL.
- **Web3**: Hedera Hashgraph (Solidity/Rust) for $GORB tokenomics.
