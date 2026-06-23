# Estimator Pro — Complete Rebuild Prompt

> Copy everything below this line into a new Claude conversation to rebuild the app from scratch.
> This prompt contains every formula, rate, data model, and design principle needed.

---

## THE VISION

Build the **most beautiful and easiest-to-use online estimating tool** ever made for exterior painting contractors.

Two people use this tool:

1. **The Estimator** (salesperson) — visits a job site, takes measurements, needs to produce a professional estimate in minutes, not hours. The form must be fast, smart, and require no math — just enter numbers and click Generate.

2. **The Homeowner** (customer) — receives a link to a stunning proposal page on their phone. They see the scope of work, photos of their home, can compare paint quality tiers, see the price update live, toggle a 10% discount, and sign digitally. The whole experience should feel like receiving a proposal from a top-tier contractor, not a handwritten quote.

The tool replaces a Google Sheets workflow. All formulas and numbers must exactly match the original spreadsheet.

---

## TECH STACK

- **Framework**: Next.js (App Router, TypeScript)
- **Styling**: Tailwind CSS — no UI component library, build everything custom
- **Database + Auth**: Firebase (Firestore, Firebase Auth, Firebase Storage)
- **Hosting**: Vercel
- **Brand color**: Use `brand` as a Tailwind alias for a professional indigo/blue tone

---

## APPLICATION ARCHITECTURE

### Routes

| Route | Who sees it | Purpose |
|---|---|---|
| `/login` | Estimator | Email + password login |
| `/dashboard` | Estimator | Quick stats, recent activity |
| `/estimates` | Estimator | List all estimates with status |
| `/estimates/new` | Estimator | Create new estimate |
| `/estimates/[id]` | Estimator | View saved estimate, open proposal |
| `/estimates/[id]/edit` | Estimator | Edit an estimate |
| `/p/[id]` | **Homeowner** | The beautiful customer-facing proposal (no auth) |
| `/settings` | Estimator | Business rules, paint products, rates |

---

## DATA MODELS

### Core Types

```typescript
type EstimateStatus = 'draft' | 'pending' | 'sent' | 'approved' | 'rejected'
type JobType = 'exterior' | 'structures' | 'both'

interface EstimateRow {
  id: string
  applicationKey: string   // format: "categoryKey.itemKey"  e.g. "bodyApplication.sidingSpray"
  front: number
  right: number
  back: number
  left: number
}

interface WoodReplacementRow {
  id: string
  itemKey: string   // key from ProductionRates.woodReplacement
  front: number
  right: number
  back: number
  left: number
}

interface CustomItem {
  id: string
  description: string
  price: number
}

interface StructureRow {
  id: string
  applicationKey: string   // staining items only
  amount: number
}

interface StructureAddon {
  enabled: boolean
  rows: StructureRow[]
  paintProductId: string
}

interface ScopeFields {
  scopeProject: string
  scopePrepWork: string
  scopePainting: string
  scopeCleanUp: string
  scopeWalkThrough: string
  scopePaintProducts: string
  totalColors: string
  totalCoats: string
}

interface EstimateData {
  id?: string
  userId: string
  status: EstimateStatus
  clientName: string
  clientAddress: string
  clientPhone: string
  clientEmail: string
  clientFolderId: string
  clientContactId: string
  rows: EstimateRow[]
  woodReplacementRows?: WoodReplacementRow[]
  woodReplacementOpen?: boolean
  customItems?: CustomItem[]
  customItemsOpen?: boolean
  deckAddon?: StructureAddon        // legacy — superseded by deckAddons
  deckAddons?: StructureAddon[]     // supports multiple decks with different products
  pergolaAddon?: StructureAddon
  fenceAddon?: StructureAddon
  shedAddon?: StructureAddon
  selectedBrand: string
  selectedBodyPaint: string
  selectedTrimPaint: string
  selectedAccentPaint: string
  selectedStainPaint: string
  manualPaintAProductId: string
  manualPaintAGallons: number
  manualPaintBProductId: string
  manualPaintBGallons: number
  scopeProject: string
  scopePrepWork: string
  scopePainting: string
  scopeCleanUp: string
  scopeWalkThrough: string
  scopePaintProducts: string
  scopeByBrand?: Record<string, ScopeFields>
  totalColors: string
  totalCoats: string
  photoUrls: string[]
  salesTaxRate?: number | null   // e.g. 0.101; null = explicitly no tax
  taxExcluded?: boolean
  signatureName?: string
  signatureDate?: string
  signatureDataUrl?: string
  jobType?: JobType
  createdAt?: Date
  updatedAt?: Date
}
```

### Settings Types

```typescript
interface BusinessRules {
  wage: number                   // default: 30
  payrollBurden: number          // default: 1  (1 = no burden)
  netProfitMargin: number        // default: 0.20
  overheadMargin: number         // default: 0.10
  marketingMargin: number        // default: 0.10
  salesMargin: number            // default: 0.07
  productionMgmtMargin: number   // default: 0.07
  additionalMargin1: number      // default: 0
  additionalMargin2: number
  additionalMargin3: number
  additionalMargin4: number
  additionalMargin5: number
  depositPercent: number         // default: 0.20
  salesDiscount: number          // default: 0.10
  woodReplacementMinimum: number // default: 400
  salesTax: number               // default: 0.101
}

interface ProductionConstants {
  paintCoverageSpray: number      // default: 2    — spray multiplier
  paintCoverageBrushRoll: number  // default: 1.3  — brush/roll multiplier
  cleanupHoursRatio: number       // default: 20   — cleanupHours = prodHours / 20
  fasciaWidthIn: number           // default: 18
  eavesWidthIn: number            // default: 24
  otherTrimWidthIn: number        // default: 4
  railingsTrimRatio: number       // default: 26   — 26 sqft per 3 lnFt
  windowTrimWidthIn: number       // default: 4
  downspoutWidthIn: number        // default: 12
  shutterSqft: number             // default: 6    — sqft per shutter unit
  stainCoverage: number           // default: 1.3  — stain multiplier (matches Inputs!$B$42)
  sundriesPerHour: number         // default: 1
}

interface PaintProduct {
  id: string
  name: string
  singleGallon: number   // price per single gallon
  fiveGallon: number     // per-gallon price inside a 5-gallon bucket
  coverage: number       // sqft per gallon at rated coverage
}
```

