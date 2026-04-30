import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firestore'

export async function getSettingsDoc<T>(docId: string, defaults: T): Promise<T> {
  const ref = doc(db, 'settings', docId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return defaults
  return { ...defaults, ...snap.data() } as T
}

export async function saveSettingsDoc<T extends object>(docId: string, data: T): Promise<void> {
  const ref = doc(db, 'settings', docId)
  await setDoc(ref, data)
}
