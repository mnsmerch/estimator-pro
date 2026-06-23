# Estimator Pro — Product Roadmap & Architecture

A web app for a painting contractor (**Vanhousing Painters LLC**) that replaces a Google Sheets estimating workflow. It lets the team build painting estimates, send branded online proposals to customers for e-signature, automatically generate invoices in GoHighLevel (GHL), and manage the resulting work orders.

---

## 1. What This App Does (in one paragraph)

An estimator builds a detailed painting estimate (measurements → labor/paint/sundries pricing). The app generates a polished, mobile-friendly **online proposal** at a unique public link. The customer reviews paint options, optional add-ons, sees live pricing with sales tax, and **signs digitally**. On signing, the app automatically: creates a signed-contract PDF, fires deposit + balance **invoices into GoHighLevel**, and spins up a **work order** for the production team. Payments flowing back from GHL update the estimate's paid status.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript |
| Styling | Tailwind CSS v4 (brand color = warm orange `#df6437`) |
| Database | Firebase Firestore |
| Auth | Firebase Auth (role-based) |
| File storage | Firebase Storage + Google Drive |
| PDF generation | `@react-pdf/renderer` |
| CRM / Invoicing | GoHighLevel API (invoices, contacts, webhooks) |
| Tax lookup | WA State Dept. of Revenue API |
| Hosting | Vercel |

---

## 3. User Roles

- **Admin** — full access, all estimates, settings, team management, tax corrections
- **Estimator** — creates estimates, sends proposals
- **PM (Project Manager)** — manages work orders, sees pricing breakdowns
- **User** — limited

---

## 4. Three Estimate Types

The app supports three distinct estimating workflows, each with its own form, pricing engine, and proposal page:

| Type | Form | Proposal Link | Pricing Engine |
|------|------|---------------|----------------|
| **Exterior** | `EstimateForm` | `/p/[id]` | `lib/estimateEngine.ts` |
| **Interior** | `InteriorEstimateForm` | `/ip/[id]` | `lib/interiorCalculations.ts` (room-by-room) |
| **Cabinet** | `CabinetEstimateForm` | `/cp/[id]` | `types/cabinetEstimate.ts` (per door/drawer) |

---

## 5. Page Inventory

### Internal (authenticated dashboard)
| Route | Purpose |
|-------|---------|
| `/dashboard` | Home overview |
| `/estimates` | List of all estimates — filter by status (Draft / Pending / Signed / Declined), search, shows price + paid status |
| `/estimates/new` | Create exterior estimate |
| `/estimates/[id]` | Estimate detail — pricing summary, signature, payments, tax-correction tools, create work order |
| `/estimates/[id]/edit` | Edit estimate |
| `/estimates/interior/*`, `/estimates/cabinet/*` | Interior & cabinet equivalents |
| `/work-orders` | Work order list |
| `/work-orders/[id]` | Work order detail — PM fills in job #, painter pay, colors, scope; submit generates PDF |
| `/clients` | Client list |
| `/contracts` | Signed contracts archive |
| `/generated-estimates` | History |
| `/settings` | Company info, business rules, paint products, production rates, terms, team |
| `/login` | Auth |

### Public (customer-facing, no login)
| Route | Purpose |
|-------|---------|
| `/p/[id]` | **Exterior proposal** — the core customer experience: scope, photos, paint tier selector, add-ons, live pricing, e-signature |
| `/ip/[id]` | Interior proposal |
| `/cp/[id]` | Cabinet proposal |
| `/tax-update/[id]` | Special "updated estimate" page for sales-tax corrections (shows adjustment math + remaining balance) |

---

## 6. The Core Customer Flow (Proposal Page `/p/[id]`)

This is the most important screen — what the customer sees. Currently it has:

1. **Company header** — logo, contact info, date
2. **Prepared For** — client name, address, project location
3. **Scope of Work** — project / prep / painting / clean-up / walk-through / paint products, colors & coats
4. **Project Photos** — grid with lightbox
5. **Choose Your Paint** — 4 selectable tiers (Super Paint, Duration, Emerald, Emerald Rain Refresh) that re-price live. *Locked once signed. Hidden when owner supplies paint.*
6. **Optional Add-Ons** — wood replacement + custom line items, individually toggleable checkboxes
7. **Sign Today & Save 10%** — discount toggle
8. **Your Estimate** — itemized pricing: line items → subtotal → discount → sales tax → deposit due → balance → total
9. **Terms & Conditions** — collapsible
10. **Accept This Estimate** — agreement checkbox, name, signature pad, date, sign button
11. **Post-sign states** — "Estimate Accepted", PDF status, invoice status ("Invoice Sent" / "Pay Deposit Now")

---

## 7. What Happens When a Customer Signs