---

## THE CALCULATION ENGINE

Put all calculation logic in `lib/estimateEngine.ts`. This is the heart of the app — it must be exact.

### 1. Markup

```typescript
function calcMarkup(rules: BusinessRules): number {
  return 1
    - rules.netProfitMargin
    - rules.overheadMargin
    - rules.marketingMargin
    - rules.salesMargin
    - rules.productionMgmtMargin
    - rules.additionalMargin1
    - rules.additionalMargin2
    - rules.additionalMargin3
    - rules.additionalMargin4
    - rules.additionalMargin5
}
// With defaults: 1 - 0.20 - 0.10 - 0.10 - 0.07 - 0.07 = 0.46
```

### 2. Paint Cost (Bulk-Buy Formula)

Matches Google Sheet: `ROUNDDOWN(gallons/5)*5*fiveGalPrice + MOD(gallons,5)*singleGalPrice`

```typescript
function calcPaintCost(gallons: number, product: PaintProduct): number {
  if (gallons <= 0) return 0
  const whole = Math.ceil(gallons)          // always round up — can't buy fractional gallons
  const buckets5 = Math.floor(whole / 5)
  const remainder = whole % 5
  return buckets5 * 5 * product.fiveGallon + remainder * product.singleGallon
}
```

### 3. Surface Area Factor

Converts each row's measurement unit into SqFt for paint gallon calculations.

```typescript
function surfaceAreaFactor(app: ApplicationItem, constants: ProductionConstants): number {
  switch (app.categoryKey) {
    case 'bodyApplication': return 1
    case 'eaves':           return constants.eavesWidthIn / 12
    case 'fascia':          return constants.fasciaWidthIn / 12
    case 'otherTrim':
      if (app.isDownspout)  return constants.downspoutWidthIn / 12
      return constants.otherTrimWidthIn / 12
    case 'windows':         return app.trimLnFt * (constants.windowTrimWidthIn / 12)
    case 'doors':
    case 'sidelights':      return app.trimLnFt * (constants.otherTrimWidthIn / 12)
    case 'garageDoors':     return app.trimLnFt * (constants.otherTrimWidthIn / 12)
    case 'railings':        return constants.railingsTrimRatio / 3   // 26/3 ≈ 8.667 sqft/lnFt
    case 'shutters':        return constants.shutterSqft
    case 'staining':        return app.surfaceAreaFactor || 1
    default:                return 0   // prepWork, woodReplacement — no paint
  }
}
```

### 4. Paint Bucket Assignment

```typescript
function paintBucket(app: ApplicationItem): 'body' | 'trim' | 'accent' | 'stain' | null {
  if (app.categoryKey === 'staining') return 'stain'
  if (app.isAccent)    return 'accent'
  if (app.isTrimColor) return 'trim'
  // isBodyColor outside bodyApplication → covered by body spray, contributes 0 additional paint
  if (app.isBodyColor) return null
  if (app.categoryKey === 'bodyApplication') return 'body'
  if (['eaves','fascia','otherTrim','windows','doors','sidelights',
       'garageDoors','railings','shutters'].includes(app.categoryKey)) return 'trim'
  return null
}
```

### 5. Per-Row Calculation

**Door/Sidelight face+frame split**: Each door/sidelight has a face (`faceLnFt`) that takes the door's color, and a frame (`trimLnFt − faceLnFt`) that always takes trim color.

```typescript
function calcRow(row: EstimateRow, app: ApplicationItem, constants: ProductionConstants): RowResult {
  const total = row.front + row.right + row.back + row.left
  const hours = total * app.converter   // converter = 1/rate

  let bodySqft = 0, trimSqft = 0, accentSqft = 0, stainSqft = 0

  const hasFaceFrameSplit =
    (app.categoryKey === 'doors' || app.categoryKey === 'sidelights') &&
    app.faceLnFt !== undefined &&
    app.trimLnFt > app.faceLnFt

  if (hasFaceFrameSplit) {
    const w = constants.otherTrimWidthIn / 12
    const faceSqft  = total * app.faceLnFt * w
    const frameSqft = total * (app.trimLnFt - app.faceLnFt) * w
    trimSqft = frameSqft                              // frame always trim color
    if (app.isAccent)          accentSqft = faceSqft
    else if (!app.isBodyColor) trimSqft  += faceSqft  // isTrimColor or stainedToPainted
    // isBodyColor face → 0 paint (body spray covers it)
  } else if (app.categoryKey === 'garageDoors' && app.isBodyColor) {
    // Body color garage door: face covered by body spray, frame always trim
    trimSqft = total * surfaceAreaFactor(app, constants)
  } else {
    const sqft = total * surfaceAreaFactor(app, constants)
    const b    = paintBucket(app)
    bodySqft   = b === 'body'   ? sqft : 0
    trimSqft   = b === 'trim'   ? sqft : 0
    accentSqft = b === 'accent' ? sqft : 0
    stainSqft  = b === 'stain'  ? sqft : 0
  }

  return { rowId: row.id, applicationKey: row.applicationKey,
           total, hours, bodySqft, trimSqft, accentSqft, stainSqft }
}
```

### 6. Full Estimate Calculation

