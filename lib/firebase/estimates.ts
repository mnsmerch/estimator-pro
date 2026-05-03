import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firestore'
import type { EstimateData } from '@/types/estimate'

const COLLECTION = 'estimates'

export async function createEstimate(data: Omit<EstimateData, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateEstimate(id: string, data: Partial<EstimateData>): Promise<void> {
  const ref = doc(db, COLLECTION, id)
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function getEstimate(id: string): Promise<EstimateData | null> {
  const ref = doc(db, COLLECTION, id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return firestoreToEstimate(snap.id, snap.data())
}

export async function acceptEstimate(
  id: string,
  signatureName: string,
  signatureDataUrl?: string,
): Promise<void> {
  const ref = doc(db, COLLECTION, id)
  await updateDoc(ref, {
    status: 'approved',
    signatureName,
    signatureDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    ...(signatureDataUrl ? { signatureDataUrl } : {}),
    updatedAt: serverTimestamp(),
  })
}

export async function resetSignatureForChangeOrder(id: string): Promise<void> {
  const ref = doc(db, COLLECTION, id)
  await updateDoc(ref, {
    status: 'sent',
    signatureName: '',
    signatureDate: '',
    signatureDataUrl: '',
    updatedAt: serverTimestamp(),
  })
}

export async function listEstimates(userId: string): Promise<EstimateData[]> {
  const q = query(
    collection(db, COLLECTION),
    where('userId', 'in', [userId, 'webhook']),
    orderBy('createdAt', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => firestoreToEstimate(d.id, d.data()))
}

function firestoreToEstimate(id: string, data: Record<string, unknown>): EstimateData {
  const d = data as unknown as EstimateData
  return {
    ...d,
    id,
    createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : undefined,
    updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : undefined,
  }
}
