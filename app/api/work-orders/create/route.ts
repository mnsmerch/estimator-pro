import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

function getAdminDb() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  const existing = getApps().find(a => a.name === '[DEFAULT]')
  if (!existing) {
    initializeApp({ credential: cert(JSON.parse(raw)) })
  }
  return getFirestore()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      estimateId?:       string
      estimateType?:     string
      clientName?:       string
      clientAddress?:    string
      clientEmail?:      string
      clientPhone?:      string
      clientContactId?:  string
      scopeOfWork?:      string
      painterPay?:       string
      totalHours?:       string
      materialsPrice?:   string
      projectTotal?:     string
      paintsAndGallons?: string
      jobType?:          string
      jobNumber?:        string
      fullPrice?:        string
      discountAmount?:   string
      photoUrls?:        string[]
      [key: string]:     unknown
    }

    const db = getAdminDb()

    const docRef = await db.collection('workOrders').add({
      // Auto-populated from estimate
      estimateId:       body.estimateId      ?? '',
      estimateType:     body.estimateType    ?? 'exterior',
      clientName:       body.clientName      ?? '',
      clientAddress:    body.clientAddress   ?? '',
      clientEmail:      body.clientEmail     ?? '',
      clientPhone:      body.clientPhone     ?? '',
      clientContactId:  body.clientContactId ?? '',

      // Pre-populated from estimate calculation
      totalHours:       body.totalHours       ?? '',
      materialsPrice:   body.materialsPrice   ?? '',
      projectTotal:     body.projectTotal     ?? '',
      paintsAndGallons: body.paintsAndGallons ?? '',
      fullPrice:        body.fullPrice        ?? '',
      discountAmount:   body.discountAmount   ?? '',
      photoUrls:        body.photoUrls        ?? [],

      // Editable by PM
      jobNumber:        body.jobNumber ?? '',
      crmLink:          '',
      painterPay:       body.painterPay ?? '',
      colorChange:      '',
      numberOfColors:   '',
      jobType:          body.jobType ?? '',
      budgetHours:      '',
      materialsBudget:  '',
      colorIds:         '',
      scopeOfWork:      body.scopeOfWork     ?? '',
      exclusionsAndNotes: '',

      // Meta
      status:    'new',
      userId:    'webhook',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return NextResponse.json({ success: true, workOrderId: docRef.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[work-orders/create] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
