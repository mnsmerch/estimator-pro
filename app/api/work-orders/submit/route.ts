import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { WorkOrderPdf } from '@/lib/pdf/workOrderPdf'
import type { WorkOrderPdfData } from '@/lib/pdf/workOrderPdf'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const SUBMIT_WEBHOOK = 'https://services.leadconnectorhq.com/hooks/KmTuAFWyGn4ijrs1sIzJ/webhook-trigger/00267f64-8fd0-4b1b-9cc5-298ebe289ee1'

function getAdminApp() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  const credentials = JSON.parse(raw)
  const bucketName  = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  if (!bucketName) throw new Error('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET not set')
  if (!getApps().find(a => a.name === '[DEFAULT]')) {
    initializeApp({ credential: cert(credentials), storageBucket: bucketName })
  }
  return { storage: getStorage().bucket(bucketName), db: getFirestore() }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      workOrderId:        string
      clientName:         string
      clientAddress:      string
      clientEmail:        string
      clientPhone:        string
      jobNumber:          string
      crmLink:            string
      projectTotal:       string
      painterPay:         string
      totalHours:         string
      materialsPrice:     string
      colorChange:        string
      numberOfColors:     string
      jobType:            string
      budgetHours:        string
      materialsBudget:    string
      paintsAndGallons:   string
      colorIds:           string
      scopeOfWork:        string
      exclusionsAndNotes: string
      status:             string
      createdAt:          string
      companyName:        string
      companyPhone:       string
      companyEmail:       string
      companyAddress:     string
      companyLicense:     string
      photoUrls?:         string[]
    }

    // 1. Generate PDF
    const pdfData: WorkOrderPdfData = {
      clientName:         body.clientName         ?? '',
      clientAddress:      body.clientAddress       ?? '',
      clientEmail:        body.clientEmail         ?? '',
      clientPhone:        body.clientPhone         ?? '',
      jobNumber:          body.jobNumber           ?? '',
      crmLink:            body.crmLink             ?? '',
      projectTotal:       body.projectTotal        ?? '',
      painterPay:         body.painterPay          ?? '',
      totalHours:         body.totalHours          ?? '',
      materialsPrice:     body.materialsPrice      ?? '',
      colorChange:        body.colorChange         ?? '',
      numberOfColors:     body.numberOfColors      ?? '',
      jobType:            body.jobType             ?? '',
      budgetHours:        body.budgetHours         ?? '',
      materialsBudget:    body.materialsBudget     ?? '',
      paintsAndGallons:   body.paintsAndGallons    ?? '',
      colorIds:           body.colorIds            ?? '',
      scopeOfWork:        body.scopeOfWork         ?? '',
      exclusionsAndNotes: body.exclusionsAndNotes  ?? '',
      status:             body.status              ?? 'new',
      createdAt:          body.createdAt           ?? '',
      companyName:        body.companyName         ?? 'Vanhousing Painters LLC',
      companyPhone:       body.companyPhone        ?? '',
      companyEmail:       body.companyEmail        ?? '',
      companyAddress:     body.companyAddress      ?? '',
      companyLicense:     body.companyLicense      ?? '',
      photoUrls:          body.photoUrls           ?? [],
    }

    const pdfBuffer = Buffer.from(await renderToBuffer(
      createElement(WorkOrderPdf, { data: pdfData }) as any  // eslint-disable-line @typescript-eslint/no-explicit-any
    ))

    // 2. Upload PDF to Firebase Storage
    const { storage, db } = getAdminApp()
    const ts       = new Date().toISOString().replace(/[:.]/g, '-')
    const safeName = (body.clientName ?? 'Client').replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_')
    const fileName = `work-orders/${safeName}_WorkOrder_${ts}.pdf`
    const file     = storage.file(fileName)

    await file.save(pdfBuffer, { metadata: { contentType: 'application/pdf' } })
    const [pdfUrl] = await file.getSignedUrl({ action: 'read', expires: '2099-01-01' })

    // 3. Update work order status to 'completed' + store PDF url
    if (body.workOrderId) {
      await db.collection('workOrders').doc(body.workOrderId).update({
        status:    'completed',
        pdfUrl,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    // 4. Fire the webhook
    await fetch(SUBMIT_WEBHOOK, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        workOrderId:        body.workOrderId,
        clientName:         body.clientName,
        clientAddress:      body.clientAddress,
        clientEmail:        body.clientEmail,
        clientPhone:        body.clientPhone,
        jobNumber:          body.jobNumber,
        jobType:            body.jobType,
        painterPay:         body.painterPay,
        totalHours:         body.totalHours,
        materialsPrice:     body.materialsPrice,
        budgetHours:        body.budgetHours,
        materialsBudget:    body.materialsBudget,
        colorChange:        body.colorChange,
        numberOfColors:     body.numberOfColors,
        paintsAndGallons:   body.paintsAndGallons,
        colorIds:           body.colorIds,
        scopeOfWork:        body.scopeOfWork,
        exclusionsAndNotes: body.exclusionsAndNotes,
        pdfUrl,
      }),
    })

    return NextResponse.json({ success: true, pdfUrl })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[work-orders/submit]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
