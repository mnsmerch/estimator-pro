'use client'

import { useState, useEffect } from 'react'
import { getSettingsDoc, saveSettingsDoc } from '@/lib/firebase/settings'

const DEFAULT_TERMS = `WARRANTY

• Vanhousing Painters LLC gives workmanship warranty for a period of 3 years from date of significant completion of the project. If paint failure appears, we will supply labor and materials to correct the condition without cost. This warranty is in lieu of all other warranties, expressed or implied. Our responsibility is limited to correcting the condition as indicated above.

• This warranty excludes, and in no event will Vanhousing Painters LLC be responsible for consequential or incidental damage caused by accident or abuse, temperature or humidity changes, settlement, or moisture — i.e., cracks caused by moving parts as siding hardieplanks, expansion and/or contraction.

INSURANCE

• Vanhousing Painters LLC carries full liability and auto insurance.

• Certificate of insurance available upon request.

STANDARDS

• All work is to be completed in a workmanlike manner according to standard practices. It is essential that the work area be available to us free from other trades in the immediate working area. Workers will remain on the job until completion of project, weather permitting. All agreements contingent upon strikes, accidents, or delays beyond our control.

• All work will be done as per standards of the PCA (Painting Contractors of America).

• The painting contractor will produce a "properly painted surface." A properly painted surface is uniform in color and sheen, free of foreign material, lumps, skins, sags, holidays, misses, strike-through, or insufficient coverage. It is a surface free of drips, spatters, spills, or overspray caused by the contractor's workforce. Compliance shall be determined when viewed without magnification at a distance of five feet or more under normal lighting conditions.

• All materials will be applied in accordance with the manufacturer's recommendations.

GENERAL CONDITIONS

• If after you agree to this work you desire any changes or additional work, such changes must be agreed upon in writing before work is performed. Workers are instructed not to undertake additional work without authorization.

• Any interruptions that require re-mobilization of workers and/or equipment may result in additional costs.

• It is essential that the work area be available to us free from other trades. Trade interference may result in additional charges.

• Price is valid for 90 days, unless otherwise noted.

• Job starting date will happen sooner if we finish existing projects earlier.

The following are to be provided by the customer:
• Power  • Water  • Parking  • Wash-out area

CHANGE ORDERS

• Any change orders, additions, or descopes must be agreed upon in writing and signed by both parties before proceeding. All change orders are billed extra.

PAYMENT TERMS

• We require a 20% deposit upfront to secure your project start date.

• Change orders will be billed and due at the next billing cycle.

• The project will be billed in full and due upon completion of the scope.`

export default function TermsForm() {
  const [text, setText]     = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  useEffect(() => {
    getSettingsDoc<{ text: string }>('termsAndConditions', { text: DEFAULT_TERMS })
      .then(data => setText(data.text ?? DEFAULT_TERMS))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    await saveSettingsDoc('termsAndConditions', { text })
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function handleReset() {
    if (confirm('Reset to default Terms & Conditions?')) setText(DEFAULT_TERMS)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Terms &amp; Conditions</h2>
          <p className="text-sm text-gray-400 mt-0.5">Shown on the customer proposal page as a collapsible section.</p>
        </div>
        <button
          onClick={handleReset}
          className="text-xs text-gray-400 hover:text-gray-600 underline"
        >
          Reset to default
        </button>
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={28}
        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
      />

      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved</span>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