A single signature triggers an automated chain:

1. **Save signature** + lock pricing into Firestore (status → `approved`)
2. **Create GHL invoices** — deposit (sent, with 2% CC fee) + balance (draft); invoice # = estimate #
3. **Generate signed-contract PDF** — download + upload to Google Drive + Firebase Storage backup
4. **Create work order** — pre-filled with painter pay, hours, materials, paints & gallons, scope, photos
5. **Manual estimates** (no GHL contact yet) → fire a webhook so GHL creates the contact, then calls back to attach it + create invoices

---

## 8. Pricing Engine Logic (Exterior)

- Measurements entered per surface (front/right/back/left) × application type
- Converts to labor hours → labor cost (wage × payroll burden)
- Paint gallons by coverage → paint cost (supports "owner supplies paint")
- Sundries per hour
- Markup formula (net profit + overhead + marketing + sales + production margins)
- **Structure add-ons**: Deck, Pergola, Fence, Shed — each priced independently with its own paint product
- Wood replacement + custom items as optional add-ons
- 10% sign-today discount
- WA sales tax looked up by ZIP from the state DOR API
- 20% deposit / balance split

---

## 9. Work Order System

When an estimate is signed (or manually triggered), a work order is created for the production team:

- **Auto-filled**: client info, job # (= estimate #), painter pay (L&M), total hours, materials price, paints & gallons (incl. structure add-ons), scope, project photos, pricing breakdown (full price / discount / net / total)
- **PM edits**: job number, CRM link, color change, # of colors, color IDs, budget hours, exclusions & notes
- **On submit**: generates a Work Order PDF (with photos), uploads to storage, fires a webhook, marks complete
- The PM sees the full price breakdown; the submitted PDF shows only production-relevant figures (painter pay, materials)

---

## 10. Invoicing & Payments (GoHighLevel Integration)

- **Auto invoice creation** on signing — deposit + balance, with sales tax line, matching invoice numbers
- **Tax correction tool** (admin) — for estimates signed before a tax fix; recalculates, creates corrected balance invoice (draft or send-to-client option)
- **Invoice-paid webhook** (`/api/webhook/invoice-paid`) — GHL workflow calls back when an invoice is paid; records amount + payment method (Check / Cash / Credit Card / etc.)
- **Payment status display** — estimate detail shows Deposit + Balance status, "Partially Paid" / "Paid in Full" badge, total paid, remaining balance
- **Recovery tools** — `link-invoices` endpoint to repair estimates whose invoices failed to generate

---

## 11. Settings (Admin-Configurable)

- **Company** — name, address, phone, email, website, license #, logo
- **Business Rules** — wage, payroll burden, margins, deposit %, discount %, sales tax
- **Paint Products** — catalog with prices & coverage (incl. "No Paint / Client Providing")
- **Production Rates** — application-specific labor rates
- **Terms & Conditions** — warranty, insurance, payment terms
- **Team** — invite/manage users & roles

---

## 12. Design System (Current State)

- **Brand color**: warm orange (`brand-600` = `#df6437`), full 50–800 scale
- **Layout**: max-width centered containers, rounded-xl/2xl cards, gray-50 backgrounds
- **Components**: card-based sections, status pills, tabular numbers for money, dashed-border admin tools, amber for warnings, green/emerald for success/paid
- **Public proposal**: brand-700 header block, white cards on gray-100, 2xl rounded corners
- **Icons**: inline Heroicons (outline)
- **Typography**: system font stack, bold headings, uppercase tracked labels

---

## 13. Ideas / Opportunities for Design Improvement

Areas that could most benefit from a design pass:

1. **Proposal page (`/p/[id]`)** — the money-maker. Could be more premium/trustworthy, better visual hierarchy on pricing, more delightful signing moment.
2. **Estimates list** — dense table; could use better status visualization, payment progress, grouping.
3. **Estimate detail page** — lots of stacked cards (pricing, signature, payments, tax correction, change orders); could be tabbed or better organized.
4. **Work order detail** — long form; could be sectioned/wizard-style.
5. **Dashboard** — currently minimal; opportunity for a real overview (pipeline, revenue, pending signatures, unpaid balances).
6. **Mobile experience** — much customer signing happens on phones/iPads; touch targets, layout.
7. **Empty states, loading states, micro-interactions** — generally basic.
8. **Consistent design language** across the 3 estimate types (exterior/interior/cabinet currently diverge).

---

## 14. Notable Constraints

- Customers sign on **mobile devices and iPads** in the field — mobile-first matters
- Pricing must stay **exact** (matches the original spreadsheet to the cent)
- Public proposal pages must load fast and feel trustworthy (they handle real signatures + money)
- The app is **live in production** serving a real painting business
