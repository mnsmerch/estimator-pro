import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from './firestore'

const COLLECTION = 'signed_contracts'

export interface SignedContract {
  id?:               string
  displayName:       string   // unique name shown in UI ("John Smith", "John Smith 1", …)
  clientName:        string   // raw client name
  estimateId:        string
  signedAt?:         Date
  grandTotal:        number
  depositAmount:     number
  balanceDue:        number
  pdfUrl:            string | null
  depositInvoiceUrl: string | null
}

// Find unique display name: "John Smith", then "John Smith 1", "John Smith 2", …
async function buildDisplayName(clientName: string): Promise<string> {
  const q = query(collection(db, COLLECTION), where('clientName', '==', clientName))
  const snap = await getDocs(q)
  const count = snap.size
  if (count === 0) return clientName
  return `${clientName} ${count}`
}

export async function saveSignedContract(data: Omit<SignedContract, 'id' | 'displayName' | 'signedAt'>): Promise<string> {
  const displayName = await buildDisplayName(data.clientName)
  const ref = await addDoc(collection(db, COLLECTION), {
    ...data,
    displayName,
    signedAt: serverTimestamp(),
  })
  return ref.id
}

export async function listSignedContracts(): Promise<SignedContract[]> {
  const q = query(collection(db, COLLECTION), orderBy('signedAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map(d => {
    const data = d.data()
    return {
      ...data,
      id:      d.id,
      signedAt: data.signedAt instanceof Timestamp ? data.signedAt.toDate() : undefined,
    } as SignedContract
  })
}
