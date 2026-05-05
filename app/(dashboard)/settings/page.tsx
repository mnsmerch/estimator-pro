'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import CompanyForm from '@/components/settings/CompanyForm'
import BusinessRulesForm from '@/components/settings/BusinessRulesForm'
import PaintProductsTable from '@/components/settings/PaintProductsTable'
import RatesAccordion from '@/components/settings/RatesAccordion'
import TermsForm from '@/components/settings/TermsForm'
import InteriorRulesForm from '@/components/settings/InteriorRulesForm'
import InteriorPaintProductsTable from '@/components/settings/InteriorPaintProductsTable'
import InteriorRatesAccordion from '@/components/settings/InteriorRatesAccordion'
import TeamSettings from '@/components/settings/TeamSettings'
import AppHeader from '@/components/AppHeader'

const TABS = [
  { key: 'company',          label: 'Company'            },
  { key: 'business',         label: 'Exterior Rules'     },
  { key: 'paints',           label: 'Exterior Paints'    },
  { key: 'rates',            label: 'Exterior Rates'     },
  { key: 'interior',         label: 'Interior Rules'     },
  { key: 'interior-paints',  label: 'Interior Paints'    },
  { key: 'interior-rates',   label: 'Interior Rates'     },
  { key: 'terms',            label: 'Terms & Conditions' },
  { key: 'team',             label: 'Team'               },
]

export default function SettingsPage() {
  const { role, loading } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('company')

  useEffect(() => {
    if (!loading && role !== 'admin') {
      router.replace('/dashboard')
    }
  }, [loading, role, router])

  if (loading || role !== 'admin') return null

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Admin Settings</h1>
          <p className="text-gray-500 text-sm mt-1">Configure pricing, margins, and production rates used in all estimates.</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 flex-wrap bg-gray-100 p-1 rounded-xl mb-6 w-fit">
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
          {activeTab === 'company'         && <CompanyForm />}
          {activeTab === 'business'        && <BusinessRulesForm />}
          {activeTab === 'paints'          && <PaintProductsTable />}
          {activeTab === 'rates'           && <RatesAccordion />}
          {activeTab === 'interior'        && <InteriorRulesForm />}
          {activeTab === 'interior-paints' && <InteriorPaintProductsTable />}
          {activeTab === 'interior-rates'  && <InteriorRatesAccordion />}
          {activeTab === 'terms'           && <TermsForm />}
          {activeTab === 'team'            && <TeamSettings />}
        </div>
      </div>
    </div>
  )
}
