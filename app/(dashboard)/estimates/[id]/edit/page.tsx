'use client'

import { useState, useEffect, use } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getEstimate } from '@/lib/firebase/estimates'
import EstimateForm from '@/components/estimates/EstimateForm'
import type { EstimateData } from '@/types/estimate'

export default function EditEstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { user } = useAuth()
  const [data, setData] = useState<EstimateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!user) return
    getEstimate(id).then(est => {
      if (!est) setNotFound(true)
      else setData(est)
      setLoading(false)
    })
  }, [id, user])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Estimate not found. <a href="/estimates" className="text-brand-600 underline">Back to list</a></p>
      </div>
    )
  }

  return <EstimateForm estimateId={id} initialData={data} />
}
