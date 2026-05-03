import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { ProposalPdf, type ProposalPdfData } from '@/lib/pdf/proposalPdf'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'
import { google } from 'googleapis'
import { Readable } from 'stream'

// ── Firebase Admin (singleton) ────────────────────────────────────────────────

function getAdminStorage() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set')
  const credentials = JSON.parse(raw)
  const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  if (!bucket) throw new Error('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET env var not set')
  if (!getApps().length) {
    initializeApp({ credential: cert(credentials), storageBucket: bucket })
  }
  return getStorage().bucket()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      data: ProposalPdfData
      folderId?: string
      fileName: string
    }

    const { data, folderId, fileName } = body

    // ── 1. Generate PDF ────────────────────────────────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(
      createElement(ProposalPdf, { data }) as any
    )

    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64')

    // ── 2. Upload to Google Drive (primary) ───────────────────────────────────

    let driveLink:  string | null = null
    let driveError: string | null = null

    if (folderId) {
      try {
        const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
        if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set')
        const credentials = JSON.parse(raw)

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
      const bucket      = getAdminStorage()
      const storagePath = `signed-contracts/${fileName}`
      const file        = bucket.file(storagePath)
      await file.save(pdfBuffer, { metadata: { contentType: 'application/pdf' } })
      const [url] = await file.getSignedUrl({ action: 'read', expires: '2099-01-01' })
      storageUrl = url
      console.log('[generate-pdf] Firebase Storage backup OK:', storagePath)
    } catch (err: unknown) {
      storageError = err instanceof Error ? err.message : String(err)
      console.error('[generate-pdf] Firebase Storage backup failed:', storageError)
    }

    return NextResponse.json({
      pdfBase64,
      fileName,
      driveLink,
      driveError,
      storageUrl,
      storageError,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[generate-pdf] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
