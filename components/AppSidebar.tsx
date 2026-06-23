'use client'

import Image from 'next/image'
import { useAuth } from '@/context/AuthContext'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import { useRouter, usePathname } from 'next/navigation'

type NavItem = {
  href:  string
  label: string
  roles: string[]
  icon:  React.ReactNode
}

const NAV_ITEMS: NavItem[] = [
  {
    href: '/estimates', label: 'Estimates', roles: ['admin', 'estimator', 'user'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    ),
  },
  {
    href: '/clients', label: 'Clients', roles: ['admin', 'estimator', 'user'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
  {
    href: '/work-orders', label: 'Work Orders', roles: ['admin', 'estimator', 'pm', 'user'],
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z" />
      </svg>
    ),
  },
]

export default function AppSidebar() {
  const { role } = useAuth()
  const router   = useRouter()
  const pathname = usePathname()
  async function handleSignOut() {
    await signOut(auth)
    router.replace('/login')
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const visibleItems = NAV_ITEMS.filter(i => !role || i.roles.includes(role))
  const homeHref = role === 'pm' ? '/work-orders' : '/estimates'

  const NavLinks = () => (
    <>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {visibleItems.map(item => (
          <a
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive(item.href)
                ? 'bg-brand-50 text-brand-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <span className={isActive(item.href) ? 'text-brand-600' : 'text-gray-400'}>
              {item.icon}
            </span>
            {item.label}
          </a>
        ))}
        {role === 'admin' && (
          <a
            href="/settings"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive('/settings')
                ? 'bg-brand-50 text-brand-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <span className={isActive('/settings') ? 'text-brand-600' : 'text-gray-400'}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </span>
            Settings
          </a>
        )}
      </nav>

      <div className="px-3 pb-4">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
          </svg>
          Log Out
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* ── Desktop sidebar ──────────────────────────────────────────────────── */}
      <aside className="hidden xl:flex xl:flex-col xl:fixed xl:inset-y-0 xl:left-0 xl:w-64 xl:z-40 bg-white border-r border-gray-200">
        <a href={homeHref} className="flex items-center justify-center px-4 py-5 border-b border-gray-100 shrink-0">
          <Image src="/logo.png" alt="VanHousing Painters" width={80} height={80} className="h-20 w-auto object-contain" priority />
        </a>
        <div className="flex flex-col flex-1 overflow-y-auto">
          <NavLinks />
        </div>
      </aside>

      {/* ── Tablet / Mobile: single-row horizontal nav ──────────────────────── */}
      <div className="xl:hidden sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="flex items-center px-3 py-2 gap-2">
          {/* Logo */}
          <a href={homeHref} className="shrink-0 mr-1">
            <Image src="/logo.png" alt="VanHousing Painters" width={32} height={32} className="h-8 w-auto object-contain" priority />
          </a>

          {/* Centered nav tabs */}
          <div className="flex-1 flex items-center justify-center gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {visibleItems.map(item => (
              <a
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors shrink-0 ${
                  isActive(item.href)
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {item.label}
              </a>
            ))}
            {role === 'admin' && (
              <a
                href="/settings"
                className={`px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors shrink-0 ${
                  isActive('/settings')
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                Settings
              </a>
            )}
          </div>

          {/* Log out */}
          <button
            onClick={handleSignOut}
            className="shrink-0 ml-1 text-xs text-gray-400 hover:text-gray-700 font-medium px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            Log Out
          </button>
        </div>
      </div>

    </>
  )
}
