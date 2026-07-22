export type EstimateStatus = 'draft' | 'pending' | 'sent' | 'approved' | 'rejected' | 'declined'
export type JobType = 'exterior' | 'structures' | 'both'

export interface EstimateRow {
  id: string
  applicationKey: string
  front: number
  right: number
  back: number
  left: number
}

export interface WoodReplacementRow {
  id: string
  itemKey: string   // key of ProductionRates['woodReplacement'], or '' for blank
  front: number
  right: number
  back: number
  left: number
}

export interface CustomItem {
  id: string
  description: string
  price: number
}

export interface ChangeOrderItem {
  id:          string
  description: string
  price:       number   // positive = add, negative = credit/removal
}

export interface StructureRow {
  id: string
  applicationKey: string
  amount: number
}

export interface StructureAddon {
  enabled:        boolean
  rows:           StructureRow[]
  paintProductId: string
}

export interface ScopeFields {
  scopeProject: string
  scopePrepWork: string
  scopePainting: string
  scopeCleanUp: string
  scopeWalkThrough: string
  scopePaintProducts: string
  totalColors: string
  totalCoats: string
}

export interface EstimateData {
  id?: string
  userId: string
  status: EstimateStatus
  estimateNumber?: number
  // Client
  clientName: string
  clientAddress: string
  clientPhone: string
  clientEmail: string
  clientFolderId: string
  clientContactId: string
  // Measurements
  rows: EstimateRow[]
  // Add ons
  woodReplacementRows?: WoodReplacementRow[]
  woodReplacementOpen?: boolean
  customItems?: CustomItem[]
  customItemsOpen?: boolean
  // Estimator-only manual override of the pre-tax subtotal (null/undefined = use calculated)
  subtotalOverride?: number | null
  // Estimator-editable "sign today" discount as a decimal (e.g. 0.10 = 10% off).
  // Undefined falls back to the global rules.salesDiscount default.
  discountPercent?: number | null
  // Structure add-ons
  deckAddon?:    StructureAddon   // legacy — superseded by deckAddons
  deckAddons?:   StructureAddon[]
  pergolaAddon?: StructureAddon
  fenceAddon?:   StructureAddon
  shedAddon?:    StructureAddon
  // Paint selections
  selectedBrand: string
  selectedBodyPaint: string
  selectedTrimPaint: string
  selectedAccentPaint: string
  selectedStainPaint: string
  manualPaintAProductId: string
  manualPaintAGallons: number
  manualPaintBProductId: string
  manualPaintBGallons: number
  // Scope of work — individual fields kept for backward compat
  scopeProject: string
  scopePrepWork: string
  scopePainting: string
  scopeCleanUp: string
  scopeWalkThrough: string
  scopePaintProducts: string
  scopePaintProductsByBrand?: Record<string, string>
  // Per-brand scope (source of truth going forward)
  scopeByBrand?: Record<string, ScopeFields>
  totalColors: string
  totalCoats: string
  // Photos
  photoUrls:  string[]
  photoNotes?: string[]   // index-matched notes for each photo
  // Tax
  salesTaxRate?: number | null  // e.g. 0.101 — looked up from WA DOR at time of generation; null = explicitly excluded
  taxExcluded?:  boolean  // when true, tax is intentionally not applied
  // Signature / acceptance
  signatureName?: string
  signatureDate?: string
  signatureDataUrl?: string
  // Invoice IDs for GHL updates
  depositInvoiceId?: string
  balanceInvoiceId?: string
  invoiceCreated?: boolean
  depositInvoiceUrl?: string
  balanceInvoiceUrl?: string
  // Payment tracking (set by GHL invoice-paid webhook)
  depositPaid?: boolean
  depositPaidMethod?: string   // 'check' | 'cash' | 'card' | 'bank_transfer' | etc.
  depositPaidAmount?: number
  depositPaidAt?: string       // ISO date
  balancePaid?: boolean
  balancePaidMethod?: string
  balancePaidAmount?: number
  balancePaidAt?: string
  // Change orders
  changeOrders?: ChangeOrderItem[]
  changeOrderDate?: string
  changeOrderNotes?: string
  isModified?: boolean
  // Job type
  jobType?: JobType
  // Cached grand total for list display (updated whenever estimate is viewed)
  cachedGrandTotal?:    number
  // Signed pricing (stored at acceptance time)
  signedGrandTotal?:    number
  signedDepositAmount?: number
  signedBalanceDue?:    number
  signedDepositPercent?: number
  signedTaxRate?:       number
  signedTaxCity?:       string
  // Frozen pricing basis captured at quote time (settings snapshot).
  // When present, the proposal + dashboard recompute against this instead of
  // live settings, so the customer's quote/signed price can never drift.
  pricingSnapshot?: {
    rules:         unknown
    constants:     unknown
    rates:         unknown
    paintProducts: unknown
    snapshottedAt: string
  }
  // Timestamps
  createdAt?: Date
  updatedAt?: Date
}

const BRAND_PAINT_NAMES: Record<string, string> = {
  superPaint: 'SuperPaint',
  duration:   'Duration',
  emerald:    'Emerald',
  emeraldRR:  'Emerald Rain Refresh',
}

export const SCOPE_DEFAULTS: ScopeFields = {
  scopeProject: '',
  scopePrepWork:
    '- Power wash the house.\n- Protect surrounding areas.\n- Mask areas not to be painted.\n- Scrape any peeling paint.\n- Prime any bare wood areas.\n- Caulk the cracks around the windows, trim, siding and other areas as necessary.',
  scopePainting:
    '- Paint the body, soffits same color.\n- Paint the trim an accent color.\n- Paint the garage door.\n- Paint the gutters and downspouts.\n- Paint the front door.',
  scopeCleanUp:
    '- Remove masking.\n- Dispose of all job related debris.',
  scopeWalkThrough:
    '- Walk thru inspection with owner.\n- Balance remaining is paid upon completion.',
  scopePaintProducts:
    'Sherwin Williams "SuperPaint" exterior acrylic latex paint.',
  totalColors: '',
  totalCoats: '',
}

export function getDefaultScopeForBrand(brandKey: string): ScopeFields {
  const brandName = BRAND_PAINT_NAMES[brandKey] ?? 'SuperPaint'
  return {
    ...SCOPE_DEFAULTS,
    scopePaintProducts: `Sherwin Williams "${brandName}" exterior acrylic latex paint.`,
  }
}
