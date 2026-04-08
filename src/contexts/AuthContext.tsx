import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

const COMPANY_ID = 'a0000000-0000-0000-0000-000000000001'
const EMAIL_DOMAIN = '@escritorio.zita.ai'
const MAX_ATTEMPTS = 5
const LOCKOUT_MS = 30_000
const LOCKOUT_KEY = 'zita_login_lockout'
const ATTEMPTS_KEY = 'zita_login_attempts'

interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: Profile | null
  companyId: string
  loading: boolean
  signIn: (loginOrEmail: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function resolveEmail(input: string): string {
  const trimmed = input.trim()
  if (trimmed.includes('@')) return trimmed
  return `${trimmed}${EMAIL_DOMAIN}`
}

function getLockoutRemaining(): number {
  const lockedAt = localStorage.getItem(LOCKOUT_KEY)
  if (!lockedAt) return 0
  const elapsed = Date.now() - Number(lockedAt)
  if (elapsed >= LOCKOUT_MS) {
    localStorage.removeItem(LOCKOUT_KEY)
    localStorage.removeItem(ATTEMPTS_KEY)
    return 0
  }
  return Math.ceil((LOCKOUT_MS - elapsed) / 1000)
}

function getAttempts(): number {
  return Number(localStorage.getItem(ATTEMPTS_KEY) ?? '0')
}

function incrementAttempts(): number {
  const next = getAttempts() + 1
  localStorage.setItem(ATTEMPTS_KEY, String(next))
  if (next >= MAX_ATTEMPTS) {
    localStorage.setItem(LOCKOUT_KEY, String(Date.now()))
  }
  return next
}

function resetAttempts() {
  localStorage.removeItem(ATTEMPTS_KEY)
  localStorage.removeItem(LOCKOUT_KEY)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .eq('company_id', COMPANY_ID)
      .single()
    if (data) setProfile(data)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      if (data.session?.user) fetchProfile(data.session.user.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [fetchProfile])

  const signIn = useCallback(async (loginOrEmail: string, password: string) => {
    // Check lockout
    const remaining = getLockoutRemaining()
    if (remaining > 0) {
      return { error: `Aguarde ${remaining}s antes de tentar novamente.` }
    }

    const email = resolveEmail(loginOrEmail)
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      incrementAttempts()
      const stillLocked = getLockoutRemaining()
      if (stillLocked > 0) {
        return { error: `Muitas tentativas. Aguarde ${stillLocked}s.` }
      }
      return { error: 'Login ou senha incorretos.' }
    }

    resetAttempts()
    return { error: null }
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, session, profile, companyId: COMPANY_ID, loading, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
