import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import {
  DEFAULT_INTERIOR_RULES,
  DEFAULT_INTERIOR_PAINT_PRODUCTS,
  DEFAULT_INTERIOR_RATES,
  DEFAULT_INTERIOR_CONSTANTS,
  DEFAULT_COMPANY,
} from '@/lib/defaultSettings'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const [estimateSnap, rulesSnap, paintSnap, ratesSnap, constantsSnap, companySnap] =
      await Promise.all([
        adminDb.collection('interiorEstimates').doc(id).get(),
        adminDb.collection('settings').doc('interiorBusinessRules').get(),
        adminDb.collection('settings').doc('interiorPaintProducts').get(),
        adminDb.collection('settings').doc('interiorRates').get(),
        adminDb.collection('settings').doc('interiorProductionConstants').get(),
        adminDb.collection('settings').doc('company').get(),
      ])

    if (!estimateSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({
      estimate:  { id: estimateSnap.id, ...estimateSnap.data() },
      rules:     rulesSnap.exists     ? { ...DEFAULT_INTERIOR_RULES,          ...rulesSnap.data()     } : DEFAULT_INTERIOR_RULES,
      products:  paintSnap.exists     ? (paintSnap.data()?.items ?? DEFAULT_INTERIOR_PAINT_PRODUCTS)   : DEFAULT_INTERIOR_PAINT_PRODUCTS,
      rates:     ratesSnap.exists     ? { ...DEFAULT_INTERIOR_RATES,          ...ratesSnap.data()     } : DEFAULT_INTERIOR_RATES,
      constants: constantsSnap.exists ? { ...DEFAULT_INTERIOR_CONSTANTS,      ...constantsSnap.data() } : DEFAULT_INTERIOR_CONSTANTS,
      company:   companySnap.exists   ? { ...DEFAULT_COMPANY,                 ...companySnap.data()   } : DEFAULT_COMPANY,
    })
  } catch (err) {
    console.error('interior-proposal API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
