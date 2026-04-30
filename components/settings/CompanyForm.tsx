'use client'

import { useEffect, useState } from 'react'
import { getSettingsDoc, saveSettingsDoc } from '@/lib/firebase/settings'
import { DEFAULT_COMPANY } from '@/lib/defaultSettings'
import type { CompanySettings } from '@/types/settings'

const FIELDS: { key: keyof CompanySettings; label: string; placeholder: string }[] = [
  { key: 'name',          label: 'Company Name',              placeholder: 'Vanhousing Painters LLC' },
  { key: 'phone',         label: 'Phone Number',              placeholder: '253-656-2328' },
  { key: 'email',         label: 'Email Address',             placeholder: 'sales@example.com' },
  { key: 'website',       label: 'Website (optional)',        placeholder: 'www.example.com' },
  { key: 'streetAddress', label: 'Street Address',            placeholder: '1234 Paintbrush Dr.' },
  { key: 'cityStateZip',  label: 'City, State, Zip',          placeholder: 'Denver, CO 80220' },
]

export default function CompanyForm() {
  const [data, setData] = useState<CompanySettings>(DEFAULT_COMPANY)
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('loading')

  useEffect(() => {
    getSettingsDoc<CompanySettings>('company', DEFAULT_COMPANY)
      .then(setData)
      .finally(() => setStatus('idle'))
  }, [])

  function handleChange(key: keyof CompanySettings, value: string) {
    setData(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setStatus('saving')
    try {
      await saveSettingsDoc('company', data)
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('error')
    }
  }

  if (status === 'loading') return <div className="py-8 text-center text-gray-400 text-sm">Loading…</div>

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input
              type="text"
              value={data[key]}
              placeholder={placeholder}
              onChange={e => handleChange(key, e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}
      </div>
      <SaveButton status={status} onSave={handleSave} />
    </div>
  )
}

function SaveButton({ status, onSave }: { status: string; onSave: () => void }) {
  return (
    <div className="flex items-center gap-3 pt-2">
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
