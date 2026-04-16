import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile, UserRole } from '../types'

interface AuthContextValue {
  user: User | null
  profile: Profile | null
  companyId: string | null
  role: UserRole
  loading: boolean
  isAdmin: boolean
  isGestor: boolean
  /** Retorna o JWT de sessão atual (necessário para chamar Edge Functions) */
  getSessionToken: () => Promise<string | null>
  signIn: (loginOrEmail: string, senha: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) setProfile(data as Profile)
  }, [])

  // DEV BYPASS — auto-login quando VITE_DEV_BYPASS=true no .env.local
  // Preencha VITE_DEV_BYPASS_EMAIL e VITE_DEV_BYPASS_PASSWORD no .env.local
  useEffect(() => {
    if (import.meta.env.VITE_DEV_BYPASS !== 'true') return
    const email    = import.meta.env.VITE_DEV_BYPASS_EMAIL as string | undefined
    const password = import.meta.env.VITE_DEV_BYPASS_PASSWORD as string | undefined
    if (!email || !password || password === 'sua_senha_aqui') return
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        supabase.auth.signInWithPassword({ email, password })
          .then(({ data }) => { if (data.user) fetchProfile(data.user.id) })
      }
    })
  }, [fetchProfile])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  const signIn = async (loginOrEmail: string, senha: string): Promise<{ error?: string }> => {
    const email = loginOrEmail.includes('@')
      ? loginOrEmail
      : `${loginOrEmail}@escritorio.zita.ai`

    const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })

    if (error) {
      // Registrar tentativa falha no audit_log (best-effort)
      try {
        await supabase.from('audit_log').insert({
          acao: 'login',
          detalhes: { email_tentativa: email.split('@')[0] },
          sucesso: false,
        })
      } catch { /* ignorar erros de audit */ }
      return { error: 'Login ou senha incorretos' }
    }

    if (data.user) {
      // Atualizar ultimo_acesso_at
      try {
        await supabase
          .from('profiles')
          .upsert({ id: data.user.id, ultimo_acesso_at: new Date().toISOString() })
      } catch { /* ignorar */ }

      // Audit log sucesso
      try {
        await supabase.from('audit_log').insert({
          acao: 'login',
          detalhes: { email: email.split('@')[0] },
          sucesso: true,
        })
      } catch { /* ignorar */ }
    }

    return {}
  }

  const signOut = async () => {
    try {
      await supabase.from('audit_log').insert({
        acao: 'logout',
        detalhes: {},
        sucesso: true,
      })
    } catch { /* ignorar */ }
    await supabase.auth.signOut()
    setProfile(null)
  }

  const companyId = profile?.company_id ?? null
  const role: UserRole = (profile?.role ?? 'viewer') as UserRole
  const isAdmin  = role === 'owner' || role === 'admin'
  const isGestor = role === 'gestor'

  const getSessionToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  return (
    <AuthContext.Provider value={{ user, profile, companyId, role, loading, isAdmin, isGestor, getSessionToken, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return ctx
}
