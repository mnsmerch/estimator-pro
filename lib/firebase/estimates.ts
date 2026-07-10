import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  runTransaction,
} from 'firebase/firestore'
import { db } from './firestore'
import type { EstimateData } from '@/types/estimate'

const COLLECTION = 'estimates'
const COUNTER_DOC = 'estimateCounter'
const COUNTER_START = 5585

async function getNextEstimateNumber(): Promise<number> {
  const counterRef = doc(db, 'settings', COUNTER_DOC)
  return runTransaction(db, async tx => {
    const snap = await tx.get(counterRef)
    const next = snap.exists() ? (snap.data().value as number) + 1 : COUNTER_START
    tx.set(counterRef, { value: next })
    return next
  })
}

export async function createEstimate(data: Omit<EstimateData, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const estimateNumber = await getNextEstimateNumber()
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    estimateNumber,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateEstimate(id: string, data: Partial<EstimateData>): Promise<void> {
  const ref = doc(db, COLLECTION, id)
  let payload = data
  // Guard: a content save must never silently downgrade a signed (approved)
  // estimate — that would flip a signed job back to "Pending". Editors load a
  // snapshot of the estimate when opened; if the customer signs in the meantime,
  // saving would otherwise write the stale pre-signing status back over 'approved'.
  // Only an explicit change-order reset (resetSignatureForChangeOrder, which
  // writes directly) may move an approved estimate off 'approved'.
  if (data.status && data.status !== 'approved') {
    const snap = await getDoc(ref)
    if (snap.exists() && snap.data().status === 'approved') {
      const { status: _drop, ...rest } = data
      payload = rest
    }
  }
  await updateDoc(ref, {
    ...payload,
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

export async function deleteEstimate(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id))
}

export async function duplicateEstimate(id: string, newClientName: string, userId: string): Promise<string> {
  const original = await getEstimate(id)
  if (!original) throw new Error('Estimate not found')
  const { id: _id, createdAt: _ca, updatedAt: _ua, signatureName: _sn, signatureDate: _sd, signatureDataUrl: _sdu, userId: _uid, ...rest } = original
  // Remove undefined values — Firestore rejects them
  const clean = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined))
  const ref = await addDoc(collection(db, COLLECTION), {
    ...clean,
    userId,
    clientName: newClientName,
    status: 'draft',
    salesTaxRate: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
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