```typescript
function calcEstimate(rows, appMap, rules, constants, bodyPaint, trimPaint, accentPaint, stainPaint) {
  const rowResults = rows.map(row => {
    const app = appMap.get(row.applicationKey)
    return app ? calcRow(row, app, constants)
               : { rowId: row.id, applicationKey: row.applicationKey,
                   total: 0, hours: 0, bodySqft: 0, trimSqft: 0, accentSqft: 0, stainSqft: 0 }
  })

  // Hours
  const productionHours = rowResults.reduce((s, r) => s + r.hours, 0)
  const cleanupHours    = productionHours / constants.cleanupHoursRatio
  const totalHours      = productionHours + cleanupHours

  // Labor
  const laborCost = totalHours * rules.wage * rules.payrollBurden

  // Surface area totals
  const totalBodySqft   = rowResults.reduce((s, r) => s + r.bodySqft, 0)
  const totalTrimSqft   = rowResults.reduce((s, r) => s + r.trimSqft, 0)
  const totalAccentSqft = rowResults.reduce((s, r) => s + r.accentSqft, 0)
  const totalStainSqft  = rowResults.reduce((s, r) => s + r.stainSqft, 0)

  // Body gallons (sprayed)
  const bodyGallonsRaw = (totalBodySqft * constants.paintCoverageSpray) / bodyPaint.coverage

  // Body reduction: accent-colored door/sidelight faces displace body spray
  const doorAccentSqft = rowResults
    .filter(r => ['doors','sidelights'].includes(appMap.get(r.applicationKey)?.categoryKey))
    .reduce((s, r) => s + r.accentSqft, 0)
  const bodyReduction  = (doorAccentSqft * constants.paintCoverageBrushRoll) / accentPaint.coverage
  const bodyGallons    = Math.max(0, bodyGallonsRaw - bodyReduction)

  // Garage doors + shutters are sprayed; everything else is brush/roll
  const sprayOnly = (cat?: string) => cat === 'garageDoors' || cat === 'shutters'
  const sprayTrimSqft   = rowResults.filter(r => sprayOnly(appMap.get(r.applicationKey)?.categoryKey)).reduce((s,r)=>s+r.trimSqft,0)
  const sprayAccentSqft = rowResults.filter(r => sprayOnly(appMap.get(r.applicationKey)?.categoryKey)).reduce((s,r)=>s+r.accentSqft,0)

  const trimGallons   = ((totalTrimSqft   - sprayTrimSqft)   * constants.paintCoverageBrushRoll + sprayTrimSqft   * constants.paintCoverageSpray) / trimPaint.coverage
  const accentGallons = ((totalAccentSqft - sprayAccentSqft) * constants.paintCoverageBrushRoll + sprayAccentSqft * constants.paintCoverageSpray) / accentPaint.coverage
  const stainGallons  = (totalStainSqft * constants.stainCoverage) / stainPaint.coverage

  const body   = { gallons: bodyGallons,   cost: calcPaintCost(bodyGallons,   bodyPaint)   }
  const trim   = { gallons: trimGallons,   cost: calcPaintCost(trimGallons,   trimPaint)   }
  const accent = { gallons: accentGallons, cost: calcPaintCost(accentGallons, accentPaint) }
  const stain  = { gallons: stainGallons,  cost: calcPaintCost(stainGallons,  stainPaint)  }

  const totalPaintCost = body.cost + trim.cost + accent.cost + stain.cost
  const sundries       = totalHours * constants.sundriesPerHour
  const landm          = laborCost + totalPaintCost + sundries
  const markup         = calcMarkup(rules)

  // Subtotal formula: (L&M / markup) / (1 - salesDiscount)
  const rawSubtotal = markup > 0 ? (landm / markup) / (1 - rules.salesDiscount) : 0
  // Round to dollar when no tax; keep fractional for accurate tax calc
  const subtotal    = rules.salesTax === 0 ? Math.round(rawSubtotal) : rawSubtotal

  return { rows: rowResults, productionHours, cleanupHours, totalHours,
           laborCost, body, trim, accent, stain, totalPaintCost,
           sundries, landm, markup, subtotal, tenPercentOff: subtotal * 0.90 }
}
```

### 7. Structure Add-on Calculation

```typescript
function calcStructureAddonSubtotal(addon, setupFraction, appMap, rules, constants, paintProducts) {
  if (!addon.enabled) return 0

  const raw = addon.rows.reduce((s, r) => {
    const app = appMap.get(r.applicationKey)
    return s + (app && r.amount > 0 ? r.amount * app.converter : 0)
  }, 0)
  // Deck: setupFraction = 1/20 (move-in/move-out overhead)
  // Pergola, Fence, Shed: setupFraction = 0
  const totalHours = raw + raw * setupFraction

  const labor    = totalHours * rules.wage * rules.payrollBurden
  const sundries = totalHours * constants.sundriesPerHour

  const paintProduct = paintProducts.find(p => p.id === addon.paintProductId)
  const stainSqft    = addon.rows.reduce((s, r) => {
    const app = appMap.get(r.applicationKey)
    return app?.categoryKey === 'staining' && r.amount > 0
      ? s + r.amount * (app.surfaceAreaFactor || 1)
      : s
  }, 0)
  // Gallons displayed as: Math.ceil(paintGallons)  — matches spreadsheet ROUNDUP()
  const paintGallons = paintProduct && paintProduct.coverage > 0
    ? (stainSqft * constants.stainCoverage) / paintProduct.coverage
    : 0
  const paintCost = paintProduct ? calcPaintCost(paintGallons, paintProduct) : 0

  const landm  = labor + paintCost + sundries
  const markup = calcMarkup(rules)
  const rawSub = markup > 0 ? (landm / markup) / (1 - rules.salesDiscount) : 0
  return rules.salesTax === 0 ? Math.round(rawSub) : rawSub
}
```

