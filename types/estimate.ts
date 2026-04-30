// Core types for Estimator Pro - we'll expand these as you share the Google Sheet logic

export type EstimateStatus = 'draft' | 'sent' | 'approved' | 'rejected'

export interface Estimate {
  id: string
  userId: string
  clientName: string
  clientEmail?: string
  clientPhone?: string
  address: string
  status: EstimateStatus
  createdAt: Date
  updatedAt: Date
  // Pricing fields — to be filled in as you share the Google Sheet formulas
  totalPrice?: number
  notes?: string
}
