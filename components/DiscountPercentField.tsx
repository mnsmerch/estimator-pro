'use client'

/**
 * Estimator-editable "Sign Today" discount percentage. Controlled input that
 * works in decimal (0.10 = 10%) but displays/edits as a whole percent. Defaults
 * to 10% for new estimates; the estimator can change it per estimate.
 */
export default function DiscountPercentField({
  value,
  onChange,
}: {
  value: number            // decimal, e.g. 0.10
  onChange: (next: number) => void
}) {
  const pct = Math.round(value * 1000) / 10   // 0.125 -> 12.5

  return (
    <div className="mb-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5">
      <div className="flex items-center gap-1.5 mb-2">
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">&ldquo;Sign Today&rdquo; discount — default 10%</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative w-28">
          <input
            type="number" min="0" max="100" step="0.5"
            value={Number.isFinite(pct) ? pct : ''}
            onChange={e => {
              const p = parseFloat(e.target.value)
              onChange(Number.isFinite(p) ? Math.min(Math.max(p, 0), 100) / 100 : 0)
            }}
            className="w-full border border-gray-300 rounded-lg pl-3 pr-7 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
        </div>
        <span className="text-sm text-gray-500">off the pre-tax subtotal</span>
      </div>
    </div>
  )
}