### 8. Wood Replacement

```typescript
// Each row: qty × rate / markup. Sum all rows.
const woodTotal = woodRows.reduce((sum, row) => {
  const rate = rates.woodReplacement[row.itemKey] ?? 0
  const qty  = row.front + row.right + row.back + row.left
  return sum + (qty * rate / markup)
}, 0)
```

### 9. Final Proposal Pricing

```typescript
const paintingSubtotal = jobType !== 'structures' ? (totals?.subtotal ?? 0) : 0
const structTotal      = jobType !== 'exterior'   ? structuresSubtotal       : 0
const combinedSubtotal = paintingSubtotal + structTotal + woodTotal + customTotal
const discountAmount   = applyDiscount ? combinedSubtotal * 0.10 : 0
const discounted       = combinedSubtotal - discountAmount
const taxAmount        = salesTaxRate != null ? discounted * salesTaxRate : 0
const grandTotal       = discounted + taxAmount
const depositAmount    = grandTotal * depositPercent   // default 20%
const balanceDue       = grandTotal - depositAmount
```

### 10. Sales Tax Lookup

Call the WA DOR API **directly from the browser** (CORS is open — do NOT proxy through a server):
```
GET https://webgis.dor.wa.gov/webapi/AddressRates.aspx?output=json&addr={street}&city={city}&zip={zip}
```
Parse city and zip from the client address string. Store result as `salesTaxRate` (e.g. `0.101`) on the estimate. If lookup fails or tax is disabled, set `salesTaxRate = null`.

---

## APPLICATION ITEM LIST

All items live in `lib/applicationList.ts`. The `uniqueKey` is `categoryKey.key`.
The `converter` = `1 / rate` (rate is units processed per hour).

### Prep Work (`categoryKey: 'prepWork'`) — no paint contribution
| key | label | unitLabel | rate |
|---|---|---|---|
| powerWash | Power Wash | SqFt | 1500 |
| scrapeOneBoard | Scrape 1 Side of Board | LnFt | 40 |
| scrapeSurface | Scrape Surface | SqFt | 100 |
| scuffSand | Scuff Sand | SqFt | 100 |
| lightSand | Light Sand | SqFt | 50 |
| heavySand | Heavy Sand | SqFt | 25 |
| primingBrushSqft | Priming w/ Brush (SqFt) | SqFt | 150 |
| primingBrushLnft | Priming w/ Brush (LnFt) | LnFt | 60 |
| scrapeSandPrimeLnft | Scrape, Sand & Prime (LnFt) | LnFt | 25 |
| ssp75to100 | Scrape/Sand/Prime — 75–100% Peeling | SqFt | 10 |
| ssp50to75 | Scrape/Sand/Prime — 50–75% Peeling | SqFt | 50 |
| ssp25to50 | Scrape/Sand/Prime — 25–50% Peeling | SqFt | 100 |
| ssp25orLess | Scrape/Sand/Prime — 25% or Less | SqFt | 200 |
| sspLocalized | Scrape/Sand/Prime — Localized Failure | # | 6 |
| caulking1Story | Caulking — 1 Story | LnFt | 100 |
| caulking2Story | Caulking — 2 Story | LnFt | 75 |
| caulking3Story | Caulking — 3rd Story | LnFt | 35 |
| manualPrepHours | Manual Prep Hours | Hrs | 1 |
| miscHazardHours | Misc / Hazard Hours | Hrs | 1 |
| managerUnits | Manager Units | # | 0 |

### Body Application (`categoryKey: 'bodyApplication'`, SqFt) — body paint; accent rows → accent paint
| key | label | rate | isAccent |
|---|---|---|---|
| sidingSpray | Siding Spray | 200 | |
| sidingSprayBackroll | Siding Spray w/ Backroll | 150 | |
| sidingRoll | Siding Roll | 125 | |
| masonrySpray | Masonry Spray | 150 | |
| masonrySprayBackroll | Masonry Spray w/ Backroll | 125 | |
| masonryRoll | Masonry Roll | 100 | |
| sidingBrush | Siding Brush | 100 | |
| masonryBrush | Masonry Brush | 75 | |
| oneCoatSidingSpray | One Coat Only Siding Spray | 150 | |
| stainingShakesBackbrush | Staining Shakes w/ Back Brush | 180 | |
| accentSidingSpray | Accent Siding Spray | 200 | ✓ |
| accentSidingSprayBackroll | Accent Siding Spray w/ Backroll | 150 | ✓ |
| accentSidingRoll | Accent Siding Roll | 125 | ✓ |
| accentMasonrySpray | Accent Masonry Spray | 150 | ✓ |
| accentMasonrySprayBackroll | Accent Masonry Spray w/ Backroll | 125 | ✓ |
| accentMasonryRoll | Accent Masonry Roll | 100 | ✓ |
| accentSidingBrush | Accent Siding Brush | 100 | ✓ |
| accentMasonryBrush | Accent Masonry Brush | 75 | ✓ |

### Eaves (`categoryKey: 'eaves'`, LnFt → SqFt via eavesWidthIn/12)
isBodyColor → null paint (covered by body spray). isTrimColor → trim paint.
| key | label | rate | flag |
|---|---|---|---|
| eavesBodyColor | Eaves — Body Color | 75 | isBodyColor |
| eavesTrimColor | Eaves — Trim Color | 45 | isTrimColor |
| eavesSeparateColor | Eaves — Separate Color | 35 | |
| eaves3rdBodyColor | 3rd Story Eaves — Body Color | 50 | isBodyColor |
| eaves3rdTrimColor | 3rd Story Eaves — Trim Color | 10 | isTrimColor |
| eaves3rdSeparateColor | 3rd Story Eaves — Sep. Color | 5 | |

