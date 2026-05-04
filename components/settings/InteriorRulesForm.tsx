'use client'

import { useEffect, useState } from 'react'
import { getSettingsDoc, saveSettingsDoc } from '@/lib/firebase/settings'
import { DEFAULT_INTERIOR_RULES, DEFAULT_INTERIOR_CONSTANTS } from '@/lib/defaultSettings'
import type { InteriorBusinessRules, InteriorProductionConstants } from '@/types/interiorSettings'

function calcMarkup(r: InteriorBusinessRules): number {
  const sum = r.netProfitMargin + r.overheadMargin + r.marketingMargin +
    r.salesMargin + r.productionMgmtMargin
  return Math.max(0, 1 - sum)
}

export default function InteriorRulesForm() {
  const [rules, setRules]       = useState<InteriorBusinessRules>(DEFAULT_INTERIOR_RULES)
  const [consts, setConsts]     = useState<InteriorProductionConstants>(DEFAULT_INTERIOR_CONSTANTS)
  const [status, setStatus]     = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('loading')

  useEffect(() => {
    Promise.all([
      getSettingsDoc<InteriorBusinessRules>('interiorBusinessRules', DEFAULT_INTERIOR_RULES),
      getSettingsDoc<InteriorProductionConstants>('interiorProductionConstants', DEFAULT_INTERIOR_CONSTANTS),
    ]).then(([r, c]) => { setRules(r); setConsts(c) })
      .finally(() => setStatus('idle'))
  }, [])

  function setRule(key: keyof InteriorBusinessRules, value: number) {
    setRules(prev => ({ ...prev, [key]: value }))
  }
  function setConst(key: keyof InteriorProductionConstants, value: number) {
    setConsts(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setStatus('saving')
    try {
      await Promise.all([
        saveSettingsDoc('interiorBusinessRules', rules),
        saveSettingsDoc('interiorProductionConstants', consts),
      ])
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('error')
    }
  }

  const markup         = calcMarkup(rules)
  const avgRecycleFee  = (rules.recycleFeeGallon + rules.recycleFeeFiveGal) / 2

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
        <Row label="Overhead % Cost"><PctInput value={rules.overheadMargin} onChange={v => setRule('overheadMargin', v)} /></Row>
        <Row label="Marketing % Cost"><PctInput value={rules.marketingMargin} onChange={v => setRule('marketingMargin', v)} /></Row>
        <Row label="Sales % Cost"><PctInput value={rules.salesMargin} onChange={v => setRule('salesMargin', v)} /></Row>
        <Row label="Production Management % Cost"><PctInput value={rules.productionMgmtMargin} onChange={v => setRule('productionMgmtMargin', v)} /></Row>
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
      </Section>

      {/* Materials */}
      <Section title="Materials">
        <Row label="Material Tax Rate"><PctInput value={rules.materialTaxRate} onChange={v => setRule('materialTaxRate', v)} /></Row>
        <Row label="Recycle Fee — 1-Gal"><DollarInput value={rules.recycleFeeGallon} onChange={v => setRule('recycleFeeGallon', v)} /></Row>
        <Row label="Recycle Fee — 5-Gal"><DollarInput value={rules.recycleFeeFiveGal} onChange={v => setRule('recycleFeeFiveGal', v)} /></Row>
        <Row label="Avg Recycle Fee (1–5 Gal)" hint="Auto-calculated: average of 1-gal and 5-gal fees">
          <div className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-semibold text-gray-800 w-28 text-right">
            ${avgRecycleFee.toFixed(2)}
          </div>
        </Row>
      </Section>

      {/* Production Constants */}
      <Section title="Production Constants">
        <Row label="Work hours per 1 cleanup hour" hint="e.g. 16 = 1 hr cleanup per 16 hrs of work">
          <NumberInput value={consts.cleanupHoursRatio} onChange={v => setConst('cleanupHoursRatio', v)} step={1} />
        </Row>
        <Row label="Sundries cost ($ per hour of prep)">
          <DollarInput value={consts.sundriesPerHour} onChange={v => setConst('sundriesPerHour', v)} />
        </Row>
      </Section>

      {/* Trim Dimensions */}
      <Section title="Trim Dimensions">
        <Row label="Width of Baseboard Trim (inches)">
          <NumberInput value={consts.baseboardWidthIn} onChange={v => setConst('baseboardWidthIn', v)} step={0.5} />
        </Row>
        <Row label="Width of Door Frame Trim (inches)">
          <NumberInput value={consts.doorFrameWidthIn} onChange={v => setConst('doorFrameWidthIn', v)} step={0.5} />
        </Row>
        <Row label="Width of Window Trim (inches)">
          <NumberInput value={consts.windowTrimWidthIn} onChange={v => setConst('windowTrimWidthIn', v)} step={0.5} />
        </Row>
        <Row label="Width of Misc LnFt Trim (inches)">
          <NumberInput value={consts.miscTrimWidthIn} onChange={v => setConst('miscTrimWidthIn', v)} step={0.5} />
        </Row>
      </Section>

      <SaveButton status={status} onSave={handleSave} />
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
        type="number" step="0.01" min="0" max="100"
        value={(value * 100).toFixed(2)}
        onChange={e => onChange(parseFloat(e.target.value) / 100 || 0)}
        className="w-full px-3 py-1.5 pr-6 text-sm text-right border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
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
        type="number" step="0.01" min="0"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full pl-6 pr-3 py-1.5 text-sm text-right border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  )
}

function NumberInput({ value, onChange, step = 1 }: { value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <input
      type="number" step={step} min="0"
      value={value}
      onChange={e => onChange(parseFloat(e.target.value) || 0)}
      className="w-28 px-3 py-1.5 text-sm text-right border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
    />
  )
}

function SaveButton({ status, onSave }: { status: string; onSave: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onSave}
        disabled={status === 'saving'}
        className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        {status === 'saving' ? 'Saving…' : 'Save'}
      </button>
      {status === 'saved' && <span className="text-sm text-green-600 font-medium">Saved!</span>}
      {status === 'error'  && <span className="text-sm text-red-600 font-medium">Error saving. Try again.</span>}
    </div>
  )
}
