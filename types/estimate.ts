export type EstimateStatus = 'draft' | 'sent' | 'approved' | 'rejected'

export interface EstimateRow {
  id: string
  applicationKey: string
  front: number
  right: number
  back: number
  left: number
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
  // Measurements
  rows: EstimateRow[]
  // Paint selections
  selectedBodyPaint: string
  selectedTrimPaint: string
  selectedAccentPaint: string
  selectedStainPaint: string
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
