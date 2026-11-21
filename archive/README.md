# Archive

Everything in this folder was **parked** during the v4 rebuild (November 2026).
Nothing here is imported, built, deployed or run by the live app. It is kept
for reference so no earlier work is lost. Delete it whenever you like.

| Folder | What it was | Why it was parked |
| --- | --- | --- |
| `web3-contracts/` | `$GORB` ERC-20, Staking, RewardEngine, BurnMechanism (Solidity) | Nothing in the app called them, and they had never been deployed. They are out of scope for the ESG report product. |
| `frontends/greenorb-web/` | A second React/Vite frontend (Globe + Audit tab) | Duplicated the main app. |
| `esg_agent/` | FastAPI service, Streamlit dashboard, LangChain orchestrator, MiroFish adapter | A third backend and a third frontend overlapping with `Backend/`. Replaced by `worker/`. |
| `legacy-backend/python/` | `process_esg_reports.py`, `esg_discovery_agent.py`, the agents/, the orchestrator/, about 40 debug scripts, and a 190-package requirements.txt (torch, docling…) | Replaced by `worker/`, which has a small dependency set. See "Known bugs" below. |
| `legacy-backend/api/` | 56 Express route modules (globe layers, disasters, ocean, AIS, ImportYeti, EDGAR, etc.) | Out of scope for the ESG-report product. Several needed paid or unstable APIs. |
| `legacy-backend/lib/`, `workers/` | Greenwash engine, LLM router, AIS WebSocket tracker, OSM indexer | Replaced by `Backend/src/` and `worker/`. |
| `legacy-backend/migrations/` | Migrations 001–013 for the old `public` schema | The new app uses its own `esg` schema (`Backend/migrations/`). The old tables are left untouched. |
| `legacy-backend/node-scripts/`, `scratch/`, `misc/` | One-off check/fix/seed/debug scripts and test outputs | Development scratch work. |
| `legacy-frontend/` | The previous React screens, the Cesium globe tab, hooks, the hardcoded `fallbackData.js`, and the service worker | Rebuilt in `src/`. The old screens never showed real DB data (see below). |
| `docs/` | Prompt files, the old documentation, and AGENTS.md | They describe the old architecture. |
| `data/legacy_companies_dump.json` | JSON dump of the old `public.companies` table (2,852 rows) | Can be imported with `node Backend/scripts/import-legacy.js --from-json …`. |

## Known bugs in the archived code (why it was replaced, not patched)

- `Backend/index.js` called `sql.unsafe(...)` on a hand-rolled tagged-template helper that has no
  `.unsafe`. As a result, `/api/data` and `/api/esg/companies` returned HTTP 500 on every request, and the
  UI silently showed the 50 hardcoded companies in `fallbackData.js`.
- `process_esg_reports.py → normalize_value()` multiplied any value whose text contained `"000"`
  by 1,000. It also read `"MT"` (BRSR: *metric tonnes*) as megatonnes (×1,000,000), and it took medians
  across chunks **before** normalizing units.
- The API returned hardcoded "extraction confidence" values (0.95 / 0.9 / 0.85) and defaulted
  every company to a `HOLD` recommendation.
- `INTERNAL_API_KEY` was exposed to the browser through `VITE_INTERNAL_API_KEY`.
- Real Gemini API keys were hardcoded as fallbacks in 7 files. They have been redacted here, but
  they still exist in git history and **must be revoked**.