### Fascia (`categoryKey: 'fascia'`, LnFt → SqFt via fasciaWidthIn/12) → trim paint
| key | label | rate |
|---|---|---|
| fascia1Story | Fascia — 1 Story | 40 |
| fascia2Story | Fascia — 2 Story | 35 |
| fascia3Story | Fascia — 3rd Story | 15 |

### Windows (`categoryKey: 'windows'`, Units) — trimLnFt per unit → SqFt via windowTrimWidthIn/12
| key | label | unitsPerHr | trimLnFt |
|---|---|---|---|
| vinylNoTrim | Window Vinyl — No Trim | 6 | 0 |
| woodNoTrimBody | Window Wood — No Trim (Body Color) | 2 | 0 |
| vinylWithTrim | Window Vinyl — With Trim | 2 | 16 |
| woodDontOpen | Window Wood — Don't Open | 1 | 32 |
| woodOpen | Window Wood — Open | 0.667 | 40 |
| threeDVinyl | Window 3D Vinyl | 1 | 20 |
| threeDWoodDontOpen | Window 3D Wood — Don't Open | 0.8 | 36 |
| threeDWoodOpen | Window 3D Wood — Open | 0.57 | 44 |
| twoToneWoodDontOpen | Window 2-Tone Wood — Don't Open | 0.667 | 32 |
| twoToneWoodOpen | Window 2-Tone Wood — Open | 0.5 | 40 |
| threeD2ToneWoodDontOpen | Window 3D 2-Tone Wood — Don't Open | 0.57 | 36 |
| threeD2ToneWoodOpen | Window 3D 2-Tone Wood — Open | 0.44 | 44 |

### Other Trim (`categoryKey: 'otherTrim'`, LnFt → SqFt via otherTrimWidthIn/12; downspouts use downspoutWidthIn/12)
| key | label | rate | isDownspout |
|---|---|---|---|
| otherTrim1Story | Other Trim — 1 Story | 40 | |
| otherTrim2PlusStory | Other Trim — 2+ Story | 35 | |
| downspoutsPosts | Downspouts / Posts (3–4 sides) | 20 | ✓ |
| trim3D | 3D Trim | 20 | |
| tudorTrimFacing | Tudor Trim Facing | 50 | |
| tudorTrim3D | Tudor Trim 3D | 30 | |
| removeReinstallDownspouts | Remove & Reinstall Downspouts | 20 | ✓ |
| justRemoveDownspouts | Just Remove Downspouts | 60 | ✓ |

### Doors (`categoryKey: 'doors'`, Units)
Face/frame split: `faceLnFt` takes door's color, `(trimLnFt − faceLnFt)` always takes trim color. SqFt = lnFt × (otherTrimWidthIn/12).
| key | label | unitsPerHr | trimLnFt | faceLnFt | flag |
|---|---|---|---|---|---|
| bodyColorNoTrim | Door — Body Color, No Trim | 4 | 0 | 0 | isBodyColor |
| bodyColorWithTrim | Door — Body Color, With Trim | 0.667 | 35 | 0 | isBodyColor |
| trimColorNoTrim | Door — Trim Color, No Trim | 0.667 | 70 | 70 | isTrimColor |
| trimColorWithTrim | Door — Trim Color, With Trim | 0.5 | 105 | 70 | isTrimColor |
| accentColorNoTrim | Door — Accent Color, No Trim | 0.5 | 70 | 70 | isAccent |
| accentColorWithTrim | Door — Accent Color, With Trim | 0.4 | 105 | 70 | isAccent |
| stainedToPaintedNoTrim | Door — Stained to Painted, No Trim | 0.4 | 70 | 70 | |
| stainedToPaintedWithTrim | Door — Stained to Painted, With Trim | 0.36 | 105 | 70 | |

### Sidelights (`categoryKey: 'sidelights'`, Units) — same face/frame logic as doors
| key | unitsPerHr | trimLnFt | faceLnFt | flag |
|---|---|---|---|---|
| bodyColorNoTrim | 8 | 0 | 0 | isBodyColor |
| bodyColorWithTrim | 2.667 | 25 | 0 | isBodyColor |
| trimColorNoTrim | 2.667 | 35 | 35 | isTrimColor |
| trimColorWithTrim | 2 | 60 | 35 | isTrimColor |
| accentColorNoTrim | 2.667 | 35 | 35 | isAccent |
| accentColorWithTrim | 1.6 | 60 | 35 | isAccent |
| stainedToPaintedNoTrim | 1.14 | 35 | 35 | |
| stainedToPaintedWithTrim | 0.73 | 60 | 35 | |

### Garage Doors (`categoryKey: 'garageDoors'`, Units)
Body color face → covered by body spray (0 paint added). Trim frame (`trimLnFt`) → trim paint. All garage doors are **sprayed** (use paintCoverageSpray).
| key | label | unitsPerHr | trimLnFt | flag |
|---|---|---|---|---|
| singleBodyColor | Single — Body Color | 1 | 50 | isBodyColor |
| singleBodyColorWindows | Single — Body Color w/ Windows | 0.8 | 50 | isBodyColor |
| singleTrimColor | Single — Trim Color | 0.667 | 265 | isTrimColor |
| singleTrimColorWindows | Single — Trim Color w/ Windows | 0.57 | 265 | isTrimColor |
| singleAccentColor | Single — Accent Color | 0.667 | 265 | isAccent |
| singleAccentColorWindows | Single — Accent Color w/ Windows | 0.57 | 265 | isAccent |
| doubleBodyColor | Double — Body Color | 0.667 | 70 | isBodyColor |
| doubleBodyColorWindows | Double — Body Color w/ Windows | 0.5 | 70 | isBodyColor |
| doubleTrimColor | Double — Trim Color | 0.44 | 500 | isTrimColor |
| doubleTrimColorWindows | Double — Trim Color w/ Windows | 0.36 | 500 | isTrimColor |
| doubleAccentColor | Double — Accent Color | 0.44 | 500 | isAccent |
| doubleAccentColorWindows | Double — Accent Color w/ Windows | 0.36 | 500 | isAccent |

