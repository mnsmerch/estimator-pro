import {
  collection, doc, addDoc, updateDoc, getDoc, getDocFromServer, getDocs, deleteDoc,
  query, where, serverTimestamp, Timestamp, runTransaction,
} from 'firebase/firestore'
import { db } from './firestore'
import type { CabinetEstimateDraft } from '@/types/cabinetEstimate'
import { CABINET_SCOPE_DEFAULTS } from '@/types/cabinetEstimate'

const COLLECTION = 'cabinetEstimates'

export interface CabinetEstimateRecord extends CabinetEstimateDraft {
  id:                string
  userId:            string
  status:            'draft' | 'pending' | 'sent' | 'approved'
  createdAt:         string
  updatedAt:         string
  signatureName?:    string
  signatureDataUrl?: string
  signatureDate?:    string
  clientContactId?:  string
  clientFolderId?:   string
  estimateNumber?:   number
  salesTaxRate?:     number | null
  invoiceCreated?:   boolean
  depositInvoiceUrl?:string
}

function mapDoc(snap: ReturnType<typeof getDoc> extends Promise<infer T> ? T : never): CabinetEstimateRecord {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (snap as any).data()
  const ts = (field: unknown) =>
    field instanceof Timestamp ? field.toDate().toISOString() : ''
  return {
    id:              (snap as any).id,
    userId:          d.userId          ?? '',
    clientName:      d.clientName      ?? '',
    address:         d.address         ?? '',
    clientPhone:     d.clientPhone     ?? '',
    clientEmail:     d.clientEmail     ?? '',
    salesTaxRate:    d.salesTaxRate     ?? null,
    doors:           d.doors           ?? '',
    drawers:         d.drawers         ?? '',
    panelsDoorSize:  d.panelsDoorSize  ?? '',
    largePanels:     d.largePanels     ?? [],
    twoTone:         d.twoTone         ?? false,
    patchHoles:      d.patchHoles      ?? false,
    aquaCoat:        d.aquaCoat        ?? false,
    scope:           d.scope           ?? { ...CABINET_SCOPE_DEFAULTS },
    photoUrls:       d.photoUrls       ?? [],
    notes:           d.notes           ?? '',
    customItems:     d.customItems      ?? [],
    status:          d.status          ?? 'draft',
    createdAt:       ts(d.createdAt),
    updatedAt:       ts(d.updatedAt),
    signatureName:   d.signatureName   ?? '',
    signatureDataUrl: d.signatureDataUrl ?? '',
    signatureDate:   d.signatureDate   ?? '',
  }
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

export async function createCabinetEstimate(data: CabinetEstimateDraft, userId: string): Promise<string> {
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

export async function updateCabinetEstimate(id: string, data: Partial<CabinetEstimateDraft> & { status?: string }): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function getCabinetEstimate(id: string): Promise<CabinetEstimateRecord | null> {
  const snap = await getDoc(doc(db, COLLECTION, id))
  if (!snap.exists()) return null
  return mapDoc(snap as Parameters<typeof mapDoc>[0])
}

export async function getCabinetEstimateFromServer(id: string): Promise<CabinetEstimateRecord | null> {
  const snap = await getDocFromServer(doc(db, COLLECTION, id))
  if (!snap.exists()) return null
  return mapDoc(snap as Parameters<typeof mapDoc>[0])
}

export async function acceptCabinetEstimate(id: string, name: string, dataUrl: string): Promise<void> {
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

export async function resetSignatureForCabinetChangeOrder(id: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, id), {
    status:           'sent',
    signatureName:    '',
    signatureDataUrl: '',
    signatureDate:    '',
    updatedAt:        serverTimestamp(),
  })
}

export async function listCabinetEstimates(userId: string): Promise<CabinetEstimateRecord[]> {
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
      doors:      data.doors      ?? '',
      drawers:    data.drawers    ?? '',
      panelsDoorSize: data.panelsDoorSize ?? '',
      largePanels: data.largePanels ?? [],
      twoTone:    data.twoTone    ?? false,
      patchHoles: data.patchHoles ?? false,
      aquaCoat:   data.aquaCoat   ?? false,
      scope:      data.scope      ?? { ...CABINET_SCOPE_DEFAULTS },
      photoUrls:  data.photoUrls  ?? [],
      status:     data.status     ?? 'draft',
      createdAt:  ts(data.createdAt),
      updatedAt:  ts(data.updatedAt),
    } as CabinetEstimateRecord
  })
}

export async function deleteCabinetEstimate(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, id))
}

export async function duplicateCabinetEstimate(id: string, newClientName: string, userId: string): Promise<string> {
  const original = await getCabinetEstimate(id)
  if (!original) throw new Error('Estimate not found')
  const ref = await addDoc(collection(db, COLLECTION), {
    clientName:       newClientName,
    address:          original.address,
    clientPhone:      original.clientPhone     ?? '',
    clientEmail:      original.clientEmail     ?? '',
    salesTaxRate:     null,
    doors:            original.doors,
    drawers:          original.drawers,
    panelsDoorSize:   original.panelsDoorSize,
    largePanels:      original.largePanels,
    twoTone:          original.twoTone,
    patchHoles:       original.patchHoles,
    aquaCoat:         original.aquaCoat,
    scope:            original.scope,
    photoUrls:        original.photoUrls,
    notes:            original.notes           ?? '',
    customItems:      original.customItems     ?? [],
    userId,
    status:           'draft',
    signatureName:    '',
    signatureDataUrl: '',
    signatureDate:    '',
    createdAt:        serverTimestamp(),
    updatedAt:        serverTimestamp(),
  })
  return ref.id
}
