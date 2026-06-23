import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
} from 'firebase/auth'
import app from './config'

// On the client, initialize auth with durable local persistence so a signed-in
// session survives new tabs, refreshes, and browser restarts (up to the 2-week
// expiry enforced in AuthContext). initializeAuth sets the persistence
// hierarchy deterministically — getAuth's lazy defaults can otherwise leave a
// fresh tab unauthenticated. Fall back to getAuth on the server (SSR) and when
// the instance is already initialized (e.g. Fast Refresh re-imports).
function createAuth() {
  if (typeof window === 'undefined') return getAuth(app)
  try {
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    })
  } catch {
    return getAuth(app)
  }
}

export const auth = createAuth()
