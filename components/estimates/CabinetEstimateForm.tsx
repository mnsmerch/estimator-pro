'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import {
  createCabinetEstimate, updateCabinetEstimate,
  resetSignatureForCabinetChangeOrder,
} from '@/lib/firebase/cabinetEstimates'
import type { CabinetEstimateRecord } from '@/lib/firebase/cabinetEstimates'
import { uploadPhoto, deletePhoto } from '@/lib/firebase/storage'
import AppHeader from '@/components/AppHeader'
import {
  calculateCabinet, CABINET_SCOPE_DEFAULTS, CABINET_PRICING, sumCabinetCustomItems,
} from '@/types/cabinetEstimate'
import type { CabinetEstimateDraft, LargePanelEntry } from '@/types/cabinetEstimate'

// ── Tax lookup (direct WA DOR, CORS: *) ──────────────────────────────────────

const WA_DOR_URL = 'https://webgis.dor.wa.gov/webapi/AddressRates.aspx'

async function taxLookupCall(addr: string, city: string, zip: string): Promise<number | null> {
  try {
    const params = new URLSearchParams({ output: 'text', addr, city, zip })
    const res = await fetch(`${WA_DOR_URL}?${params}`)
    if (!res.ok) return null
    const text = await res.text()
    const rateMatch = text.match(/Rate=([\d.]+)/)
    const codeMatch = text.match(/ResultCode=(\d+)/)
    const rate       = rateMatch ? parseFloat(rateMatch[1]) : null
    const resultCode = codeMatch ? parseInt(codeMatch[1])   : null
    if (rate === null || resultCode === null || resultCode >= 6) return null
    return rate
  } catch { return null }
}

