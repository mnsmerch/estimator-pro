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
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firestore'
import type { WorkOrderData } from '@/types/workOrder'

const COLLECTION = 'workOrders'

function toIso(val: unknown): string {
  if (!val) return new Date().toISOString()
  if (val instanceof Timestamp) return val.toDate().toISOString()
  if (val instanceof Date) return val.toISOString()
  return String(val)
}

export async function createWorkOrder(
  data: Omit<WorkOrderData, 'createdAt' | 'updatedAt'>,
  userId: string,
): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function updateWorkOrder(
  id: string,
  data: Partial<WorkOrderData>,
): Promise<void> {
  const ref = doc(db, COLLECTION, id)
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function getWorkOrder(
  id: string,
): Promise<(WorkOrderData & { id: string }) | null> {
  const ref  = doc(db, COLLECTION, id)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const d = snap.data()
  return {
    ...(d as WorkOrderData),
    id:        snap.id,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  }
}

export async function listWorkOrders(
  userId: string,
): Promise<(WorkOrderData & { id: string })[]> {
  const q = query(
    collection(db, COLLECTION),
    where('userId', 'in', [userId, 'webhook']),
  )
  const snap = await getDocs(q)
  const items = snap.docs.map(d => {
    const data = d.data()
    return {
      ...(data as WorkOrderData),
      id:        d.id,
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt),
    }
  })
  return items.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
}

export async function deleteWorkOrder(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id))
}
