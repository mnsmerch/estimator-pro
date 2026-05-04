import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { ProposalPdf, type ProposalPdfData } from '@/lib/pdf/proposalPdf'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { google } from 'googleapis'
import { Readable } from 'stream'

// ── Firebase Admin — estimator-pro (singleton) ────────────────────────────────

function getAdminStorage() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set')
  const credentials = JSON.parse(raw)
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  if (!bucketName) throw new Error('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET env var not set')
  if (!getApps().find(a => a.name === '[DEFAULT]')) {
    initializeApp({ credential: cert(credentials), storageBucket: bucketName })
  }
  // Explicitly pass bucket name so it works regardless of default app config
  return getStorage().bucket(bucketName)
}

function getAdminDb() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set')
  const credentials = JSON.parse(raw)
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? ''
  if (!getApps().find(a => a.name === '[DEFAULT]')) {
    initializeApp({ credential: cert(credentials), storageBucket: bucketName })
  }
  return getFirestore()
}

async function saveSignedContract(params: {
  clientName:    string
  estimateId:    string
  grandTotal:    number
  depositAmount: number
  balanceDue:    number
  pdfUrl:        string | null
}): Promise<void> {
  const db = getAdminDb()
  const { clientName } = params

  // Build a unique display name: "John Smith — May 3, 2026"
  // If another record was already saved today for the same name, append a counter
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const baseName  = `${clientName} — ${dateLabel}`
  const snap      = await db.collection('signed_contracts').where('clientName', '==', clientName).get()
  const count     = snap.size
  const displayName = count === 0 ? baseName : `${baseName} (${count})`

  await db.collection('signed_contracts').add({
    ...params,
    displayName,
    depositInvoiceUrl: null,
    signedAt: FieldValue.serverTimestamp(),
  })
  console.log('[generate-pdf] Signed contract saved:', displayName)
}

// ── Firebase Admin — access-vlad (GHL tokens) ────────────────────────────────

function getGhlDb() {
  const raw = process.env.GHL_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GHL_SERVICE_ACCOUNT_JSON env var not set')
  const existing = getApps().find(a => a.name === 'ghl')
  const app = existing ?? initializeApp({ credential: cert(JSON.parse(raw)) }, 'ghl')
  return getFirestore(app)
}

async function getGhlLocationToken(): Promise<string> {
  const db = getGhlDb()
  const doc = await db.collection('ghl_location_tokens').doc('KmTuAFWyGn4ijrs1sIzJ').get()
  const data = doc.data()
  if (!data?.access_token) throw new Error('GHL location token not found')
  return data.access_token as string
}

