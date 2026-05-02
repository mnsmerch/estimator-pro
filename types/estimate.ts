export type EstimateStatus = 'draft' | 'sent' | 'approved' | 'rejected'

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

export interface EstimateData {
  id?: string
  userId: string
  status: EstimateStatus
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
  // Scope of work
  scopeProject: string
  scopePrepWork: string
  scopePainting: string
  scopeCleanUp: string
  scopeWalkThrough: string
  scopePaintProducts: string
  totalColors: string
  totalCoats: string
  // Photos
  photoUrls: string[]
  // Tax
  salesTaxRate?: number   // e.g. 0.101 — looked up from WA DOR at time of generation
  // Signature / acceptance
  signatureName?: string
  signatureDate?: string
  signatureDataUrl?: string
  // Timestamps
  createdAt?: Date
  updatedAt?: Date
}

export const SCOPE_DEFAULTS = {
  scopeProject: '',
  scopePrepWork:
    '- Power wash the house.\n- Protect surrounding areas.\n- Mask areas not to be painted.\n- Scrape any peeling paint.\n- Prime any bare wood areas.\n- Caulk the cracks around the windows, trim, siding and other areas as necessary.',
  scopePainting:
    '- Paint the body, soffits same color.\n- Paint the trim an accent color.\n- Paint the garage door.\n- Paint the gutters and downspouts.\n- Paint the front door.',
  scopeCleanUp:
    '- Remove masking.\n- Dispose of all job related debris.\n- Remove any drips (although we strive to not have any).',
  scopeWalkThrough:
    '- Walk thru inspection with owner.\n- Balance remaining is paid upon completion.',
  scopePaintProducts:
    'Sherwin Williams "SuperPaint" exterior acrylic latex paint or similar product if this one is not available.',
  totalColors: '',
  totalCoats: '',
}
