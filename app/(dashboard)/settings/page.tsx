'use client'

import { useState } from 'react'
import CompanyForm from '@/components/settings/CompanyForm'
import BusinessRulesForm from '@/components/settings/BusinessRulesForm'
import PaintProductsTable from '@/components/settings/PaintProductsTable'
import RatesAccordion from '@/components/settings/RatesAccordion'
import TermsForm from '@/components/settings/TermsForm'
import InteriorRulesForm from '@/components/settings/InteriorRulesForm'
import InteriorPaintProductsTable from '@/components/settings/InteriorPaintProductsTable'
import InteriorRatesAccordion from '@/components/settings/InteriorRatesAccordion'

const TABS = [
  { key: 'company',          label: 'Company'            },
  { key: 'business',         label: 'Exterior Rules'     },
  { key: 'paints',           label: 'Exterior Paints'    },
  { key: 'rates',            label: 'Exterior Rates'     },
  { key: 'interior',         label: 'Interior Rules'     },
  { key: 'interior-paints',  label: 'Interior Paints'    },
  { key: 'interior-rates',   label: 'Interior Rates'     },
  { key: 'terms',            label: 'Terms & Conditions' },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('company')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 2.47a.75.75 0 0 1 0 1.06L4.81 8.25H15a6.75 6.75 0 0 1 0 13.5h-3a.75.75 0 0 1 0-1.5h3a5.25 5.25 0 1 0 0-10.5H4.81l4.72 4.72a.75.75 0 1 1-1.06 1.06l-6-6a.75.75 0 0 1 0-1.06l6-6a.75.75 0 0 1 1.06 0Z" />
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-lg">Estimator Pro</span>
        </div>
        <nav className="flex items-center gap-5">
          <a href="/dashboard" className="text-sm text-gray-600 hover:text-brand-600 font-medium transition-colors">Dashboard</a>
          <a href="/estimates" className="text-sm text-gray-600 hover:text-brand-600 font-medium transition-colors">Estimates</a>
          <a href="/contracts" className="text-sm text-gray-600 hover:text-brand-600 font-medium transition-colors">Contracts</a>
          <a href="/settings" className="text-sm text-brand-600 font-semibold transition-colors">Settings</a>
        </nav>
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
          {activeTab === 'company'   && <CompanyForm />}
          {activeTab === 'business'  && <BusinessRulesForm />}
          {activeTab === 'paints'    && <PaintProductsTable />}
          {activeTab === 'rates'     && <RatesAccordion />}
          {activeTab === 'interior'        && <InteriorRulesForm />}
          {activeTab === 'interior-paints' && <InteriorPaintProductsTable />}
          {activeTab === 'interior-rates'  && <InteriorRatesAccordion />}
          {activeTab === 'terms'           && <TermsForm />}
        </div>
      </div>
    </div>
  )
}
