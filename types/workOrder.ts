export interface WorkOrderData {
  // Auto-populated from estimate
  estimateId:       string
  estimateType:     'exterior' | 'interior'
  clientName:       string
  clientAddress:    string
  clientEmail:      string
  clientPhone:      string
  clientContactId:  string

  // Editable by PM
  jobNumber:        string
  crmLink:          string
  painterPay:       string
  colorChange:      string   // 'Same Color' | 'Change - Have' | 'Change - Need'
  numberOfColors:   string
  jobType:          string   // 'Residential Exterior' | 'Commercial Exterior' | 'Residential Interior' | 'Commercial Interior' | 'Cabinet'
  budgetHours:      string
  materialsBudget:  string
  paintsAndGallons: string   // multiline: "Body: X Gal\nTrim: X Gal\nAccent/Other: X Gal"
  colorIds:         string   // multiline color IDs
  scopeOfWork:      string   // pre-populated from estimate scope, editable
  exclusionsAndNotes: string

  // Meta
  status:    'new' | 'in_progress' | 'completed'
  createdAt: string
  updatedAt: string
}