### Railings (`categoryKey: 'railings'`, LnFt)
SqFt = LnFt × (railingsTrimRatio / 3) = LnFt × 8.667. Feed trim paint.
| key | label | rate (LnFt/hr) |
|---|---|---|
| railings1Color | Railings — 1 Color | 5 |
| railings2ColorEasy | Railings — 2 Color Easy | 4 |
| railings2ColorHard | Railings — 2 Color Hard | 2 |

### Shutters (`categoryKey: 'shutters'`, Units)
SqFt = units × shutterSqft. **Sprayed** (use paintCoverageSpray). Feed accent or trim paint.
| key | label | unitsPerHr | flag |
|---|---|---|---|
| accentGround | Shutters — Accent, Ground Level | 4 | isAccent |
| accentLadder | Shutters — Accent, Ladder | 2 | isAccent |
| trimGround | Shutters — Trim Color, Ground | 4 | isTrimColor |
| trimLadder | Shutters — Trim Color, Ladder | 2 | isTrimColor |

### Staining (`categoryKey: 'staining'`) — used in Structure add-ons only, feed stain paint
`surfaceAreaFactor` = sqft per input unit.
| key | label | rate (unit/hr) | surfaceAreaFactor |
|---|---|---|---|
| deckSolidStain | Deck Solid Stain | 100 | 1 |
| stairsSolidStain | Stairs Solid Stain | 4 | 10 |
| fenceFlatSpray | Fence Flat Spray | 20 | 5 |
| fenceBeamsSpray | Fence Beams Spray | 17.5 | 5 |
| fenceFlatBrushRoll | Fence Flat Brush/Roll | 10 | 5 |
| fenceBeamsBrushRoll | Fence Beams Brush/Roll | 6 | 5 |
| stainRailings | Stain Railings | 5 | 8.667 |
| stainPosts | Stain Posts | 20 | 1.333 |
| stainTrim | Stain Trim | 35 | 0.333 |

---

## DEFAULT PAINT PRODUCTS

```typescript
const DEFAULT_PAINT_PRODUCTS: PaintProduct[] = [
  { id: 'sw-super-paint-flat',    name: '(SW) Super Paint Flat',           singleGallon: 41.89, fiveGallon: 38.89, coverage: 400 },
  { id: 'sw-super-paint-satin',   name: '(SW) Super Paint Satin',          singleGallon: 43.99, fiveGallon: 40.99, coverage: 400 },
  { id: 'sw-emerald-rr-flat',     name: '(SW) Emerald Rain Refresh Flat',  singleGallon: 69.99, fiveGallon: 66.99, coverage: 350 },
  { id: 'sw-emerald-rr-satin',    name: '(SW) Emerald Rain Refresh Satin', singleGallon: 70.99, fiveGallon: 67.99, coverage: 350 },
  { id: 'sw-duration-flat',       name: '(SW) Duration Flat',              singleGallon: 54.99, fiveGallon: 51.99, coverage: 350 },
  { id: 'sw-duration-satin',      name: '(SW) Duration Satin',             singleGallon: 56.99, fiveGallon: 53.99, coverage: 350 },
  { id: 'sw-emerald-flat',        name: '(SW) Emerald Flat',               singleGallon: 59.99, fiveGallon: 56.99, coverage: 350 },
  { id: 'sw-emerald-satin',       name: '(SW) Emerald Satin',              singleGallon: 62.99, fiveGallon: 59.99, coverage: 350 },
  { id: 'sw-a100-flat',           name: '(SW) A-100 Flat',                 singleGallon: 37.00, fiveGallon: 35.00, coverage: 400 },
  { id: 'sw-a100-satin',          name: '(SW) A-100 Satin',                singleGallon: 39.00, fiveGallon: 37.00, coverage: 400 },
  { id: 'sw-super-deck-stain',    name: '(SW) Super Deck Stain',           singleGallon: 38.49, fiveGallon: 36.49, coverage: 400 },
  { id: 'sw-woodscapes-stain',    name: '(SW) Woodscapes Stain',           singleGallon: 42.19, fiveGallon: 40.19, coverage: 400 },
  { id: 'miller-evolution',       name: 'Miller Paint EVOLUTION',          singleGallon: 40.00, fiveGallon: 40.00, coverage: 450 },
  { id: 'no-paint',               name: 'No Paint (Client Providing)',      singleGallon:  7.00, fiveGallon:  7.00, coverage: 400 },
]
```

### Paint Brand Presets (for the proposal brand selector)
| key | label | bodyId | trimId | accentId | stainId |
|---|---|---|---|---|---|
| superPaint | Super Paint | sw-super-paint-flat | sw-super-paint-satin | sw-super-paint-flat | sw-super-deck-stain |
| duration | Duration | sw-duration-flat | sw-duration-satin | sw-super-paint-flat | sw-super-deck-stain |
| emerald | Emerald | sw-emerald-flat | sw-emerald-satin | sw-super-paint-flat | sw-super-deck-stain |
| emeraldRR | Emerald Rain Refresh | sw-emerald-rr-flat | sw-emerald-rr-satin | sw-super-paint-flat | sw-super-deck-stain |

---

## JOB TYPE SYSTEM

```
jobType: 'exterior'   → Show measurements + paint selection. Hide structures.
jobType: 'structures' → Show structures only. Hide measurements + paint selection.
jobType: 'both'       → Show everything.
```

