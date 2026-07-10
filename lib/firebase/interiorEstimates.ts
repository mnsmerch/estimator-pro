import {
  collection, doc, addDoc, updateDoc, getDoc, getDocFromServer, getDocs, deleteDoc,
  query, where, serverTimestamp, Timestamp, runTransaction,
} from 'firebase/firestore'
import { db } from './firestore'
import type { InteriorEstimateDraft } from '@/types/interiorEstimate'
import { INTERIOR_SCOPE_DEFAULTS } from '@/types/interiorEstimate'

const COLLECTION = 'interiorEstimates'

export interface InteriorEstimateRecord extends InteriorEstimateDraft {
  id:                string
  userId:            string
  status:            'draft' | 'pending' | 'sent' | 'approved'
  createdAt:         string
  updatedAt:         string
  signatureName?:    string
  signatureDataUrl?: string
  signatureDate?:    string
  clientFolderId?:   string
  clientContactId?:  string
}

async function getNextEstimateNumber(): Promise<number> {
  const counterRef = doc(db, 'settings', 'estimateCounter')
  return runTransaction(db, async tx => {
    const snap = await tx.get(counterRef)
    const next = snap.exists() ? (snap.data().value as number) + 1 : 5585
    tx.set(counterRef, { value: next })
    return next
  })
}

export async function createInteriorEstimate(data: InteriorEstimateDraft, userId: string): Promise<string> {
  const estimateNumber = await getNextEstimateNumber()
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    userId,
    estimateNumber,
    status:    'draft',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateInteriorEstimate(id: string, data: Partial<InteriorEstimateDraft> & { status?: string }): Promise<void> {
  const ref = doc(db, COLLECTION, id)
  let payload = data
  // Guard: a content save must never silently downgrade a signed (approved)
  // estimate back to Pending. Only an explicit reset writes 'approved' away.
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

export async function getInteriorEstimate(id: string): Promise<InteriorEstimateRecord | null> {
  const snap = await getDoc(doc(db, COLLECTION, id))
  if (!snap.exists()) return null
  const d = snap.data()
  const ts = (field: unknown) =>
    field instanceof Timestamp ? field.toDate().toISOString() : ''
  return {
    id:               snap.id,
    userId:           d.userId           ?? '',
    clientName:       d.clientName       ?? '',
    address:          d.address          ?? '',
    clientPhone:      d.clientPhone      ?? '',
    clientEmail:      d.clientEmail      ?? '',
    salesTaxRate:     d.salesTaxRate     ?? null,
    options:          d.options          ?? [],
    photoUrls:        d.photoUrls        ?? [],
    scope:            d.scope            ?? { ...INTERIOR_SCOPE_DEFAULTS },
    subtotalOverride: d.subtotalOverride ?? null,
    status:           d.status           ?? 'draft',
    createdAt:        ts(d.createdAt),
    updatedAt:        ts(d.updatedAt),
    signatureName:    d.signatureName    ?? '',
    signatureDataUrl: d.signatureDataUrl ?? '',
    signatureDate:    d.signatureDate    ?? '',
    clientFolderId:   d.clientFolderId   ?? '',
    clientContactId:  d.clientContactId  ?? '',
  }
}

export async function getInteriorEstimateFromServer(id: string): Promise<InteriorEstimateRecord | null> {
  const snap = await getDocFromServer(doc(db, COLLECTION, id))
  if (!snap.exists()) return null
  const d = snap.data()
  const ts = (field: unknown) =>
    field instanceof Timestamp ? field.toDate().toISOString() : ''
  return {
    id:               snap.id,
    userId:           d.userId           ?? '',
    clientName:       d.clientName       ?? '',
    address:          d.address          ?? '',
    clientPhone:      d.clientPhone      ?? '',
    clientEmail:      d.clientEmail      ?? '',
    salesTaxRate:     d.salesTaxRate     ?? null,
    options:          d.options          ?? [],
    photoUrls:        d.photoUrls        ?? [],
    scope:            d.scope            ?? { ...INTERIOR_SCOPE_DEFAULTS },
    subtotalOverride: d.subtotalOverride ?? null,
    status:           d.status           ?? 'draft',
    createdAt:        ts(d.createdAt),
    updatedAt:        ts(d.updatedAt),
    signatureName:    d.signatureName    ?? '',
    signatureDataUrl: d.signatureDataUrl ?? '',
    signatureDate:    d.signatureDate    ?? '',
    clientFolderId:   d.clientFolderId   ?? '',
    clientContactId:  d.clientContactId  ?? '',
  }
}

export async function acceptInteriorEstimate(id: string, name: string, dataUrl: string): Promise<void> {
  const now = new Date()
  const signatureDate = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  await updateDoc(doc(db, COLLECTION, id), {
    status:           'approved',
    signatureName:    name,
    signatureDataUrl: dataUrl,
    signatureDate,
    updatedAt:        serverTimestamp(),
  })
}

export async function resetSignatureForInteriorChangeOrder(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status:           'sent',
    signatureName:    '',
    signatureDataUrl: '',
    signatureDate:    '',
    updatedAt:        serverTimestamp(),
  })
}

export async function listInteriorEstimates(userId: string): Promise<InteriorEstimateRecord[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTION), where('userId', 'in', [userId, 'webhook']))
  )
  return snap.docs.map(d => {
    const data = d.data()
    const ts = (field: unknown) =>
      field instanceof Timestamp ? field.toDate().toISOString() : ''
    return {
      id:         d.id,
      userId:     data.userId     ?? '',
      clientName: data.clientName ?? '',
      address:    data.address    ?? '',
      options:    data.options    ?? [],
      photoUrls:  data.photoUrls  ?? [],
      scope:      data.scope      ?? { ...INTERIOR_SCOPE_DEFAULTS },
      status:     data.status     ?? 'draft',
      createdAt:  ts(data.createdAt),
      updatedAt:  ts(data.updatedAt),
    }
  })
}

export async function deleteInteriorEstimate(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id))
}

export async function duplicateInteriorEstimate(id: string, newClientName: string, userId: string): Promise<string> {
  const original = await getInteriorEstimate(id)
  if (!original) throw new Error('Estimate not found')
  const ref = await addDoc(collection(db, COLLECTION), {
    clientName:       newClientName,
    address:          original.address,
    clientPhone:      original.clientPhone      ?? '',
    clientEmail:      original.clientEmail      ?? '',
    salesTaxRate:     null,
    options:          original.options,
    photoUrls:        original.photoUrls,
    scope:            original.scope,
    userId,
    status:           'draft',
    signatureName:    '',
    signatureDataUrl: '',
    signatureDate:    '',
    clientFolderId:   original.clientFolderId   ?? '',
    clientContactId:  original.clientContactId  ?? '',
    createdAt:        serverTimestamp(),
    updatedAt:        serverTimestamp(),
  })
  return ref.id
}
