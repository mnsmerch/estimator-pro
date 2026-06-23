import { NextResponse } from 'next/server'
import { adminDb } from '@/lib/firebase/admin'
import { DEFAULT_PAINT_PRODUCTS } from '@/lib/defaultSettings'
import type { PaintProduct } from '@/types/settings'

/**
 * One-time / on-demand sync: appends any catalog default paint products that
 * are missing (by id) from the saved settings doc. Idempotent — existing
 * products (and their edited prices) are left untouched; only genuinely new
 * products are added.
 */
export async function POST() {
  try {
    const ref  = adminDb.collection('settings').doc('paintProducts')
    const snap = await ref.get()
    const existing = (snap.exists ? (snap.data()?.items as PaintProduct[]) : null) ?? []

    const existingIds = new Set(existing.map(p => p.id))
    const toAdd = DEFAULT_PAINT_PRODUCTS.filter(p => !existingIds.has(p.id))

    if (toAdd.length === 0) {
      return NextResponse.json({ success: true, added: 0, total: existing.length })
    }

    const merged = [...existing, ...toAdd]
    await ref.set({ items: merged }, { merge: true })

    return NextResponse.json({
      success: true,
      added:   toAdd.length,
      addedNames: toAdd.map(p => p.name),
      total:   merged.length,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sync-paint-products]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
