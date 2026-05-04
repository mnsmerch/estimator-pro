import { NextResponse } from 'next/server'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function getAdminDb() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set')
  const credentials = JSON.parse(raw)
  if (!getApps().find(a => a.name === '[DEFAULT]')) {
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? ''
    initializeApp({ credential: cert(credentials), storageBucket: bucketName })
  }
  return getFirestore()
}

export async function GET() {
  try {
    const db   = getAdminDb()
    const snap = await db.collection('signed_contracts').orderBy('signedAt', 'desc').get()

    const contracts = snap.docs.map(d => {
      const data = d.data()
      const ts   = data.signedAt
      const signedAt = ts && typeof ts.toDate === 'function'
        ? ts.toDate().toISOString()
        : null
      return {
        id:                d.id,
        displayName:       data.displayName   ?? data.clientName ?? '',
        clientName:        data.clientName    ?? '',
        estimateId:        data.estimateId    ?? '',
        grandTotal:        data.grandTotal    ?? 0,
        depositAmount:     data.depositAmount ?? 0,
        balanceDue:        data.balanceDue    ?? 0,
        pdfUrl:            data.pdfUrl            ?? null,
        depositInvoiceUrl: data.depositInvoiceUrl ?? null,
        signedAt,
      }
    })

    return NextResponse.json({ contracts })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[signed-contracts] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