async function lookupSalesTax(fullAddress: string): Promise<number | null> {
  try {
    // Anchor to end of string to avoid matching 5-digit street numbers
    const zipMatch  = fullAddress.match(/(\d{5}(?:-\d{4})?)\s*$/)
    const zip       = zipMatch?.[1] ?? ''
    const parts     = fullAddress.split(/[,\n]+/).map(s => s.trim()).filter(Boolean)
    const addr      = parts[0] ?? ''
    const cityChunk = parts[1] ?? ''
    const city      = cityChunk.replace(/\s+[A-Za-z]{2}\s+[\d-]+$/, '').replace(/\s+[A-Za-z]{2}$/, '').trim()

    const rate = await taxLookupCall(addr, city, zip)
    if (rate !== null) return rate
    if (zip) {
      const rate2 = await taxLookupCall('', city, zip)
      if (rate2 !== null) return rate2
      const rate3 = await taxLookupCall('', '', zip)
      if (rate3 !== null) return rate3
    }
    return null
  } catch { return null }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function newPanel(): LargePanelEntry {
  return { id: crypto.randomUUID(), doorEquivalents: '' }
}

function newDraft(): CabinetEstimateDraft {
  return {
    clientName: '', address: '', clientPhone: '', clientEmail: '', salesTaxRate: null,
    doors: '', drawers: '', panelsDoorSize: '', largePanels: [],
    twoTone: false, patchHoles: false, aquaCoat: false,
    scope: { ...CABINET_SCOPE_DEFAULTS },
    photoUrls: [], notes: '',
    customItems: [],
  }
}

function recordToDraft(r: CabinetEstimateRecord): CabinetEstimateDraft {
  return {
    clientName:    r.clientName,
    address:       r.address,
    clientPhone:   r.clientPhone   ?? '',
    clientEmail:   r.clientEmail   ?? '',
    salesTaxRate:  r.salesTaxRate  ?? null,
    doors:         r.doors,
    drawers:       r.drawers,
    panelsDoorSize: r.panelsDoorSize,
    largePanels:   r.largePanels   ?? [],
    twoTone:       r.twoTone       ?? false,
    patchHoles:    r.patchHoles    ?? false,
    aquaCoat:      r.aquaCoat      ?? false,
    scope:         r.scope         ?? { ...CABINET_SCOPE_DEFAULTS },
    photoUrls:     r.photoUrls     ?? [],
    notes:         r.notes         ?? '',
    customItems:   r.customItems   ?? [],
  }
}

function fmtD(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtDec(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CabinetEstimateForm({
  estimateId,
  initialRecord,
}: {
  estimateId?:    string
  initialRecord?: CabinetEstimateRecord
}) {
  const router  = useRouter()
  const { user } = useAuth()

  const [draft, setDraft] = useState<CabinetEstimateDraft>(() =>
    initialRecord ? recordToDraft(initialRecord) : newDraft()
  )
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [taxLookupFailed, setTaxLookupFailed] = useState(false)
  const [uploadingPhotos, setUploadingPhotos] = useState(false)
  const [lightboxIndex, setLightboxIndex]     = useState<number | null>(null)

  const isEditing = !!estimateId

  // ── Computed breakdown ───────────────────────────────────────────────────
  const bd = calculateCabinet(draft)
  const customTotal = sumCabinetCustomItems(draft.customItems)
  const grandTotal  = bd.total + customTotal

  // ── Save draft ───────────────────────────────────────────────────────────
  async function handleSave() {
    if (!user || !draft.clientName.trim()) return
    setSaving(true)
    try {
      if (estimateId) {
        await updateCabinetEstimate(estimateId, draft)
      } else {
        const id = await createCabinetEstimate(draft, user.uid)
        router.replace(`/estimates/cabinet/${id}/edit`)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  // ── Generate estimate (lookup tax, save, open proposal) ──────────────────
  async function handleGenerate() {
    if (!estimateId || !user) return
    setSaving(true)
    setTaxLookupFailed(false)
    try {
      const taxRate = draft.address ? await lookupSalesTax(draft.address) : null
      if (draft.address && taxRate === null) setTaxLookupFailed(true)
      const updatedDraft = { ...draft, salesTaxRate: taxRate }
      setDraft(updatedDraft)
      await updateCabinetEstimate(estimateId, updatedDraft)
      if (initialRecord?.status === 'draft' || !initialRecord?.status) {
        await updateCabinetEstimate(estimateId, { status: 'pending' })
      } else if (initialRecord?.status === 'approved') {
        await resetSignatureForCabinetChangeOrder(estimateId)
      }
      window.open(`/cp/${estimateId}?t=${Date.now()}`, '_blank')
    } finally {
      setSaving(false)
    }
  }

  // ── Photo upload ─────────────────────────────────────────────────────────
  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user || !e.target.files?.length) return
    setUploadingPhotos(true)
    try {
      const remaining = 20 - draft.photoUrls.length
      const files = Array.from(e.target.files).slice(0, remaining)
      const urls = await Promise.all(files.map(f => uploadPhoto(user.uid, f)))
      setDraft(prev => ({ ...prev, photoUrls: [...prev.photoUrls, ...urls].slice(0, 20) }))
    } finally {
      setUploadingPhotos(false)
      e.target.value = ''
    }
  }

  async function handlePhotoDelete(url: string) {
    const idx = draft.photoUrls.indexOf(url)
    setDraft(prev => ({
      ...prev,
      photoUrls:  prev.photoUrls.filter(u => u !== url),
      photoNotes: (prev.photoNotes ?? []).filter((_, i) => i !== idx),
    }))
    try { await deletePhoto(url) } catch { /* non-blocking */ }
  }

  function setPhotoNote(index: number, note: string) {
    setDraft(prev => {
      const notes = [...(prev.photoNotes ?? [])]
      while (notes.length < prev.photoUrls.length) notes.push('')
      notes[index] = note
      return { ...prev, photoNotes: notes }
    })
  }

  // ── Large panel helpers ──────────────────────────────────────────────────
  function addLargePanel() {
    setDraft(prev => ({ ...prev, largePanels: [...prev.largePanels, newPanel()] }))
  }

  function updateLargePanel(id: string, doorEquivalents: number | '') {
    setDraft(prev => ({
      ...prev,
      largePanels: prev.largePanels.map(p => p.id === id ? { ...p, doorEquivalents } : p),
    }))
  }

  function removeLargePanel(id: string) {
    setDraft(prev => ({ ...prev, largePanels: prev.largePanels.filter(p => p.id !== id) }))
  }

  // ── Custom add-on helpers ──────────────────────────────────────────────────
  function addCustomItem() {
    setDraft(prev => ({
      ...prev,
      customItems: [...(prev.customItems ?? []), { id: crypto.randomUUID(), description: '', price: 0 }],
    }))
  }

  function updateCustomItem(id: string, field: 'description' | 'price', value: string | number) {
    setDraft(prev => ({
      ...prev,
      customItems: (prev.customItems ?? []).map(i => i.id === id ? { ...i, [field]: value } : i),
    }))
  }

  function removeCustomItem(id: string) {
    setDraft(prev => ({ ...prev, customItems: (prev.customItems ?? []).filter(i => i.id !== id) }))
  }

  // ── Input helpers ────────────────────────────────────────────────────────
  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1'
  const sectionCard = 'bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 space-y-4'

  const optionItem = (
    checked: boolean,
    onChange: () => void,
    label: string,
    sublabel: string,
    price: string,
  ) => (
    <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
      checked ? 'border-brand-300 bg-brand-50' : 'border-gray-200 hover:border-gray-300'
    }`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 w-4 h-4 rounded accent-brand-600 shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{sublabel}</p>
      </div>
      <span className="text-sm font-semibold text-gray-700 shrink-0">{price}</span>
    </label>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-5">

        {/* ── Page title + generate button ──────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {isEditing ? 'Edit Cabinet Estimate' : 'New Cabinet Estimate'}
            </h1>
            {isEditing && (
              <p className="text-sm text-gray-500 mt-0.5">
                <a href="/estimates" className="hover:text-brand-600">← Back to Estimates</a>
              </p>
            )}
          </div>
          {isEditing && (
            <div className="flex items-center gap-2 shrink-0">
              {initialRecord?.status === 'approved' && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Signed
                </span>
              )}
              <button
                onClick={handleGenerate}
                disabled={saving}
                className="hidden sm:inline-flex px-4 py-2 text-sm font-medium rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : initialRecord?.status === 'approved' ? 'Generate New Estimate ↗' : 'Generate Estimate ↗'}
              </button>
            </div>
          )}
        </div>

        {/* ── Client info ───────────────────────────────────────────────── */}
        <div className={sectionCard}>
          <h2 className="text-base font-semibold text-gray-900">Client Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Client Name</label>
              <input
                type="text" placeholder="Jane Smith"
                value={draft.clientName}
                onChange={e => setDraft(prev => ({ ...prev, clientName: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Address</label>
              <input
                type="text" placeholder="e.g. 123 Main St, Seattle WA 98101"
                value={draft.address}
                onChange={e => { setDraft(prev => ({ ...prev, address: e.target.value, salesTaxRate: null })); setTaxLookupFailed(false) }}
                className={inputCls}
              />
              {draft.salesTaxRate != null
                ? <p className="mt-1 text-xs text-green-600">WA sales tax: {(draft.salesTaxRate * 100).toFixed(1)}%</p>
                : taxLookupFailed
                  ? <p className="mt-1 text-xs text-amber-600">Tax rate not found — check address includes city &amp; zip</p>
                  : null
              }
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input
                type="tel" placeholder="253-555-0100"
                value={draft.clientPhone ?? ''}
                onChange={e => setDraft(prev => ({ ...prev, clientPhone: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email" placeholder="client@email.com"
                value={draft.clientEmail ?? ''}
                onChange={e => setDraft(prev => ({ ...prev, clientEmail: e.target.value }))}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* ── Cabinet items ─────────────────────────────────────────────── */}
        <div className={sectionCard}>
          <h2 className="text-base font-semibold text-gray-900">Cabinet Items</h2>

          {/* Doors & Drawers */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Doors <span className="text-gray-400 font-normal">({fmtD(CABINET_PRICING.perDoor)}/door)</span></label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0" placeholder="0"
                  value={draft.doors === '' ? '' : draft.doors}
                  onChange={e => setDraft(prev => ({ ...prev, doors: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) }))}
                  className={inputCls}
                />
                {bd.doorsTotal > 0 && (
                  <span className="text-sm font-semibold text-gray-600 shrink-0 w-16 text-right">{fmtD(bd.doorsTotal)}</span>
                )}
              </div>
            </div>
            <div>
              <label className={labelCls}>Drawers <span className="text-gray-400 font-normal">({fmtD(CABINET_PRICING.perDrawer)}/drawer)</span></label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0" placeholder="0"
                  value={draft.drawers === '' ? '' : draft.drawers}
                  onChange={e => setDraft(prev => ({ ...prev, drawers: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) }))}
                  className={inputCls}
                />
                {bd.drawersTotal > 0 && (
                  <span className="text-sm font-semibold text-gray-600 shrink-0 w-16 text-right">{fmtD(bd.drawersTotal)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Panels */}
          <div className="pt-2 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Panels <span className="text-gray-400 font-normal">({fmtD(CABINET_PRICING.perPanelDoorEquiv)}/door-equivalent)</span></h3>

            {/* Door-size panels */}
            <div className="mb-3">
              <label className={labelCls}>Door-size panels <span className="text-gray-400 font-normal">(1 door-equivalent each)</span></label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min="0" placeholder="0"
                  value={draft.panelsDoorSize === '' ? '' : draft.panelsDoorSize}
                  onChange={e => setDraft(prev => ({ ...prev, panelsDoorSize: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0) }))}
                  className={`${inputCls} max-w-[140px]`}
                />
                {(draft.panelsDoorSize !== '' && draft.panelsDoorSize > 0) && (
                  <span className="text-sm font-semibold text-gray-600">{fmtD((draft.panelsDoorSize as number) * CABINET_PRICING.perPanelDoorEquiv)}</span>
                )}
              </div>
            </div>

            {/* Large panels */}
            {draft.largePanels.length > 0 && (
              <div className="space-y-2 mb-3">
                <label className={labelCls}>Large panels <span className="text-gray-400 font-normal">(enter how many door-sizes fit)</span></label>
                {draft.largePanels.map((panel, idx) => (
                  <div key={panel.id} className="flex items-center gap-2">
                    <span className="text-sm text-gray-500 shrink-0 w-20">Panel {idx + 1}</span>
                    <input
                      type="number" min="1" placeholder="2"
                      value={panel.doorEquivalents === '' ? '' : panel.doorEquivalents}
                      onChange={e => updateLargePanel(panel.id, e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                      className={`${inputCls} max-w-[100px]`}
                    />
                    <span className="text-xs text-gray-400">door-equivalents</span>
                    {panel.doorEquivalents !== '' && panel.doorEquivalents > 0 && (
                      <span className="text-sm font-semibold text-gray-600 ml-auto">
                        {fmtD((panel.doorEquivalents as number) * CABINET_PRICING.perPanelDoorEquiv)}
                      </span>
                    )}
                    <button
                      onClick={() => removeLargePanel(panel.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors ml-1"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={addLargePanel}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              + Add large panel
            </button>
          </div>
        </div>

        {/* ── Options ───────────────────────────────────────────────────── */}
        <div className={sectionCard}>
          <h2 className="text-base font-semibold text-gray-900">Options</h2>
          <div className="space-y-2">
            {optionItem(
              draft.twoTone,
              () => setDraft(prev => ({ ...prev, twoTone: !prev.twoTone })),
              'Two-tone color scheme',
              'Frame/box in one color, doors & drawers in a second color',
              `+${fmtD(CABINET_PRICING.twoTone)}`,
            )}
            {optionItem(
              draft.patchHoles,
              () => setDraft(prev => ({ ...prev, patchHoles: !prev.patchHoles })),
              'Patch / drill new holes for handles',
              `Per door or drawer — ${bd.doors + bd.drawers} items`,
              bd.patchHolesTotal > 0
                ? `+${fmtD(bd.patchHolesTotal)}`
                : `+${fmtD(CABINET_PRICING.perPatchDrill)}/ea`,
            )}
            {optionItem(
              draft.aquaCoat,
              () => setDraft(prev => ({ ...prev, aquaCoat: !prev.aquaCoat })),
              'AquaCoat grain filler (2 coats)',
              `Applied to all doors & drawers before painting — ${bd.doors + bd.drawers} items`,
              bd.aquaCoatTotal > 0
                ? `+${fmtD(bd.aquaCoatTotal)}`
                : `+${fmtD(CABINET_PRICING.perAquaCoat)}/ea`,
            )}
          </div>
        </div>

        {/* ── Custom add-ons ────────────────────────────────────────────── */}
        <div className={sectionCard}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Custom Add-ons</h2>
              <p className="text-xs text-gray-500 mt-0.5">Add any extra line item with your own price</p>
            </div>
            <button
              onClick={addCustomItem}
              className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Item
            </button>
          </div>

          {(draft.customItems?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-400 text-center py-5 border-2 border-dashed border-gray-100 rounded-xl">
              No custom items yet — click &ldquo;Add Item&rdquo; to add one
            </p>
          ) : (
            <div className="space-y-3">
              {(draft.customItems ?? []).map((item, idx) => (
                <div key={item.id} className="flex gap-3 items-start">
                  <span className="text-xs font-medium text-gray-400 mt-2.5 w-5 shrink-0">{idx + 1}</span>
                  <div className="flex-1">
                    <input
                      type="text"
                      value={item.description}
                      onChange={e => updateCustomItem(item.id, 'description', e.target.value)}
                      placeholder="Describe the add-on…"
                      className={inputCls}
                    />
                  </div>
                  <div className="w-32 shrink-0">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={item.price || ''}
                        onChange={e => updateCustomItem(item.id, 'price', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className={`${inputCls} pl-7`}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => removeCustomItem(item.id)}
                    className="mt-1.5 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                    title="Remove item"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {customTotal > 0 && (
                <div className="flex justify-end pt-2 border-t border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">
                    Custom Total: <span className="text-brand-700">{fmtDec(customTotal)}</span>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Live pricing summary ──────────────────────────────────────── */}
        {(bd.total > 0 || customTotal > 0) && (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-800 text-white text-center text-xs font-bold py-2.5 tracking-widest uppercase">
              Estimate Summary
            </div>
            <div className="p-5 space-y-2">
              {bd.doorsTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{bd.doors} door{bd.doors !== 1 ? 's' : ''} × {fmtD(CABINET_PRICING.perDoor)}</span>
                  <span className="font-medium">{fmtD(bd.doorsTotal)}</span>
                </div>
              )}
              {bd.drawersTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{bd.drawers} drawer{bd.drawers !== 1 ? 's' : ''} × {fmtD(CABINET_PRICING.perDrawer)}</span>
                  <span className="font-medium">{fmtD(bd.drawersTotal)}</span>
                </div>
              )}
              {bd.panelsTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">{bd.totalPanelEquivs} panel door-equiv × {fmtD(CABINET_PRICING.perPanelDoorEquiv)}</span>
                  <span className="font-medium">{fmtD(bd.panelsTotal)}</span>
                </div>
              )}
              {bd.twoToneTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Two-tone color scheme</span>
                  <span className="font-medium">{fmtD(bd.twoToneTotal)}</span>
                </div>
              )}
              {bd.patchHolesTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Patch / drill holes ({bd.doors + bd.drawers} items × {fmtD(CABINET_PRICING.perPatchDrill)})</span>
                  <span className="font-medium">{fmtD(bd.patchHolesTotal)}</span>
                </div>
              )}
              {bd.aquaCoatTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">AquaCoat grain filler ({bd.doors + bd.drawers} items × {fmtD(CABINET_PRICING.perAquaCoat)})</span>
                  <span className="font-medium">{fmtD(bd.aquaCoatTotal)}</span>
                </div>
              )}
              {(draft.customItems ?? [])
                .filter(i => i.description?.trim() && i.price > 0)
                .map(item => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-gray-600">{item.description}</span>
                    <span className="font-medium">{fmtD(item.price)}</span>
                  </div>
                ))}
              <div className="border-t border-gray-100 pt-3 mt-1">
                {bd.minimumApplied && (
                  <>
                    <div className="flex justify-between text-sm text-gray-400 line-through mb-1">
                      <span>Calculated subtotal</span>
                      <span>{fmtD(bd.subtotal)}</span>
                    </div>
                    <div className={`flex justify-between text-sm text-amber-700 ${customTotal > 0 ? 'mb-2' : ''}`}>
                      <span className="font-medium">Minimum applies</span>
                      <span className={customTotal > 0 ? 'font-medium' : 'font-bold'}>{fmtD(bd.total)}</span>
                    </div>
                  </>
                )}
                {(!bd.minimumApplied || customTotal > 0) && (
                  <div className="flex justify-between">
                    <span className="font-bold text-gray-900">Total</span>
                    <span className="font-bold text-gray-900 text-lg">{fmtD(grandTotal)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Scope of work ─────────────────────────────────────────────── */}
        <div className={sectionCard}>
          <h2 className="text-base font-semibold text-gray-900">Scope of Work</h2>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Project Description</label>
              <textarea
                rows={4}
                value={draft.scope.projectDescription}
                onChange={e => setDraft(prev => ({ ...prev, scope: { ...prev.scope, projectDescription: e.target.value } }))}
                className={`${inputCls} resize-y font-mono text-xs`}
              />
            </div>
            <div>
              <label className={labelCls}>Prep Work</label>
              <textarea
                rows={8}
                value={draft.scope.prepWork}
                onChange={e => setDraft(prev => ({ ...prev, scope: { ...prev.scope, prepWork: e.target.value } }))}
                className={`${inputCls} resize-y font-mono text-xs`}
              />
            </div>
            <div>
              <label className={labelCls}>Paint Process</label>
              <textarea
                rows={5}
                value={draft.scope.paintProcess}
                onChange={e => setDraft(prev => ({ ...prev, scope: { ...prev.scope, paintProcess: e.target.value } }))}
                className={`${inputCls} resize-y font-mono text-xs`}
              />
            </div>
            <div>
              <label className={labelCls}>Final Touches</label>
              <textarea
                rows={6}
                value={draft.scope.finalTouches}
                onChange={e => setDraft(prev => ({ ...prev, scope: { ...prev.scope, finalTouches: e.target.value } }))}
                className={`${inputCls} resize-y font-mono text-xs`}
              />
            </div>
            <div>
              <label className={labelCls}>Paint Products</label>
              <textarea
                rows={3}
                value={draft.scope.paintProducts}
                onChange={e => setDraft(prev => ({ ...prev, scope: { ...prev.scope, paintProducts: e.target.value } }))}
                className={`${inputCls} resize-y font-mono text-xs`}
              />
            </div>
          </div>
        </div>

        {/* ── Notes ─────────────────────────────────────────────────────── */}
        <div className={sectionCard}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Notes</h2>
            <span className="text-xs text-gray-400">Internal only — not shown on proposal</span>
          </div>
          <textarea
            rows={3}
            placeholder="Any internal notes about this project…"
            value={draft.notes ?? ''}
            onChange={e => setDraft(prev => ({ ...prev, notes: e.target.value }))}
            className={`${inputCls} resize-y`}
          />
        </div>

        {/* ── Photos ────────────────────────────────────────────────────── */}
        <div className={sectionCard}>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Photos</h2>
            <span className="text-xs text-gray-400">{draft.photoUrls.length} / 20</span>
          </div>
          {draft.photoUrls.length === 0 ? (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl py-8 cursor-pointer hover:border-brand-400 transition-colors">
              <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M13.5 12a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
              </svg>
              <span className="text-sm text-gray-500">Upload project photos</span>
              <span className="text-xs text-gray-400 mt-1">Up to 20 photos</span>
              <input type="file" accept="image/*" multiple className="hidden" disabled={uploadingPhotos} onChange={handlePhotoUpload} />
            </label>
          ) : (
            <div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {draft.photoUrls.map((url, idx) => (
                  <div key={url} className="flex flex-col rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                    <div className="relative aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url} alt={`Photo ${idx + 1}`}
                        className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setLightboxIndex(idx)}
                      />
                      <button
                        onClick={() => handlePhotoDelete(url)}
                        className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold"
                      >
                        ×
                      </button>
                    </div>
                    <input
                      type="text"
                      value={draft.photoNotes?.[idx] ?? ''}
                      onChange={e => setPhotoNote(idx, e.target.value)}
                      placeholder="Add a note…"
                      className="w-full px-2 py-1.5 text-xs text-gray-700 placeholder-gray-400 bg-white border-t border-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-400"
                    />
                  </div>
                ))}
              </div>
              {draft.photoUrls.length < 20 && (
                <label className="mt-3 inline-flex items-center gap-2 text-sm text-brand-600 hover:text-brand-700 cursor-pointer font-medium">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add more photos
                  <input type="file" accept="image/*" multiple className="hidden" disabled={uploadingPhotos} onChange={handlePhotoUpload} />
                </label>
              )}
            </div>
          )}
        </div>

        {/* ── Save / Generate buttons ───────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3 pb-12">
          <button
            onClick={handleSave}
            disabled={saving || !draft.clientName.trim()}
            className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Draft'}
          </button>
          {isEditing && (
            <button
              onClick={handleGenerate}
              disabled={saving}
              className="sm:hidden px-6 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : 'Generate Estimate ↗'}
            </button>
          )}
          {!isEditing && (
            <p className="text-sm text-gray-400">Save first to generate an estimate</p>
          )}
        </div>

      </main>

      {/* ── Lightbox ──────────────────────────────────────────────────────── */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={draft.photoUrls[lightboxIndex]}
            alt={`Photo ${lightboxIndex + 1}`}
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-4 right-4 w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
