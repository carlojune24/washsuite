# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, for two different surfaces of the same codebase:

- **Laundry shop owners/managers (Philippines)** are the primary users of the WashSuite desktop app itself (Tauri, Windows) — the counter staff running day-to-day operations (orders, payments, inventory, payroll) and the owner reviewing the business (reports, cashflow, attendance).
- **Prospective laundry-shop owners** are the audience for the new surface this session is scoping: a marketing landing page at the online-monitoring portal's domain (`washsuite.duckdns.org`), meant to showcase the app and generate inquiries from owners who don't use WashSuite yet. Existing owners also land here, via the "log in to view monitoring" path, to reach their remote dashboard.

## Product Purpose

WashSuite is an all-in-one desktop business-management system for laundry shops in the Philippines: point-of-sale/order intake, inventory and restocking, customer/loyalty management, employee attendance and payroll, cashflow/expense tracking, and BIR-facing compliance (VAT computation, OR numbering series, SC/PWD discounts, Z-readings). A companion piece, "Online Monitoring," lets the owner check today's sales/cashflow/attendance/machine status remotely from a browser, fed by periodic snapshots the desktop app pushes to a small self-hosted server (`server/`, already built — see `server/web/index.html`).

Success for the desktop app is a shop that never has to leave WashSuite to run the counter, close the books, or stay BIR-compliant. Success for the new landing page is a prospective owner understanding what the product does and reaching out.

## Positioning

Built specifically for Philippine laundry shops, not a generic retail POS adapted after the fact — BIR compliance (VAT, OR series, SC/PWD discount, Z-reading) is native, not bolted on. The Pro tier's differentiator is physical: ESP32 hardware sensors bound to washers/dryers detect actual machine activity, and a "load verification" report compares declared loads against sensor-detected activity — a check on transaction integrity that a neighboring POS product, lacking any hardware layer, cannot claim.

## Operating Context

Runs on a Windows desktop at the shop counter (Tauri app, local SQLite, works offline). The online-monitoring portal and its new landing page are the one part of the product reached from an ordinary browser, on any device.

## Capabilities and Constraints

Confirmed feature surface (from `src/App.tsx` routing — this is the full set to draw from, not a subset to guess at):

- **Sales/POS:** order intake and detail, service packages, à la carte services, add-ons, promos.
- **Customers:** CRM, loyalty points and tiers, redemptions.
- **Inventory:** items, restocking, purchase history, item-usage tracking.
- **Expenses & Cashflow:** categorized expenses, cashflow ledger with running balance, manual adjustments.
- **Employees:** attendance (with DTR — daily time record), cash advances, statutory deductions, payroll runs and payslips.
- **Reports (19 report types, grouped Sales/Expenses & Cashflow/Inventory/Employees/Customers in `src/pages/Reports.tsx`):** revenue by service/package, order status, busiest hours & days, unpaid orders, OR series & liquidation, Z-reading/X-reading, expense categories, expense trend, cashflow by source, restock spend, waste & shrinkage, item usage & income, attendance performance, overtime, government deductions, top customers, new vs. returning, promo effectiveness, loyalty points. Plus a 20th, owner-only "load verification" (declared vs. sensor-detected loads) report tied to the machine-sensor feature, not counted in the public 19.
- **BIR compliance:** VAT (vatable/exempt/zero-rated), OR numbering series, SC/PWD discount handling, immutable Z-readings, invoice numbering.
- **Machine monitoring (Pro tier):** ESP32 sensor integration per washer/dryer, live running/idle/offline status, calibration, load-verification integrity report.
- **Online Monitoring (Pro tier):** the remote browser dashboard already built at `server/web/index.html` — today's sales, cashflow (incl. itemized expenses), attendance (incl. clock in/out), and live machine status, synced from the desktop app roughly every 45 seconds.
- **Multi-branch, role-based access** (owner/manager/staff), printer integration (thermal receipt printing), local backup.

Licensing is real and already implemented (`src-tauri/src/license.rs`, machine-fingerprint-bound activations validated against a Supabase edge function) — not a placeholder to design around.

## Brand Commitments

- Product name throughout the app and existing monitoring dashboard: **WashSuite** (dashboard title "WashSuite Monitor"; existing brand mark is a stylized circular "porthole" icon on a blue gradient — see `server/web/index.html`'s `ICONS.porthole` and `--brand-*` CSS tokens).
- Contact identity to display on the new landing page: business name **WashsuiteApp**, phone **0920 268 3489**, email **mechellecaimen94@gmail.com**.
- Pricing (real, confirmed by the user — not to be altered or invented further):
  - **One-time license:** ₱10,000
  - **Standard:** ₱500/month — no Online Monitoring, no machine sensors/status integrity checking
  - **Pro:** ₱1,000/month — includes Online Monitoring and machine sensors/status for transaction integrity

## Evidence on Hand

- Real screenshots of the running app now exist at `server/web/screenshots/` (Dashboard/home, Cashflow, Reports index) plus the Online Monitoring dashboard itself, base64-inlined into the live landing page. Captured via a throwaway mocked-Tauri-IPC rig, not `npm run tauri dev` directly (that needs a real native window this environment can't screenshot) — see [[project-washsuite-monitor-deploy]] for the technique if more are needed.
- The already-built Online Monitoring dashboard (`server/web/index.html`, live at `https://washsuite.duckdns.org`) is real, working evidence of the monitoring feature, not a mockup.
- No testimonials, customer logos, or case studies exist yet — do not fabricate any.

## Product Principles

- Every feature claim on the landing page must trace to an actual route/table in this codebase (see Capabilities above) — nothing invented.
- BIR-related claims describe genuine computed compliance (VAT, OR series, Z-readings, SC/PWD) without implying formal government accreditation, which is not evidenced.
- The Pro-tier hardware/sensor story (transaction-integrity verification) is the single most differentiated claim — it should read as a real mechanism, not a generic "smart monitoring" buzzword.
- The existing Online Monitoring dashboard's visual identity (brand mark, color tokens, card language in `server/web/index.html`) is the seed of this product's visual world, not a constraint to abandon — new-work decides how far the landing page extends or departs from it.

## Accessibility & Inclusion

No product-specific requirement established yet.
