import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const LOCKOUT_KEY   = 'zita_login_lockout'
const SAVED_KEY     = 'zita_saved_login'
const LOCKOUT_MS    = 30_000

function getLockoutRemaining(): number {
  const lockedAt = localStorage.getItem(LOCKOUT_KEY)
  if (!lockedAt) return 0
  const elapsed = Date.now() - Number(lockedAt)
  if (elapsed >= LOCKOUT_MS) return 0
  return Math.ceil((LOCKOUT_MS - elapsed) / 1000)
}

function loadSaved(): { login: string; password: string } | null {
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// Left panel: animated SVG organogram decoration
function OrgSVG() {
  return (
    <svg viewBox="0 0 300 300" className="w-full max-w-xs opacity-20" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Lines */}
      <line x1="150" y1="60" x2="80" y2="140" stroke="#f5c842" strokeWidth="1.5" />
      <line x1="150" y1="60" x2="220" y2="140" stroke="#f5c842" strokeWidth="1.5" />
      <line x1="80" y1="160" x2="50" y2="230" stroke="#4a9eff" strokeWidth="1" />
      <line x1="80" y1="160" x2="110" y2="230" stroke="#4a9eff" strokeWidth="1" />
      <line x1="220" y1="160" x2="190" y2="230" stroke="#4a9eff" strokeWidth="1" />
      <line x1="220" y1="160" x2="250" y2="230" stroke="#4a9eff" strokeWidth="1" />
      {/* Zeus node */}
      <circle cx="150" cy="45" r="22" fill="#f5c842" fillOpacity="0.15" stroke="#f5c842" strokeWidth="2" />
      <text x="150" y="50" textAnchor="middle" fill="#f5c842" fontSize="18">⚡</text>
      {/* Child nodes */}
      <circle cx="80" cy="155" r="16" fill="#4a9eff" fillOpacity="0.1" stroke="#4a9eff" strokeWidth="1.5" />
      <text x="80" y="160" textAnchor="middle" fill="#4a9eff" fontSize="13">🔍</text>
      <circle cx="220" cy="155" r="16" fill="#4a9eff" fillOpacity="0.1" stroke="#4a9eff" strokeWidth="1.5" />
      <text x="220" y="160" textAnchor="middle" fill="#4a9eff" fontSize="13">🎯</text>
      {/* Grandchild nodes */}
      <circle cx="50" cy="240" r="12" fill="#4a9eff" fillOpacity="0.08" stroke="#4a9eff" strokeWidth="1" />
      <text x="50" y="245" textAnchor="middle" fill="#4a9eff" fontSize="10">💰</text>
      <circle cx="110" cy="240" r="12" fill="#4a9eff" fillOpacity="0.08" stroke="#4a9eff" strokeWidth="1" />
      <text x="110" y="245" textAnchor="middle" fill="#4a9eff" fontSize="10">📱</text>
      <circle cx="190" cy="240" r="12" fill="#4a9eff" fillOpacity="0.08" stroke="#4a9eff" strokeWidth="1" />
      <text x="190" y="245" textAnchor="middle" fill="#4a9eff" fontSize="10">🤖</text>
      <circle cx="250" cy="240" r="12" fill="#4a9eff" fillOpacity="0.08" stroke="#4a9eff" strokeWidth="1" />
      <text x="250" y="245" textAnchor="middle" fill="#4a9eff" fontSize="10">⚡</text>
    </svg>
  )
}

