import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore'
import { db } from './firestore'

export type UserRole = 'admin' | 'user'

export interface UserRecord {
  uid:       string
  name:      string
  email:     string
  role:      UserRole
  createdAt: string
}

const COLLECTION = 'users'

export async function getUserRole(uid: string): Promise<UserRole | null> {
  const snap = await getDoc(doc(db, COLLECTION, uid))
  if (!snap.exists()) return null
  return (snap.data().role as UserRole) ?? null
}

export async function listUsers(): Promise<UserRecord[]> {
  const snap = await getDocs(collection(db, COLLECTION))
  return snap.docs.map(d => {
    const data = d.data()
    return {
      uid:       d.id,
      name:      data.name      ?? '',
      email:     data.email     ?? '',
      role:      data.role      ?? 'user',
      createdAt: data.createdAt?.toDate?.()?.toISOString() ?? '',
    }
  })
}

export async function createUserRecord(
  uid: string, name: string, email: string, role: UserRole
): Promise<void> {
  await setDoc(doc(db, COLLECTION, uid), {
    name, email, role,
    createdAt: serverTimestamp(),
  })
}