async function uploadToGhl(pdfBuffer: Buffer, fileName: string, contactId: string): Promise<string> {
  const token      = await getGhlLocationToken()
  const locationId = 'KmTuAFWyGn4ijrs1sIzJ'
  const fieldId    = 'yRKdZINUML56aYQcevFk'
  const headers    = { 'Authorization': `Bearer ${token}`, 'Version': '2023-02-21' }

  // Step 1: upload file
  const form = new FormData()
  form.append('id', contactId)
  form.append('maxFiles', '25')
  const uint8 = new Uint8Array(pdfBuffer)
  form.append(fieldId, new Blob([uint8], { type: 'application/pdf' }), fileName)

  const uploadRes = await fetch(
    `https://services.leadconnectorhq.com/locations/${locationId}/customFields/upload`,
    { method: 'POST', headers, body: form }
  )
  const uploadJson = await uploadRes.json() as { uploadedFiles?: Record<string, string> }
  const fileUrl = uploadJson.uploadedFiles?.[fileName]
  if (!fileUrl) throw new Error('GHL upload returned no file URL')

  // Step 2: attach to contact custom field
  const updateRes = await fetch(
    `https://services.leadconnectorhq.com/contacts/${contactId}`,
    {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customFields: [{ id: fieldId, field_value: fileUrl }]
      }),
    }
  )
  if (!updateRes.ok) {
    const err = await updateRes.text()
    throw new Error(`GHL contact update failed: ${err}`)
  }

  return fileUrl
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      data: ProposalPdfData
      folderId?: string
      fileName: string
      contactId?: string
      estimateId?: string
    }

    const { data, folderId, fileName, contactId, estimateId } = body

    // ── 1. Generate PDF ────────────────────────────────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(
      createElement(ProposalPdf, { data }) as any
    )

    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64')

    // ── 2. Upload to Google Drive (primary) ───────────────────────────────────

    let driveLink:  string | null = null
    let driveError: string | null = null

    console.log('[generate-pdf] folderId received:', JSON.stringify(folderId))
    console.log('[generate-pdf] fileName:', fileName)

    if (folderId) {
      try {
        const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
        if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set')
        const credentials = JSON.parse(raw)
        console.log('[generate-pdf] service account:', credentials.client_email)

        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/drive'],
        })
        const drive = google.drive({ version: 'v3', auth })

        const uploaded = await drive.files.create({
          supportsAllDrives: true,
          requestBody: {
            name:     fileName,
            parents:  [folderId],
            mimeType: 'application/pdf',
          },
          media: {
            mimeType: 'application/pdf',
            body:     Readable.from(pdfBuffer),
          },
          fields: 'id, webViewLink',
        })

        driveLink = uploaded.data.webViewLink ?? null
        console.log('[generate-pdf] Drive upload OK:', fileName, '→', uploaded.data.id)
      } catch (err: unknown) {
        driveError = err instanceof Error ? err.message : String(err)
        console.error('[generate-pdf] Drive upload failed:', driveError)
      }
    }

    // ── 3. Firebase Storage backup (always runs) ──────────────────────────────

    let storageUrl:   string | null = null
    let storageError: string | null = null

    try {
      const bucketName  = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!
      const storagePath = `signed-contracts/${fileName}`
      console.log('[generate-pdf] Storage bucket:', bucketName, 'path:', storagePath)
      const file        = getAdminStorage().file(storagePath)
      await file.save(pdfBuffer, { metadata: { contentType: 'application/pdf' } })
      const [url] = await file.getSignedUrl({ action: 'read', expires: '2099-01-01' })
      storageUrl = url
      console.log('[generate-pdf] Firebase Storage backup OK:', storagePath)
    } catch (err: unknown) {
      storageError = err instanceof Error ? err.message : String(err)
      console.error('[generate-pdf] Firebase Storage backup failed:', storageError)
    }

    // ── 4. GHL — upload PDF to contact's Files custom field ───────────────────

    let ghlUrl:   string | null = null
    let ghlError: string | null = null

    if (contactId) {
      try {
        ghlUrl = await uploadToGhl(pdfBuffer, fileName, contactId)
        console.log('[generate-pdf] GHL upload OK:', ghlUrl)
      } catch (err: unknown) {
        ghlError = err instanceof Error ? err.message : String(err)
        console.error('[generate-pdf] GHL upload failed:', ghlError)
      }
    }

    // ── 5. Save signed contract record ───────────────────────────────────────

    if (estimateId && data.clientName) {
      try {
        const pdfUrl = driveLink ?? storageUrl ?? null
        await saveSignedContract({
          clientName:    data.clientName,
          estimateId,
          grandTotal:    data.grandTotal,
          depositAmount: data.depositAmount,
          balanceDue:    data.balanceDue,
          pdfUrl,
        })
      } catch (err: unknown) {
        console.error('[generate-pdf] saveSignedContract failed:', err instanceof Error ? err.message : String(err))
        // Non-critical — don't fail the whole request
      }
    }

    return NextResponse.json({
      pdfBase64,
      fileName,
      driveLink,
      driveError,
      storageUrl,
      storageError,
      ghlUrl,
      ghlError,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[generate-pdf] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
