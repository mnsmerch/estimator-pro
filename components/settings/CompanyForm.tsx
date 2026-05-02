'use client'

import { useEffect, useState, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getSettingsDoc, saveSettingsDoc } from '@/lib/firebase/settings'
import { uploadLogo } from '@/lib/firebase/storage'
import { DEFAULT_COMPANY } from '@/lib/defaultSettings'
import type { CompanySettings } from '@/types/settings'

const FIELDS: { key: keyof CompanySettings; label: string; placeholder: string }[] = [
  { key: 'name',          label: 'Company Name',       placeholder: 'Vanhousing Painters LLC' },
  { key: 'phone',         label: 'Phone Number',       placeholder: '253-656-2328' },
  { key: 'email',         label: 'Email Address',      placeholder: 'sales@example.com' },
  { key: 'website',       label: 'Website (optional)', placeholder: 'www.example.com' },
  { key: 'streetAddress', label: 'Street Address',     placeholder: '1234 Paintbrush Dr.' },
  { key: 'cityStateZip',  label: 'City, State, Zip',   placeholder: 'Denver, CO 80220' },
]

export default function CompanyForm() {
  const { user } = useAuth()
  const [data, setData]     = useState<CompanySettings>(DEFAULT_COMPANY)
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved' | 'error'>('loading')
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getSettingsDoc<CompanySettings>('company', DEFAULT_COMPANY)
      .then(setData)
      .finally(() => setStatus('idle'))
  }, [])

  function handleChange(key: keyof CompanySettings, value: string) {
    setData(prev => ({ ...prev, [key]: value }))
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!user || !e.target.files?.[0]) return
    const file = e.target.files[0]
    setUploading(true)
    setUploadErr(null)
    try {
      const url = await uploadLogo(user.uid, file)
      const updated = { ...data, logoUrl: url }
      setData(updated)
      await saveSettingsDoc('company', updated)
    } catch (err: unknown) {
      setUploadErr(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handleRemoveLogo() {
    const updated = { ...data, logoUrl: '' }
    setData(updated)
    await saveSettingsDoc('company', updated)
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
    <div className="space-y-6">

      {/* Logo */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Company Logo</label>
        {data.logoUrl ? (
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.logoUrl}
              alt="Company logo"
              className="h-20 max-w-[200px] object-contain rounded-lg border border-gray-200 bg-gray-50 p-2"
            />
            <div className="flex flex-col gap-2">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="px-4 py-1.5 text-sm font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                {uploading ? 'Uploading…' : 'Change Logo'}
              </button>
              <button
                onClick={handleRemoveLogo}
                className="px-4 py-1.5 text-sm font-medium text-red-600 border border-red-200 rounded-lg bg-white hover:bg-red-50"
              >
                Remove Logo
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className={`flex flex-col items-center justify-center w-full max-w-xs border-2 border-dashed rounded-xl p-8 transition-colors ${
              uploading
                ? 'opacity-50 pointer-events-none border-gray-200'
                : 'border-gray-300 hover:border-brand-400 hover:bg-brand-50 cursor-pointer'
            }`}
          >
            <svg className="w-8 h-8 text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm font-medium text-gray-500">{uploading ? 'Uploading…' : 'Upload Logo'}</p>
            <p className="text-xs text-gray-400 mt-1">PNG, JPG, or SVG</p>
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleLogoUpload}
        />
        {uploadErr && (
          <p className="mt-2 text-sm text-red-600">Upload failed: {uploadErr}</p>
        )}
      </div>

      {/* Company fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input
              type="text"
              value={(data[key] as string) ?? ''}
              placeholder={placeholder}
              onChange={e => handleChange(key, e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
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
        className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-400 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        {status === 'saving' ? 'Saving…' : 'Save'}
      </button>
      {status === 'saved' && <span className="text-sm text-green-600 font-medium">Saved!</span>}
      {status === 'error'  && <span className="text-sm text-red-600 font-medium">Error saving. Try again.</span>}
    </div>
  )
}
