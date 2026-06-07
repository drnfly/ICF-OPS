# ICF Operations Hub — PRD

## Original Problem Statement
Unified web app for ICF (Insulated Concrete Form) contractors with three core pillars:
1. **Bracing Engine** — input wall height/length/wind/pour rate/temp/slump → output brace spacing, count, tie-down patterns, hardware, safety factors.
2. **Equipment Rental Manager** — inventory dashboard, rental tracking, maintenance scheduler, availability calendar, damage/loss tracking.
3. **Quick Estimator** — ICF block count, concrete yardage, rebar tonnage, BOM generation.
Mobile + desktop responsive (crews on-site, office at desk).

## User Choices (Feb 2026)
- MVP: All 3 modules (priority polish on Quick Estimator + Bracing)
- Auth: JWT-based custom auth with Admin / Foreman / Crew roles
- Bracing source: Industry-standard ACI 347 + ASCE 7 wind formulas
- Rental scope: Basic CRUD + availability calendar + maintenance + damage
- Design: Surprise me — chose Swiss/high-contrast light theme (rugged, professional, sunlight-legible)

## User Personas
- **Admin / Owner** — full access, manages users, inventory, all financials
- **Foreman** — creates rentals, returns equipment, logs maintenance, runs bracing calcs
- **Crew** — checks out equipment on-site, runs estimator, reads calendar

## Architecture
- **Backend**: FastAPI + Motor (MongoDB async), JWT auth via httpOnly cookies + Bearer fallback, bcrypt password hashing, brute-force lockout (5 attempts / 15 min).
- **Frontend**: React 19 + React Router 7 + Tailwind + shadcn/ui + Recharts + Phosphor icons. Axios with `withCredentials`. Sonner toasts.
- **DB**: MongoDB collections — `users`, `equipment`, `customers`, `rentals`, `maintenance`, `calculations`, `login_attempts`.
- **Engineering source**: ACI 347 lateral pressure (P = Cw·Cc·(150 + 9000R/T)), capped at hydrostatic and 3000 psf; ASCE 7 wind exposure multipliers (B=1.00, C=1.15, D=1.30); brace_share=0.22 (through-form ties carry ~78%); wafer 5000 lb / strongback 7500 lb working capacity; user-set safety factor (default 2.0); spacing clamped to 2–6 ft o.c.

