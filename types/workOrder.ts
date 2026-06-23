export interface WorkOrderData {
  // Auto-populated from estimate
  estimateId:       string
  estimateType:     'exterior' | 'interior'
  clientName:       string
  clientAddress:    string
  clientEmail:      string
  clientPhone:      string
  clientContactId:  string

  // Auto-populated from estimate calc, editable by PM
  totalHours:       string   // from calcEstimate totalHours
  materialsPrice:   string   // paint cost + sundries
  projectTotal:     string   // grand total signed by customer

  // Editable by PM
  jobNumber:        string
  crmLink:          string
  painterPay:       string
  colorChange:      string   // 'Same Color' | 'Change - Have' | 'Change - Need'
  numberOfColors:   string
  jobType:          string   // 'Residential Exterior' | 'Commercial Exterior' | 'Residential Interior' | 'Commercial Interior' | 'Cabinet'
  budgetHours:      string
  materialsBudget:  string
  paintsAndGallons: string   // multiline: "Body: Product - X Gal\nTrim: Product - X Gal\nAccent/Other: Product - X Gal"
  colorIds:         string   // multiline color IDs
  scopeOfWork:      string   // pre-populated from estimate scope, editable
  exclusionsAndNotes: string

  // Pricing breakdown (for PM reference — not in submitted PDF)
  fullPrice:      string   // combinedSubtotal before discount
  discountAmount: string   // 10% discount amount
  // Photos from estimate
  photoUrls:      string[]

  // Meta
  status:    'new' | 'in_progress' | 'completed'
  createdAt: string
  updatedAt: string
}
