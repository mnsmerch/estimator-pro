'use client'

import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { useRouter, usePathname } from 'next/navigation'

const NAV_LINKS = [
  { href: '/dashboard',             label: 'Dashboard'           },
  { href: '/estimates',             label: 'Estimates'           },
  { href: '/generated-estimates',   label: 'Generated Estimates' },
  { href: '/work-orders',           label: 'Work Orders'         },
  { href: '/contracts',             label: 'Contracts'           },
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
      <a href="/dashboard">
        <Image
          src="/logo.png"
          alt="VanHousing Painters LLC"
          width={72}
          height={72}
          className="h-14 w-auto object-contain"
          priority
        />
      </a>

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
