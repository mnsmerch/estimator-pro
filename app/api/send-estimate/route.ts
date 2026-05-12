import { NextResponse } from 'next/server'

const WEBHOOK_URL = 'https://services.leadconnectorhq.com/hooks/KmTuAFWyGn4ijrs1sIzJ/webhook-trigger/fff33137-5d91-424b-9220-043d0c0a5d22'

export async function POST(req: Request) {
  try {
    const body = await req.json() as {
      clientName: string
      clientAddress: string
      clientPhone: string
      clientEmail: string
      clientContactId: string
      clientFolderId: string
      estimateUrl: string
    }

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Webhook returned ${res.status}` }, { status: 502 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('send-estimate webhook error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
