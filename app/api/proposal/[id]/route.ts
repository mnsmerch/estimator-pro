import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import {
  DEFAULT_BUSINESS_RULES,
  DEFAULT_PRODUCTION_CONSTANTS,
  DEFAULT_RATES,
  DEFAULT_PAINT_PRODUCTS,
  DEFAULT_COMPANY,
} from '@/lib/defaultSettings'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  try {
    const [estimateSnap, rulesSnap, constantsSnap, paintSnap, ratesSnap, companySnap] =
      await Promise.all([
        adminDb.collection('estimates').doc(id).get(),
        adminDb.collection('settings').doc('businessRules').get(),
        adminDb.collection('settings').doc('productionConstants').get(),
        adminDb.collection('settings').doc('paintProducts').get(),
        adminDb.collection('settings').doc('rates').get(),
        adminDb.collection('settings').doc('company').get(),
      ])

    if (!estimateSnap.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const estimate = { id: estimateSnap.id, ...estimateSnap.data() }

    return NextResponse.json({
      estimate,
      rules:         rulesSnap.exists    ? { ...DEFAULT_BUSINESS_RULES,         ...rulesSnap.data()     } : DEFAULT_BUSINESS_RULES,
      constants:     constantsSnap.exists ? { ...DEFAULT_PRODUCTION_CONSTANTS,   ...constantsSnap.data() } : DEFAULT_PRODUCTION_CONSTANTS,
      paintProducts: paintSnap.exists    ? (paintSnap.data()?.items ?? DEFAULT_PAINT_PRODUCTS)           : DEFAULT_PAINT_PRODUCTS,
      rates:         ratesSnap.exists    ? { ...DEFAULT_RATES,                   ...ratesSnap.data()     } : DEFAULT_RATES,
      company:       companySnap.exists  ? { ...DEFAULT_COMPANY,                 ...companySnap.data()   } : DEFAULT_COMPANY,
    })
  } catch (err) {
    console.error('proposal API error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
