import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { DEFAULT_COMPANY } from '@/lib/defaultSettings'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const [estimateSnap, companySnap] = await Promise.all([
      adminDb.collection('cabinetEstimates').doc(id).get(),
      adminDb.collection('settings').doc('company').get(),
    ])

    if (!estimateSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({
      estimate: { id: estimateSnap.id, ...estimateSnap.data() },
      company:  companySnap.exists ? { ...DEFAULT_COMPANY, ...companySnap.data() } : DEFAULT_COMPANY,
    })
  } catch (err) {
    console.error('cabinet-proposal API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
