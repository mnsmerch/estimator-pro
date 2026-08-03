import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { FieldValue } from 'firebase-admin/firestore'

// Existing GHL webhook — for estimates linked to a GHL contact
const GHL_WEBHOOK = 'https://services.leadconnectorhq.com/hooks/KmTuAFWyGn4ijrs1sIzJ/webhook-trigger/fff33137-5d91-424b-9220-043d0c0a5d22'

// Manual estimate webhook — for estimates created from scratch (no GHL contact)
const MANUAL_SEND_WEBHOOK = 'https://services.leadconnectorhq.com/hooks/KmTuAFWyGn4ijrs1sIzJ/webhook-trigger/357d69b4-728c-4839-8614-9085540b6853'

const COLLECTIONS: Record<string, string> = {
  exterior: 'estimates',
  interior: 'interiorEstimates',
  cabinet:  'cabinetEstimates',
}

function parseAddress(address: string) {
  // Strip country suffix (Google Places appends ", USA")
  const cleaned    = address.replace(/,?\s*(?:USA|United States)\s*$/i, '').trim()
  const zipMatch   = cleaned.match(/(\d{5}(?:-\d{4})?)/)
  const zip        = zipMatch ? zipMatch[1] : ''
  const stateMatch = cleaned.match(/\b([A-Z]{2})\s+\d{5}/)
  const state      = stateMatch ? stateMatch[1] : ''
  const parts      = cleaned.split(/[,\n]+/).map((s: string) => s.trim()).filter(Boolean)
  const address1   = parts[0] ?? ''
  const cityRaw    = parts[1] ?? ''
  const city       = cityRaw.replace(/\s+[A-Z]{2}\s+[\d-]+$/, '').replace(/\s+[A-Z]{2}$/, '').trim()
  return { address1, city, state, zip }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      clientName:      string
      clientAddress:   string
      clientPhone:     string
      clientEmail:     string
      clientContactId: string
      clientFolderId:  string
      estimateUrl:     string
      estimateId?:     string
      estimateType?:   string
      subtotal?:       number
      discountAmount?: number
      grandTotal?:     number
      taxRate?:        number
      taxAmount?:      number
    }

    const isManual = !body.clientContactId

    const webhookUrl = isManual ? MANUAL_SEND_WEBHOOK : GHL_WEBHOOK

    let payload: Record<string, unknown>
    if (isManual) {
      const addr = parseAddress(body.clientAddress ?? '')
      payload = {
        clientName:     body.clientName,
        clientAddress1: addr.address1,
        clientCity:     addr.city,
        clientState:    addr.state,
        clientZip:      addr.zip,
        clientEmail:    body.clientEmail,
        clientPhone:    body.clientPhone,
        estimateType:   body.estimateType ?? 'exterior',
        estimateUrl:    body.estimateUrl,
        subtotal:       body.subtotal       ?? 0,
        discountAmount: body.discountAmount ?? 0,
        grandTotal:     body.grandTotal     ?? 0,
        taxRate:        body.taxRate        ?? 0,
        taxAmount:      body.taxAmount      ?? 0,
      }
    } else {
      payload = body as unknown as Record<string, unknown>
    }

    const res = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Webhook returned ${res.status}` }, { status: 502 })
    }

    if (body.estimateId) {
      const collection = COLLECTIONS[body.estimateType ?? 'exterior'] ?? 'estimates'
      await adminDb.collection(collection).doc(body.estimateId).update({
        status:    'sent',
        ...(body.grandTotal ? { cachedGrandTotal: body.grandTotal } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('send-estimate webhook error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
