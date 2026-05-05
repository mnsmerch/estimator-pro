'use client'

import { useAuth } from '@/context/AuthContext'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { useRouter, usePathname } from 'next/navigation'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/estimates', label: 'Estimates' },
  { href: '/contracts', label: 'Contracts' },
]

export default function AppHeader() {
  const { role } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()

  async function handleSignOut() {
    await signOut(auth)
    router.replace('/login')
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 2.47a.75.75 0 0 1 0 1.06L4.81 8.25H15a6.75 6.75 0 0 1 0 13.5h-3a.75.75 0 0 1 0-1.5h3a5.25 5.25 0 1 0 0-10.5H4.81l4.72 4.72a.75.75 0 1 1-1.06 1.06l-6-6a.75.75 0 0 1 0-1.06l6-6a.75.75 0 0 1 1.06 0Z" />
          </svg>
        </div>
        <span className="font-bold text-gray-900 text-lg">Estimator Pro</span>
      </div>

      <div className="flex items-center gap-4 sm:gap-5">
        <nav className="hidden sm:flex items-center gap-4 sm:gap-5">
          {NAV_LINKS.map(({ href, label }) => (
            <a
              key={href} href={href}
              className={`text-sm font-medium transition-colors ${
                isActive(href)
                  ? 'text-brand-600 font-semibold'
                  : 'text-gray-600 hover:text-brand-600'
              }`}
            >
              {label}
            </a>
          ))}
          {role === 'admin' && (
            <a
              href="/settings"
              className={`text-sm font-medium transition-colors ${
                isActive('/settings')
                  ? 'text-brand-600 font-semibold'
                  : 'text-gray-600 hover:text-brand-600'
              }`}
            >
              Settings
            </a>
          )}
        </nav>

        <button
          onClick={handleSignOut}
          className="text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors"
        >
          Sign out
        </button>
      </div>
    </header>
  )
}