export default function Login() {
  const { signIn, user } = useAuth()
  const navigate = useNavigate()

  const saved = loadSaved()

  const [login, setLogin]           = useState(saved?.login ?? '')
  const [password, setPassword]     = useState(saved?.password ?? '')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [lockoutSeconds, setLockoutSeconds] = useState(getLockoutRemaining)
  const [showPassword, setShowPassword]     = useState(false)
  const [rememberLogin, setRememberLogin]   = useState(!!saved)

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  // DEV BYPASS — preenche e envia automaticamente se .env.local configurado
  useEffect(() => {
    if (import.meta.env.VITE_DEV_BYPASS !== 'true') return
    const devEmail = import.meta.env.VITE_DEV_BYPASS_EMAIL as string | undefined
    const devPass  = import.meta.env.VITE_DEV_BYPASS_PASSWORD as string | undefined
    if (!devEmail || !devPass || devPass === 'sua_senha_aqui') return
    setLogin(devEmail)
    setPassword(devPass)
    const timer = setTimeout(async () => {
      setLoading(true)
      const { error: err } = await signIn(devEmail, devPass)
      if (!err) navigate('/dashboard', { replace: true })
      else setError(err)
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Countdown timer for lockout
  useEffect(() => {
    if (lockoutSeconds <= 0) return
    const timer = setInterval(() => {
      const remaining = getLockoutRemaining()
      setLockoutSeconds(remaining)
      if (remaining <= 0) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [lockoutSeconds])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (lockoutSeconds > 0) return
    setError('')
    setLoading(true)

    const { error: signInError } = await signIn(login, password)

    if (signInError) {
      localStorage.setItem(LOCKOUT_KEY, Date.now().toString())
      setError(signInError)
      setLockoutSeconds(getLockoutRemaining())
    } else {
      if (rememberLogin) {
        localStorage.setItem(SAVED_KEY, JSON.stringify({ login, password }))
      } else {
        localStorage.removeItem(SAVED_KEY)
      }
      navigate('/dashboard', { replace: true })
    }

    setLoading(false)
  }

  async function handleQuickLogin() {
    if (!saved || lockoutSeconds > 0) return
    setLogin(saved.login)
    setPassword(saved.password)
    setError('')
    setLoading(true)
    const { error: err } = await signIn(saved.login, saved.password)
    if (err) setError(err)
    else navigate('/dashboard', { replace: true })
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col items-center justify-center w-1/2 bg-dark-800 border-r border-dark-500 p-12">
        <OrgSVG />
        <div className="text-center mt-6">
          <h2 className="text-2xl font-bold text-white mb-2">Escritório de IAs</h2>
          <p className="text-gray-400 text-sm max-w-xs">
            Gerencie, monitore e converse com sua equipe de agentes de inteligência artificial em tempo real.
          </p>
        </div>
        <div className="mt-8 flex gap-6 text-center">
          <div>
            <p className="text-2xl font-bold text-zeus">8+</p>
            <p className="text-xs text-gray-500 mt-1">Agentes IA</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-accent">24/7</p>
            <p className="text-xs text-gray-500 mt-1">Monitoramento</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-emerald-400">100%</p>
            <p className="text-xs text-gray-500 mt-1">Seguro</p>
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 bg-dark-900">
        <div className="w-full max-w-sm">
          <div className="text-center mb-8">
            <span className="text-5xl">🏢</span>
            <h1 className="text-2xl font-bold text-white mt-3">ZITA</h1>
            <p className="text-gray-400 text-sm mt-1">Acesse o Escritório de IA</p>
          </div>

          {/* Quick login button — shown only when credentials are saved */}
          {saved && !loading && (
            <button
              onClick={handleQuickLogin}
              disabled={lockoutSeconds > 0}
              className="w-full mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-brand-600/10 border border-brand-500/30 hover:bg-brand-600/20 hover:border-brand-500/60 transition-all disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-full bg-brand-600/30 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">⚡</span>
              </div>
              <div className="text-left flex-1 min-w-0">
                <p className="text-sm font-semibold text-white leading-tight">Acesso rápido</p>
                <p className="text-xs text-gray-400 truncate">{saved.login}</p>
              </div>
              <span className="text-xs text-brand-400 flex-shrink-0">Entrar →</span>
            </button>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Login
              </label>
              <input
                type="text"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                className="input-field"
                placeholder="00001 ou email completo"
                autoComplete="username"
                disabled={loading || lockoutSeconds > 0}
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Digite seu código (ex: 00001) ou e-mail completo
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={loading || lockoutSeconds > 0}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                  tabIndex={-1}
                >
                  {showPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            {/* Remember login checkbox */}
            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                checked={rememberLogin}
                onChange={(e) => {
                  setRememberLogin(e.target.checked)
                  if (!e.target.checked) localStorage.removeItem(SAVED_KEY)
                }}
                className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-brand-500 focus:ring-brand-500 cursor-pointer"
              />
              <label htmlFor="remember" className="text-sm text-gray-400 cursor-pointer select-none">
                Lembrar login (acesso rápido)
              </label>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <span>⚠</span>
                {error}
              </div>
            )}

            {lockoutSeconds > 0 && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm">
                <span>🔒</span>
                Aguarde {lockoutSeconds}s para tentar novamente
              </div>
            )}

            <button
              type="submit"
              disabled={loading || lockoutSeconds > 0 || !login || !password}
              className="btn-primary w-full py-3 text-base"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Entrando...
                </span>
              ) : (
                'Entrar'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
