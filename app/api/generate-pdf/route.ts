import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createElement } from 'react'
import { ProposalPdf, type ProposalPdfData } from '@/lib/pdf/proposalPdf'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'

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

    const { data, fileName } = body

    // ── 1. Generate PDF ────────────────────────────────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(
      createElement(ProposalPdf, { data }) as any
    )

    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64')

    // ── 2. Upload to Firebase Storage ─────────────────────────────────────────

    let storageUrl:  string | null = null
    let storageError: string | null = null

    try {
      const bucket     = getAdminStorage()
      const storagePath = `signed-contracts/${fileName}`
      const file       = bucket.file(storagePath)

      await file.save(pdfBuffer, {
        metadata: { contentType: 'application/pdf' },
      })

      // Signed URL valid for 10 years
      const [url] = await file.getSignedUrl({
        action:  'read',
        expires: '2099-01-01',
      })
      storageUrl = url
      console.log('[generate-pdf] Uploaded to Firebase Storage:', storagePath)
    } catch (err: unknown) {
      storageError = err instanceof Error ? err.message : String(err)
      console.error('[generate-pdf] Storage upload failed:', storageError)
    }

    return NextResponse.json({ pdfBase64, fileName, storageUrl, storageError })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[generate-pdf] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