In the proposal, `paintingSubtotal` is included when `jobType !== 'structures'`, and `structTotal` when `jobType !== 'exterior'`.

**Critical**: When "Generate Estimate" is clicked, the `jobType` field **must** be included in the save payload before opening the proposal page.

---

## WOOD REPLACEMENT RATES

```typescript
const woodReplacement = {
  trim1Story:           6.84,
  trim2Story:           7.57,
  regularSiding1Story:  9.00,
  regularSiding2Story:  10.00,
  cementFiber1Story:    8.00,
  cementFiber2Story:    9.50,
  doorFrame:            113.48,
  fascia1Story:         18.00,
  fascia2Story:         11.85,
  fascia1StoryGutter:   19.00,
  fascia2StoryGutter:   22.00,
  railings:             9.20,
  eaveSoffit1Story:     25.20,
  eaveSoffit2Story:     28.30,
  hardieBoard:          11.30,
}
```

---

## THE ESTIMATOR FORM (UX DESIGN)

The form is used on a tablet or laptop by a salesperson entering measurements from their notes. It must be **fast and error-resistant**.

### Design Goals
- Feels like a professional tool, not a spreadsheet
- Estimator should be able to fill it out in under 5 minutes
- Every section is clearly labeled with helpful descriptions
- Numbers-only inputs with good mobile keyboard support
- Smart defaults wherever possible
- Auto-save constantly so nothing is ever lost

### Form Sections (in order)

**1. Header**
- Sticky top bar with company logo and "Estimator Pro" wordmark
- "Save" button and "Generate Estimate ↗" button (opens proposal in new tab)
- Status chip showing draft/pending/sent/approved/rejected

**2. Job Type Selector**
- Prominent 3-way pill toggle at the very top of the form content
- Options: "Exterior Only" / "Structures Only" / "Exterior + Structures"
- Instantly shows/hides the relevant sections

**3. Client Information**
- Name, address (used for automatic tax lookup), phone, email
- Clean 2-column grid layout

**4. Measurements Table** *(Exterior only)*
- Each row: dropdown to select the application item (grouped by category), then 4 number inputs: Front / Right / Back / Left
- Show the row total and estimated hours in a subtle right column
- "Add Row" button at the bottom
- Items grouped in the dropdown: Prep Work, Body Application, Eaves, Fascia, Windows, Other Trim, Doors, Sidelights, Garage Doors, Railings, Shutters

**5. Wood Replacement** *(collapsible toggle, Exterior only)*
- Same table layout as measurements
- Dropdown: wood replacement item type
- Front / Right / Back / Left quantities (these are linear/square feet)

**6. Custom Items** *(collapsible toggle)*
- Description + price pairs
- Customer can see these as optional add-ons in the proposal

**7. Structure Add-ons** *(visible when jobType includes structures)*
- Toggle buttons to enable: Deck, Pergola, Fence, Shed
- Deck supports multiple independent entries ("Add Another Deck")
- Each structure shows a table: select staining item, enter amount
- Footer shows paint gallons estimate: `${Math.ceil(gallons)} gal`
- Each structure has its own paint product selector

**8. Paint Selection** *(Exterior only)*
- Brand quick-select buttons (SuperPaint / Duration / Emerald / Emerald Rain Refresh)
- Auto-fills Body / Trim / Accent / Stain dropdowns
- Advanced: manual override for custom products

**9. Scope of Work**
- Per-brand editable text fields: Project Overview, Prep Work, Painting, Clean Up, Walk Through, Paint Products
- Total Colors and Total Coats fields
- Pre-filled with professional default text per brand

**10. Photos**
- Upload multiple photos (Firebase Storage)
- Grid of thumbnails, tap to remove

---

## THE PROPOSAL PAGE (UX + VISUAL DESIGN)

This is the most important page in the entire app. It must be **stunning**. When a homeowner opens this on their phone, they should feel like they're receiving a world-class proposal.

### Design Philosophy
- Think of it like a premium product page from Apple, not a PDF attachment
- Every number is perfectly formatted as currency
- Generous whitespace, clean typography, strong visual hierarchy
- Mobile-first — most homeowners will open this on their phone
- The "Sign Today & Save 10%" card should create genuine excitement
- The signature experience should feel as natural as signing with a pen

### Layout & Sections

**Hero: Company Header**
- Company logo (centered or left-aligned) — hide placeholder box until image loads
- Company name, tagline
- License number, phone, website
- Divider

**Client + Project Info**
- "Prepared for: [Client Name]"
- Property address
- Date generated
- Estimate reference number

**Scope of Work**
- Formatted markdown-style text sections with headers:
  - Project Overview
  - Prep Work
  - Painting
  - Clean Up
  - Walk Through
  - Paint Products, Colors, Coats

**Project Photos**
- Responsive grid (2 columns mobile, 3+ desktop)
- Tap any photo to open a full-screen lightbox with prev/next arrows
- Smooth fade-in animation as photos load

**Choose Your Paint** *(hidden for `structures` job type)*
- Section heading: "Choose Your Paint"
- Subtext: "Select a paint tier to see how it affects your price."
- 4 pill buttons: Super Paint / Duration / Emerald / Emerald Rain Refresh
- The selected brand is highlighted with brand color
- Price updates **instantly** below when brand changes (all client-side math)
- This is interactive magic — the customer watches the number change in real time

**Optional Add-Ons**
- If wood replacement data exists: checkbox with label "Wood Replacement" and `+ $X,XXX`
- If custom items exist: checkbox per item with description and price
- Checking adds to the total; unchecking removes it

