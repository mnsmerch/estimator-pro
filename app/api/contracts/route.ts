import { NextResponse } from 'next/server'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'

function getAdminStorage() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  if (!bucketName) throw new Error('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET not set')
  if (!getApps().length) {
    initializeApp({ credential: cert(JSON.parse(raw)), storageBucket: bucketName })
  }
  return getStorage().bucket(bucketName)
}

export async function GET() {
  try {
    const bucket = getAdminStorage()
    const [files] = await bucket.getFiles({ prefix: 'signed-contracts/' })

    const contracts = await Promise.all(
      files
        .filter(f => f.name !== 'signed-contracts/') // skip the folder placeholder
        .map(async file => {
          const [url] = await file.getSignedUrl({ action: 'read', expires: '2099-01-01' })
          const meta  = file.metadata
          return {
            name:      file.name.replace('signed-contracts/', ''),
            url,
            size:      Number(meta.size ?? 0),
            createdAt: meta.timeCreated ?? null,
          }
        })
    )

    // Newest first
    contracts.sort((a, b) =>
      new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
    )

    return NextResponse.json({ contracts })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