## Implemented (May 31, 2026)
- ✅ JWT auth with admin/foreman/crew roles, seeded admin (admin@icfhub.com / admin123) + foreman (foreman@icfhub.com / foreman123)
- ✅ Bracing Engine — ACI 347 formula + pressure profile chart, hardware schedule (wedge anchors, tie-downs, lag screws, waler rows/LF), field warnings, calculation history
- ✅ Quick Estimator — block count (with 5% waste), concrete yardage, rebar (#3–#6) horizontal+vertical LF and tonnage, full BOM table with adhesive/ties
- ✅ Equipment inventory CRUD with category, condition, location, daily rate, quantity, available counter
- ✅ Customers CRUD
- ✅ Rentals — create with availability decrement, return with availability restore, damage/loss tracking, status tabs (active/closed/overdue)
- ✅ Maintenance log with next_service_date
- ✅ Availability Calendar — month grid with check-out / due / return / service events color-coded
- ✅ Dashboard — utilization %, fleet status, inventory mix donut, alerts strip (overdue, service due), recent calculations
- ✅ Swiss/high-contrast design — Chivo + IBM Plex Sans, safety orange (#EA580C) accents, mobile-first responsive

## P1 — Deferred / Next
- PDF export of bracing plan and estimator BOM (with company logo)
- Project/Job tagging — group calcs and rentals under named projects
- QR/barcode check-out via phone camera (crew on-site)
- Password reset flow (backend skeleton exists, no UI yet)
- AI-explained bracing summaries (Claude Sonnet 4.5) — paragraph rationale for each calc
- Multi-user roles UI (admin can invite foremen/crew)
- Photo attachments on equipment, damage reports

## P2
- Customer portal (let renters see their open balances)
- Email reminders for due-back / service-due (Resend)
- CSV/Excel exports
- Stripe deposit collection
- Multi-yard / multi-branch inventory views
- Crew time-tracking on jobsites

## Backend endpoints (v1)
```
POST /api/auth/register|login|logout|refresh
GET  /api/auth/me
POST /api/bracing/calculate
POST /api/estimator/calculate
GET  /api/equipment              POST /api/equipment
PATCH/DELETE /api/equipment/{id}
GET  /api/customers              POST /api/customers
GET  /api/rentals                POST /api/rentals
POST /api/rentals/{id}/return
GET  /api/maintenance            POST /api/maintenance
GET  /api/dashboard/stats
```

## Test credentials (also in /app/memory/test_credentials.md)
- admin@icfhub.com / admin123 (admin)
- foreman@icfhub.com / foreman123 (foreman)

## Implemented — New Modules (May 31, 2026)
- ✅ **Vendors** directory — ICF block suppliers, freight terms, per-truck capacity, lead times. Full CRUD. Seeds 6 vendors (Amvic, BuildBlock, Fox Blocks, NUDURA, Quad-Lock, SuperForm).
- ✅ **Quote Analyzer** — paste text or upload PDF → Gemini 3 Flash (`gemini-3-flash-preview` via Emergent Universal LLM Key) extracts line items, totals, freight, warnings. Multi-quote (2–5) compare with winner recommendation. Budget-exceeded returns HTTP 402 with friendly message, surfaced via toast (no crash).
- ✅ **Leads & Scope Checklist** CRM — customer pipeline (new→reviewed→quoted→followed_up→sold→lost), **17-item scope checklist** (all separate line items incl. ICF blocks, form accessories, window/door bucks, bracing, rebar, concrete, pump, 4 waterproofing types [peel&stick/spray/sheet/dimple], backfill/drainage, scaffold/safety, engineering, delivery/freight, labor, other). Each line has a **3-state owner toggle (Providing / By others / N/A)** + product detail + **per-item price**; lead **estimated value auto-sums** the prices of "providing" items. Won/lost tracking with lost reasons (`/api/leads/lost-reasons`).
- ✅ Routes wired in `App.js` (vendors/quotes/leads) + sidebar nav links added in `Layout.jsx` (nav-vendors, nav-quotes, nav-leads).
- Backend endpoints: `GET/POST/PATCH/DELETE /api/vendors`, `GET/POST/DELETE /api/quotes`, `POST /api/quotes/compare`, `GET/POST/PATCH/DELETE /api/leads`, `GET /api/leads/lost-reasons`.
- DB collections: `vendors`, `quotes`, `leads`.

## Known external constraint
- Quote Analyzer AI execution is blocked until the Emergent Universal LLM Key budget is topped up (Profile → Universal Key → Add Balance). UI + error handling tested and working; live AI parsing untested pending top-up.

## Equipment categories (v3 — Jun 2026)
Taxonomy reduced to the fleet actually used: **strongback, turnbuckle, walkboard bracket, hand rail, TB extension, crankup scaffold** (removed brace, waler, alignment, scaffold, tool, other). Updated in 4 places: frontend `CATS` + form default + CSV help text, backend `EquipmentIn.category` Literal, `VALID_CATEGORIES`. Added `canon_category()` for case-insensitive CSV import (defaults to strongback). Seed fleet (`REAL_INVENTORY`) re-categorized + added Turnbuckle & Crank-Up Scaffold SKUs. One-time `migrate_categories_v3()` remaps existing equipment by name suffix (SB→strongback, TB→turnbuckle, Extension→TB extension, Walkboard→walkboard bracket, Handrail→hand rail) — remapped 7 SKUs in preview.

## Delivery Ticket (Jun 2026)
Printable, signable delivery ticket per rental. Backend `GET /api/rentals/{id}/ticket.pdf?download=0|1` renders a PDF via **reportlab** (added to requirements.txt) — company logo + brand name (from Site Admin content), ticket #, date, deliver-to (customer name/company/phone/address), rental start/due dates, QTY · DESCRIPTION line-item table, total units, optional notes, and physical signature lines (Received by / Delivered by / Print name / Date) + a short receipt-acknowledgement line. SVG logos skipped gracefully (text fallback); missing equipment shows "(item)". Frontend: **"Ticket"** button (Printer icon) on every rental row (active + closed) opens the inline PDF in a new tab — the browser PDF viewer provides BOTH print and save-as-PDF. `data-testid="ticket-{id}"`.

## Bracing Engine — simplified (Jun 2026)
Replaced the ACI 347 lateral-pressure calculator with a fast field count per user request. Inputs: **corners, linear ft of wall, wall height**. Formula: **brace_count = (corners × 2) + ceil(wall_length_ft / 4)** — 2 strongbacks per corner + 1 every 4 ft of wall. Backend `BracingIn` + `/api/bracing/calculate` rewritten (returns corner_braces, wall_braces, brace_count, brace_type, rule, warnings; still saves to db.calculations). Frontend `BracingEngine.jsx` rewritten to a 3-input form with total + corner/wall breakdown + "how this was figured" math. Removed wind/pour-rate/temp/slump/safety-factor inputs, pressure chart, hardware schedule. Updated `backend_test.py` bracing test (4 corners + 40ft → 18). Dashboard recent-calcs unaffected (only reads type/user/date).

## Construction Calculator (Jun 2026)
New "Calculator" sidebar tab (`/calculator`, `Calculator.jsx`, client-side, no backend). Tools: **ICF Wall Concrete** (multi-run: each run length×height×core → summed cubic yards w/ waste + per-run table), **Ft-In↔Decimal** converter, **Area** (sq ft w/ waste), **ICF Blocks** (presets + custom, openings, waste), **Rebar takeoff** (multi-run: per run length/height/V&H spacing → vertical+horizontal bar counts, total lin ft, weight by bar size #3–#8, sticks; aggregate totals + per-run table), **Dimension Math** (Construction Master–style ft-in-fraction running tape with ×/÷ scaling). All imperial, feet-inches-1/16. Multi-run added to Concrete & Rebar per user request. Delivery ticket confirmed pricing-free (qty + description only).

## Testing summary
Iteration 1 (May 31 2026): Backend 13/13 ✅ · Frontend E2E ✅ · 100%.
Iteration 2 (May 31 2026): New modules — Backend 14/14 ✅ · Vendors/Leads CRUD 100% ✅ · Quotes 402 path graceful ✅. Fixed missing App.js routes (testing agent) + missing sidebar nav links (main agent).