**Sign Today & Save 10% Card**
- Large, visually distinct card
- Green background when the toggle is ON
- Shows the exact dollar savings (e.g., "Save $680")
- Toggle switch (large, obvious, satisfying to tap)
- "10% discount applied — $680 savings included in your total" confirmation text

**Pricing Summary Card**
- Dark charcoal header bar with "YOUR ESTIMATE" in uppercase tracking
- Clean line items:
  - Exterior Painting — {Brand} ..... $XX,XXX
  - Deck — {Paint Name} .............. $X,XXX
  - Pergola — {Paint Name} ........... $X,XXX
  - Wood Replacement .................. $X,XXX
- Subtotal
- 10% Discount ........................ (−$XXX) in green
- Sales Tax (if applicable)
- Heavy divider
- **Grand Total** — large, bold, prominent
- Deposit Due Today (20%) — highlighted box
- Balance Due at Completion

**Warranty**
- Duration / Emerald / Emerald Rain Refresh: **5-Year Warranty**
- SuperPaint: **3-Year Warranty**
- Small badge/callout with a shield icon

**Terms & Conditions**
- Collapsed by default with "View Terms" expand button
- Full legal text inside

**Digital Signature Panel**
- "Ready to get started?" heading
- Full name text input (required)
- Canvas signature pad (smooth, responsive to touch and mouse)
- "Clear" button to redo signature
- Checkbox: "I agree to the terms and conditions and authorize [Company] to begin work upon receipt of deposit"
- Large "Accept Estimate" CTA button (disabled until name + signature + checkbox)
- On submit: save signature image to Firebase Storage, update estimate status to 'approved', show success state

**Post-Signature**
- Success message: "Thank you, [Name]! Your estimate has been accepted."
- Show the accepted grand total
- "Check your email for confirmation"
- The signature panel locks — can't re-sign

### Proposal Interaction Rules
- All price calculations happen **client-side** in real time
- Changing the brand selector → prices update instantly, no loading
- Toggling discount → prices update instantly
- Checking/unchecking add-ons → prices update instantly
- The only server call is on signature submission
- Page should feel instant and smooth throughout

---

## CRITICAL IMPLEMENTATION RULES

1. **`applicationKey` format**: Always `"categoryKey.key"` — e.g. `"bodyApplication.sidingSpray"`. Build the `appMap` as `Map<string, ApplicationItem>` keyed by `uniqueKey`.

2. **`converter` calculation**: `converter = 1 / rate` for all item types. For windows/doors/sidelights/shutters/garageDoors, rate = unitsPerHr and measurement unit = count.

3. **Multiple decks**: Store as `deckAddons[]` array. Support "Add Another Deck" in the form. Handle legacy `deckAddon` (singular) by migrating to an array on load. The proposal must also fall back to `deckAddon` if `deckAddons` is absent.

4. **jobType must be saved on generate**: The "Generate Estimate" button calls a quiet-save of ALL fields (including `jobType`) before opening the proposal. If `jobType` is not persisted, the proposal defaults to 'exterior' and hides all structure data.

5. **Paint gallons display**: Always `Math.ceil(rawGallons)` — matches spreadsheet `ROUNDUP()`.

6. **Subtotal rounding**: `rules.salesTax === 0` → `Math.round(rawSubtotal)`. With tax → keep fractional.

7. **Sales tax WA DOR**: Call from browser, not server. Parse city + zip from the address string. ZIP regex must anchor to end of string: `/(\d{5}(?:-\d{4})?)$/`.

8. **Logo loading**: Don't show the logo container (white box) until the `<img>` fires `onLoad`. Use `useState` to track loaded state.

9. **Body gallon reduction**: Accent-colored doors/sidelights displace body spray. Subtract: `(accentDoorSqft × paintCoverageBrushRoll) / accentPaint.coverage` from body gallons.

10. **stainCoverage is a multiplier** (default 1.3): `paintGallons = (stainSqft × stainCoverage) / coverage`. This is `Inputs!$B$42` from the original spreadsheet.

---

## DEFAULT SETTINGS

```typescript
// Business Rules
wage: 30, payrollBurden: 1,
netProfitMargin: 0.20, overheadMargin: 0.10,
marketingMargin: 0.10, salesMargin: 0.07, productionMgmtMargin: 0.07,
depositPercent: 0.20, salesDiscount: 0.10,
woodReplacementMinimum: 400, salesTax: 0.101

// Production Constants
paintCoverageSpray: 2, paintCoverageBrushRoll: 1.3,
cleanupHoursRatio: 20, stainCoverage: 1.3, sundriesPerHour: 1,
fasciaWidthIn: 18, eavesWidthIn: 24, otherTrimWidthIn: 4,
railingsTrimRatio: 26, windowTrimWidthIn: 4,
downspoutWidthIn: 12, shutterSqft: 6

// Company
Name: Vanhousing Painters LLC
Phone: 253-656-2328
Email: Vanhousingsales@gmail.com
Website: www.vanhousingpainters.com
Address: 17146 SE 248th Pl, Covington, WA 98042
License: VANHOPL820C6
```

---

## WHY THIS APP IS GREAT

**For the estimator:**
- 5 minutes from blank form to professional proposal
- No math — just enter what you measure
- Numbers match the spreadsheet they've trusted for years
- One click generates a beautiful link to send to the customer

**For the homeowner:**
- Opens on their phone like a premium web experience
- They can explore paint options and watch their price change live
- The 10% same-day discount creates natural urgency without being pushy
- Signing with their finger on the phone feels modern and effortless
- They immediately feel confident about the contractor

**What makes it feel premium:**
- Prices update instantly — no loading spinners, no page refreshes
- Perfect typography and spacing on every screen size
- Photos of their actual home build emotional investment
- The signature experience is as smooth as any modern app
- Status updates in real time — "Signed!" feels like a celebration
