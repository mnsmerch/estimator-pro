'use client'

import { useState } from 'react'
import CompanyForm from '@/components/settings/CompanyForm'
import BusinessRulesForm from '@/components/settings/BusinessRulesForm'
import PaintProductsTable from '@/components/settings/PaintProductsTable'
import RatesAccordion from '@/components/settings/RatesAccordion'

const TABS = [
  { key: 'company',      label: 'Company'         },
  { key: 'business',     label: 'Business Rules'  },
  { key: 'paints',       label: 'Paint Products'  },
  { key: 'rates',        label: 'Production Rates'},
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('company')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 2.47a.75.75 0 0 1 0 1.06L4.81 8.25H15a6.75 6.75 0 0 1 0 13.5h-3a.75.75 0 0 1 0-1.5h3a5.25 5.25 0 1 0 0-10.5H4.81l4.72 4.72a.75.75 0 1 1-1.06 1.06l-6-6a.75.75 0 0 1 0-1.06l6-6a.75.75 0 0 1 1.06 0Z" />
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-lg">Estimator Pro</span>
        </div>
        <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-800">← Dashboard</a>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Admin Settings</h1>
          <p className="text-gray-500 text-sm mt-1">Configure pricing, margins, and production rates used in all estimates.</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {activeTab === 'company'  && <CompanyForm />}
          {activeTab === 'business' && <BusinessRulesForm />}
          {activeTab === 'paints'   && <PaintProductsTable />}
          {activeTab === 'rates'    && <RatesAccordion />}
        </div>
      </div>
    </div>
  )
}
