import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { google } from 'googleapis'
import { Readable } from 'stream'
import { createElement } from 'react'
import { ProposalPdf, type ProposalPdfData } from '@/lib/pdf/proposalPdf'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      data: ProposalPdfData
      folderId: string
      fileName: string
    }

    const { data, folderId, fileName } = body

    if (!folderId) {
      return NextResponse.json({ error: 'No folder ID on this estimate' }, { status: 400 })
    }

    // ── 1. Generate PDF ────────────────────────────────────────────────────────

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(
      createElement(ProposalPdf, { data }) as any
    )

    // ── 2. Authenticate with Google Drive ─────────────────────────────────────

    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var not set')
    const credentials = JSON.parse(raw)

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    })

    const drive = google.drive({ version: 'v3', auth })

    // ── 3. Upload to Drive ────────────────────────────────────────────────────

    const stream = Readable.from(pdfBuffer)

    const uploaded = await drive.files.create({
      supportsAllDrives: true,
      requestBody: {
        name:    fileName,
        parents: [folderId],
        mimeType: 'application/pdf',
      },
      media: {
        mimeType: 'application/pdf',
        body:     stream,
      },
      fields: 'id, webViewLink',
    })

    const fileId      = uploaded.data.id      ?? ''
    const webViewLink = uploaded.data.webViewLink ?? ''

    console.log('[generate-pdf] Uploaded:', fileName, '→ Drive file', fileId)

    return NextResponse.json({ fileId, webViewLink })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[generate-pdf] Error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
