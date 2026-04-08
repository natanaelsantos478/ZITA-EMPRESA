import { useState, useEffect, useRef, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brain, Eye, EyeOff, Loader2, Lock, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const LOCK_KEY = 'login_blocked_until'
const ATTEMPTS_KEY = 'login_attempts'
const MAX_ATTEMPTS = 5
const BLOCK_SECONDS = 30

function getRemainingBlock(): number {
  const until = parseInt(localStorage.getItem(LOCK_KEY) ?? '0', 10)
  const remaining = Math.ceil((until - Date.now()) / 1000)
  return remaining > 0 ? remaining : 0
}

export default function Login() {
  const { signIn, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [login, setLogin] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [manterConectado, setManterConectado] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const [blockedFor, setBlockedFor] = useState(getRemainingBlock)

  const loginRef = useRef<HTMLInputElement>(null)

  // Redirect se já logado
  useEffect(() => {
    if (!authLoading && user) navigate('/dashboard', { replace: true })
  }, [user, authLoading, navigate])

  // Countdown do bloqueio
  useEffect(() => {
    if (blockedFor <= 0) return
    const interval = setInterval(() => {
      const rem = getRemainingBlock()
      setBlockedFor(rem)
      if (rem <= 0) {
        localStorage.removeItem(LOCK_KEY)
        localStorage.removeItem(ATTEMPTS_KEY)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [blockedFor])

  useEffect(() => {
    loginRef.current?.focus()
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (blockedFor > 0) return

    setLoading(true)
    setErro('')

    const { error } = await signIn(login.trim(), senha)

    if (error) {
      setSenha('')
      const attempts = parseInt(localStorage.getItem(ATTEMPTS_KEY) ?? '0', 10) + 1
      localStorage.setItem(ATTEMPTS_KEY, String(attempts))

      if (attempts >= MAX_ATTEMPTS) {
        const blockUntil = Date.now() + BLOCK_SECONDS * 1000
        localStorage.setItem(LOCK_KEY, String(blockUntil))
        setBlockedFor(BLOCK_SECONDS)
        localStorage.removeItem(ATTEMPTS_KEY)
      }

      setErro('Login ou senha incorretos')
    } else {
      localStorage.removeItem(ATTEMPTS_KEY)
      localStorage.removeItem(LOCK_KEY)
      navigate('/dashboard', { replace: true })
    }

    setLoading(false)
  }

  const isDisabled = loading || blockedFor > 0 || authLoading

  return (
    <div className="min-h-screen flex">
      {/* Esquerda — painel de branding */}
      <div className="hidden lg:flex flex-col w-[60%] bg-gradient-to-br from-gray-950 via-gray-900 to-brand-950 relative overflow-hidden p-12">
        {/* Grid de fundo */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: 'radial-gradient(circle, #4e5eff 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* Logo */}
        <div className="relative flex items-center gap-3 mb-auto">
          <div className="w-12 h-12 bg-brand-600 rounded-2xl flex items-center justify-center shadow-lg shadow-brand-900/50">
            <Brain className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Escritório de IA</h1>
            <p className="text-sm text-brand-400">Centro de controle das suas IAs</p>
          </div>
        </div>

        {/* Organograma ilustrativo SVG */}
        <div className="relative flex-1 flex items-center justify-center">
          <svg viewBox="0 0 400 300" className="w-full max-w-md opacity-60">
            {/* Linhas */}
            <line x1="200" y1="80" x2="100" y2="180" stroke="#4e5eff" strokeWidth="2" strokeDasharray="4,4" />
            <line x1="200" y1="80" x2="200" y2="180" stroke="#4e5eff" strokeWidth="2" strokeDasharray="4,4" />
            <line x1="200" y1="80" x2="300" y2="180" stroke="#4e5eff" strokeWidth="2" strokeDasharray="4,4" />
            <line x1="100" y1="180" x2="60" y2="260" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="4,4" />
            <line x1="100" y1="180" x2="140" y2="260" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="4,4" />

            {/* Zeus - nó principal */}
            <rect x="160" y="40" width="80" height="40" rx="8" fill="#3a40f5" stroke="#7487ff" strokeWidth="1.5" />
            <text x="200" y="65" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">Zeus</text>

            {/* Nós filhos */}
            {[
              { x: 60, y: 160, label: 'Vendas', color: '#22c55e' },
              { x: 160, y: 160, label: 'Suporte', color: '#eab308' },
              { x: 260, y: 160, label: 'Marketing', color: '#3b82f6' },
            ].map(({ x, y, label, color }) => (
              <g key={label}>
                <rect x={x} y={y} width="80" height="36" rx="6" fill="#1f2937" stroke={color} strokeWidth="1.5" />
                <circle cx={x + 10} cy={y + 18} r="5" fill={color} />
                <text x={x + 22} y={y + 22} fill="#e5e7eb" fontSize="10">{label}</text>
              </g>
            ))}

            {/* Nós netos */}
            {[
              { x: 20, y: 245, label: 'Bot 1', color: '#6b7280' },
              { x: 100, y: 245, label: 'Bot 2', color: '#6b7280' },
            ].map(({ x, y, label, color }) => (
              <g key={label}>
                <rect x={x} y={y} width="60" height="28" rx="5" fill="#111827" stroke={color} strokeWidth="1" />
                <text x={x + 30} y={y + 18} textAnchor="middle" fill="#9ca3af" fontSize="9">{label}</text>
              </g>
            ))}
          </svg>
        </div>

        {/* Rodapé branding */}
        <p className="relative text-sm text-gray-600 mt-auto">
          ZITA — Escritório de IA em cloud. Nenhum computador local precisa ficar ligado.
        </p>
      </div>

      {/* Direita — formulário */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm">
          {/* Logo mobile */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-gray-900">Escritório de IA</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Entrar</h2>
          <p className="text-sm text-gray-500 mb-8">Use seu código de acesso ou e-mail</p>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Login */}
            <div>
              <label htmlFor="login" className="block text-sm font-medium text-gray-700 mb-1.5">
                Login
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={loginRef}
                  id="login"
                  type="text"
                  autoComplete="username"
                  placeholder="00001 ou email completo"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  disabled={isDisabled}
                  required
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-50 disabled:bg-gray-50"
                />
              </div>
            </div>

            {/* Senha */}
            <div>
              <label htmlFor="senha" className="block text-sm font-medium text-gray-700 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  id="senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  disabled={isDisabled}
                  required
                  className="w-full pl-9 pr-10 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 disabled:opacity-50 disabled:bg-gray-50"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(!mostrarSenha)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Manter conectado */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={manterConectado}
                onChange={(e) => setManterConectado(e.target.checked)}
                className="w-4 h-4 text-brand-600 border-gray-300 rounded focus:ring-brand-500"
              />
              <span className="text-sm text-gray-600">Manter conectado</span>
            </label>

            {/* Erro */}
            {erro && (
              <div className="px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {erro}
              </div>
            )}

            {/* Bloqueio */}
            {blockedFor > 0 && (
              <div className="px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                Muitas tentativas. Aguarde {blockedFor}s antes de tentar novamente.
              </div>
            )}

            {/* Botão */}
            <button
              type="submit"
              disabled={isDisabled || !login || !senha}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {blockedFor > 0 ? `Aguarde ${blockedFor}s` : loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-8">
            ZITA Escritório de IA &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  )
}
