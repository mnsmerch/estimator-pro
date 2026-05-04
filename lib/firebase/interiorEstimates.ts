import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs, deleteDoc,
  query, where, serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from './firestore'
import type { InteriorEstimateDraft } from '@/types/interiorEstimate'

const COLLECTION = 'interiorEstimates'

export interface InteriorEstimateRecord extends InteriorEstimateDraft {
  id:        string
  userId:    string
  status:    'draft' | 'sent' | 'approved'
  createdAt: string
  updatedAt: string
}

export async function createInteriorEstimate(data: InteriorEstimateDraft, userId: string): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    userId,
    status:    'draft',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateInteriorEstimate(id: string, data: Partial<InteriorEstimateDraft>): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
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
    id:         snap.id,
    userId:     d.userId     ?? '',
    clientName: d.clientName ?? '',
    address:    d.address    ?? '',
    options:    d.options    ?? [],
    photoUrls:  d.photoUrls  ?? [],
    status:     d.status     ?? 'draft',
    createdAt:  ts(d.createdAt),
    updatedAt:  ts(d.updatedAt),
  }
}

export async function listInteriorEstimates(userId: string): Promise<InteriorEstimateRecord[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTION), where('userId', '==', userId))
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
      status:     data.status     ?? 'draft',
      createdAt:  ts(data.createdAt),
      updatedAt:  ts(data.updatedAt),
    }
  })
}

export async function deleteInteriorEstimate(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id))
}
