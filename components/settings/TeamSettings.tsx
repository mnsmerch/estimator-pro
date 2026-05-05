'use client'

import { useState, useEffect, useCallback } from 'react'
import { getIdToken } from 'firebase/auth'
import { auth } from '@/lib/firebase/auth'
import type { UserRole } from '@/lib/firebase/users'

interface TeamMember {
  uid:       string
  name:      string
  email:     string
  role:      UserRole
  createdAt: string
}

export default function TeamSettings() {
  const [members, setMembers]   = useState<TeamMember[]>([])
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState('')

  // New user form
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [role,     setRole]     = useState<UserRole>('user')
  const [saving,   setSaving]   = useState(false)
  const [formErr,  setFormErr]  = useState('')
  const [success,  setSuccess]  = useState('')

  const getToken = async () => {
    const user = auth.currentUser
    if (!user) return ''
    return getIdToken(user)
  }

  const fetchMembers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = await getToken()
      const res   = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load team')
      const data = await res.json()
      setMembers(data.users)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load team')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormErr('')
    setSuccess('')
    if (!name.trim() || !email.trim() || password.length < 6) {
      setFormErr('Name, email, and a password of at least 6 characters are required.')
      return
    }
    setSaving(true)
    try {
      const token = await getToken()
      const res   = await fetch('/api/admin/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ name, email, password, role }),
      })
      const data = await res.json()
      if (!res.ok) { setFormErr(data.error ?? 'Failed to create user'); return }
      setSuccess(`${data.name} was added successfully.`)
      setName(''); setEmail(''); setPassword(''); setRole('user')
      fetchMembers()
    } catch {
      setFormErr('Failed to create user. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    try {
      const token = await getToken()
      const res   = await fetch(`/api/admin/users/${uid}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ role: newRole }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setMembers(prev => prev.map(m => m.uid === uid ? { ...m, role: newRole } : m))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update role')
    }
  }

  const handleDelete = async (uid: string, name: string) => {
    if (!confirm(`Remove ${name} from the team? This cannot be undone.`)) return
    try {
      const token = await getToken()
      const res   = await fetch(`/api/admin/users/${uid}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
      setMembers(prev => prev.filter(m => m.uid !== uid))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to delete user')
    }
  }

  return (
    <div className="space-y-8">

      {/* Existing members */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Team Members</h2>
          <p className="text-xs text-gray-500 mt-0.5">Manage roles and access for each member.</p>
        </div>

        {loading ? (
          <div className="px-6 py-8 text-sm text-gray-400">Loading…</div>
        ) : error ? (
          <div className="px-6 py-6 text-sm text-red-500">{error}</div>
        ) : members.length === 0 ? (
          <div className="px-6 py-8 text-sm text-gray-400">No team members yet.</div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {members.map(m => (
              <li key={m.uid} className="flex items-center gap-4 px-6 py-3">
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-brand-700">
                    {m.name.charAt(0).toUpperCase()}
                  </span>
                </div>

                {/* Name + email */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                  <p className="text-xs text-gray-400 truncate">{m.email}</p>
                </div>

                {/* Role selector */}
                <select
                  value={m.role}
                  onChange={e => handleRoleChange(m.uid, e.target.value as UserRole)}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                </select>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(m.uid, m.name)}
                  className="text-gray-300 hover:text-red-500 transition-colors"
                  title="Remove member"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add new member */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Add Team Member</h2>
          <p className="text-xs text-gray-500 mt-0.5">Create a new login for your team.</p>
        </div>

        <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
              <input
                type="text" placeholder="e.g. John Smith" value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email" placeholder="john@example.com" value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <input
                type="password" placeholder="Min. 6 characters" value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
              <select
                value={role} onChange={e => setRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="user">User — no access to Settings</option>
                <option value="admin">Admin — full access</option>
              </select>
            </div>
          </div>

          {formErr  && <p className="text-xs text-red-500">{formErr}</p>}
          {success  && <p className="text-xs text-green-600">{success}</p>}

          <button
            type="submit" disabled={saving}
            className="px-5 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {saving ? 'Creating…' : 'Create Account'}
          </button>
        </form>
      </div>

    </div>
  )
}
