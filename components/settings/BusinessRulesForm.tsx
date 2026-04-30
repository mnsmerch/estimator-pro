'use client'

import { useEffect, useState } from 'react'
import { getSettingsDoc, saveSettingsDoc } from '@/lib/firebase/settings'
import { DEFAULT_BUSINESS_RULES, DEFAULT_PRODUCTION_CONSTANTS } from '@/lib/defaultSettings'
import type { BusinessRules, ProductionConstants } from '@/types/settings'

function calcMarkup(r: BusinessRules): number {
  const sum = r.netProfitMargin + r.overheadMargin + r.marketingMargin +
    r.salesMargin + r.productionMgmtMargin +
    r.additionalMargin1 + r.additionalMargin2 + r.additionalMargin3 +
    r.additionalMargin4 + r.additionalMargin5
  return Math.max(0, 1 - sum)
}

export default function BusinessRulesForm() {
  const [rules, setRules] = useState<BusinessRules>(DEFAULT_BUSINESS_RULES)
  const [constants, setConstants] = useState<ProductionConstants>(DEFAULT_PRODUCTION_CONSTANTS)
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('loading')

  useEffect(() => {
    Promise.all([
      getSettingsDoc<BusinessRules>('businessRules', DEFAULT_BUSINESS_RULES),
      getSettingsDoc<ProductionConstants>('productionConstants', DEFAULT_PRODUCTION_CONSTANTS),
    ]).then(([r, c]) => { setRules(r); setConstants(c) })
      .finally(() => setStatus('idle'))
  }, [])

  function setRule(key: keyof BusinessRules, value: number) {
    setRules(prev => ({ ...prev, [key]: value }))
  }
  function setConst(key: keyof ProductionConstants, value: number) {
    setConstants(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setStatus('saving')
    try {
      await Promise.all([
        saveSettingsDoc('businessRules', rules),
        saveSettingsDoc('productionConstants', constants),
      ])
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('error')
    }
  }

  const markup = calcMarkup(rules)

  if (status === 'loading') return <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>

  return (
    <div className="space-y-8">

      {/* Labor */}
      <Section title="Labor">
        <Row label="Wage ($/hr)" hint="Use highest or average painter wage">
          <DollarInput value={rules.wage} onChange={v => setRule('wage', v)} />
        </Row>
        <Row label="Payroll Burden" hint="Multiplier on wage (1 = no burden)">
          <NumberInput value={rules.payrollBurden} onChange={v => setRule('payrollBurden', v)} step={0.01} />
        </Row>
      </Section>

      {/* Margins */}
      <Section title="Margins & Markup">
        <Row label="Net Profit Margin"><PctInput value={rules.netProfitMargin} onChange={v => setRule('netProfitMargin', v)} /></Row>
        <Row label="Overhead Margin"><PctInput value={rules.overheadMargin} onChange={v => setRule('overheadMargin', v)} /></Row>
        <Row label="Marketing Margin"><PctInput value={rules.marketingMargin} onChange={v => setRule('marketingMargin', v)} /></Row>
        <Row label="Sales Margin"><PctInput value={rules.salesMargin} onChange={v => setRule('salesMargin', v)} /></Row>
        <Row label="Production Management Margin"><PctInput value={rules.productionMgmtMargin} onChange={v => setRule('productionMgmtMargin', v)} /></Row>
        <Row label="Additional Margin 1"><PctInput value={rules.additionalMargin1} onChange={v => setRule('additionalMargin1', v)} /></Row>
        <Row label="Additional Margin 2"><PctInput value={rules.additionalMargin2} onChange={v => setRule('additionalMargin2', v)} /></Row>
        <Row label="Additional Margin 3"><PctInput value={rules.additionalMargin3} onChange={v => setRule('additionalMargin3', v)} /></Row>
        <Row label="Additional Margin 4"><PctInput value={rules.additionalMargin4} onChange={v => setRule('additionalMargin4', v)} /></Row>
        <Row label="Additional Margin 5"><PctInput value={rules.additionalMargin5} onChange={v => setRule('additionalMargin5', v)} /></Row>
        <Row label="Mark Up (Labor & Materials)" hint="Auto-calculated: 1 − sum of all margins above">
          <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-semibold text-gray-800 w-28 text-right">
            {(markup * 100).toFixed(2)}%
          </div>
        </Row>
      </Section>

      {/* Payment */}
      <Section title="Payment & Discounts">
        <Row label="Deposit %"><PctInput value={rules.depositPercent} onChange={v => setRule('depositPercent', v)} /></Row>
        <Row label="Sales Discount"><PctInput value={rules.salesDiscount} onChange={v => setRule('salesDiscount', v)} /></Row>
        <Row label="Wood Replacement Minimum ($)"><DollarInput value={rules.woodReplacementMinimum} onChange={v => setRule('woodReplacementMinimum', v)} /></Row>
        <Row label="Sales Tax"><PctInput value={rules.salesTax} onChange={v => setRule('salesTax', v)} /></Row>
      </Section>

      {/* Production Constants */}
      <Section title="Production Constants">
        <Row label="Paint coverage — Spraying (multiplier)"><NumberInput value={constants.paintCoverageSpray} onChange={v => setConst('paintCoverageSpray', v)} step={0.1} /></Row>
        <Row label="Paint coverage — Brush/Roll (multiplier)"><NumberInput value={constants.paintCoverageBrushRoll} onChange={v => setConst('paintCoverageBrushRoll', v)} step={0.1} /></Row>
        <Row label="Cleanup: 1 hr per every N hrs of work"><NumberInput value={constants.cleanupHoursRatio} onChange={v => setConst('cleanupHoursRatio', v)} step={1} /></Row>
        <Row label="Width of Fascia trim (inches)"><NumberInput value={constants.fasciaWidthIn} onChange={v => setConst('fasciaWidthIn', v)} step={1} /></Row>
        <Row label="Width of Eaves (inches)"><NumberInput value={constants.eavesWidthIn} onChange={v => setConst('eavesWidthIn', v)} step={1} /></Row>
        <Row label="Width of Other Trim (inches)"><NumberInput value={constants.otherTrimWidthIn} onChange={v => setConst('otherTrimWidthIn', v)} step={1} /></Row>
        <Row label="LnFt of trim per 1 ft of Railings"><NumberInput value={constants.railingsTrimRatio} onChange={v => setConst('railingsTrimRatio', v)} step={1} /></Row>
        <Row label="Width of Window Trim (inches)"><NumberInput value={constants.windowTrimWidthIn} onChange={v => setConst('windowTrimWidthIn', v)} step={1} /></Row>
        <Row label="Width of Downspout / Post (inches)"><NumberInput value={constants.downspoutWidthIn} onChange={v => setConst('downspoutWidthIn', v)} step={1} /></Row>
        <Row label="Surface area per shutter (sq ft)"><NumberInput value={constants.shutterSqft} onChange={v => setConst('shutterSqft', v)} step={0.5} /></Row>
        <Row label="Stain coverage multiplier"><NumberInput value={constants.stainCoverage} onChange={v => setConst('stainCoverage', v)} step={0.1} /></Row>
        <Row label="Sundries cost per hour ($)"><DollarInput value={constants.sundriesPerHour} onChange={v => setConst('sundriesPerHour', v)} /></Row>
      </Section>

      <SaveButton status={status} onSave={handleSave} />
    </div>
  )
}

// ── Small sub-components ──────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</h3>
      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">{children}</div>
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-4">
      <div>
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function PctInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="relative w-28">
      <input
        type="number"
        step="0.01"
        min="0"
        max="1"
        value={(value * 100).toFixed(2)}
        onChange={e => onChange(parseFloat(e.target.value) / 100 || 0)}
        className="w-full px-3 py-1.5 pr-6 text-sm text-right border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
    </div>
  )
}

function DollarInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="relative w-28">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full pl-6 pr-3 py-1.5 text-sm text-right border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  )
}

function NumberInput({ value, onChange, step = 1 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <input
      type="number"
      step={step}
      min="0"
      value={value}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className="w-28 px-3 py-1.5 text-sm text-right border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  )
}

function SaveButton({ status, onSave }: { status: string; onSave: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onSave}
        disabled={status === 'saving'}
        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        {status === 'saving' ? 'Saving…' : 'Save'}
      </button>
      {status === 'saved' && <span className="text-sm text-green-600 font-medium">Saved!</span>}
      {status === 'error'  && <span className="text-sm text-red-600 font-medium">Error saving. Try again.</span>}
    </div>
  )
}
