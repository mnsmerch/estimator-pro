import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const COLLECTION = 'signed_contracts'

function getAdminDb() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set')
  const credentials = JSON.parse(raw)
  if (!getApps().find(a => a.name === '[DEFAULT]')) {
    initializeApp({ credential: cert(credentials) })
  }
  return getFirestore()
}

async function buildDisplayName(db: FirebaseFirestore.Firestore, clientName: string): Promise<string> {
  const snap = await db.collection(COLLECTION).where('clientName', '==', clientName).get()
  const count = snap.size
  if (count === 0) return clientName
  return `${clientName} ${count}`
}

export async function POST(req: NextRequest) {
  try {
    const { clientName, estimateId, grandTotal, depositAmount, balanceDue, pdfUrl, depositInvoiceUrl } =
      await req.json() as {
        clientName:        string
        estimateId:        string
        grandTotal:        number
        depositAmount:     number
        balanceDue:        number
        pdfUrl:            string | null
        depositInvoiceUrl: string | null
      }

    if (!clientName || !estimateId) {
      return NextResponse.json({ error: 'clientName and estimateId are required' }, { status: 400 })
    }

    const db = getAdminDb()
    const displayName = await buildDisplayName(db, clientName)

    const ref = await db.collection(COLLECTION).add({
      clientName,
      displayName,
      estimateId,
      grandTotal,
      depositAmount,
      balanceDue,
      pdfUrl:            pdfUrl ?? null,
      depositInvoiceUrl: depositInvoiceUrl ?? null,
      signedAt:          FieldValue.serverTimestamp(),
    })

    console.log('[save-signed-contract] Saved:', ref.id, displayName)
    return NextResponse.json({ success: true, id: ref.id, displayName })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[save-signed-contract] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
