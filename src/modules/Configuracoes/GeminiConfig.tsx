import { useState, useEffect, useCallback } from 'react'
import { CheckCircle, XCircle, Loader2, Eye, EyeOff, ExternalLink } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://fyearatapvhgyreifniq.supabase.co'

const MODELOS = [
  { value: 'gemini-2.0-flash',   label: 'Gemini 2.0 Flash (recomendado)' },
  { value: 'gemini-1.5-flash',   label: 'Gemini 1.5 Flash' },
  { value: 'gemini-1.5-pro',     label: 'Gemini 1.5 Pro' },
]

type TesteResult = { ok: boolean; msg: string } | null

export default function GeminiConfig() {
  const { isAdmin, getSessionToken } = useAuth()

  const [geminiConfigurado, setGeminiConfigurado] = useState(false)
  const [geminiModelo,      setGeminiModelo]      = useState('gemini-2.0-flash')
  const [editando,          setEditando]          = useState(false)
  const [novaKey,           setNovaKey]           = useState('')
  const [novoModelo,        setNovoModelo]        = useState('gemini-2.0-flash')
  const [mostrarKey,        setMostrarKey]        = useState(false)
  const [carregando,        setCarregando]        = useState(true)
  const [salvando,          setSalvando]          = useState(false)
  const [testando,          setTestando]          = useState(false)
  const [testeResult,       setTesteResult]       = useState<TesteResult>(null)
  const [erro,              setErro]              = useState<string | null>(null)

  const callSettings = useCallback(async (method: string, body?: unknown) => {
    const token = await getSessionToken()
    const res = await fetch(`${SUPABASE_URL}/functions/v1/company-settings`, {
      method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    return res.json() as Promise<Record<string, unknown>>
  }, [getSessionToken])

  useEffect(() => {
    callSettings('GET').then((data) => {
      setGeminiConfigurado(!!data.gemini_configurado)
      const mdl = (data.gemini_modelo as string) || 'gemini-2.0-flash'
      setGeminiModelo(mdl)
      setNovoModelo(mdl)
      setCarregando(false)
    }).catch(() => setCarregando(false))
  }, [callSettings])

  const salvar = async () => {
    if (!novaKey.trim()) return
    setSalvando(true)
    setErro(null)
    const data = await callSettings('POST', {
      action:  'save_gemini_key',
      api_key: novaKey,
      modelo:  novoModelo,
    })
    setSalvando(false)
    if (data.ok) {
      setGeminiConfigurado(true)
      setGeminiModelo(novoModelo)
      setEditando(false)
      setNovaKey('')
    } else {
      setErro((data.error as string) || 'Erro ao salvar a API Key.')
    }
  }

  const testar = async () => {
    setTestando(true)
    setTesteResult(null)
    const data = await callSettings('POST', { action: 'test_gemini_key' })
    setTestando(false)
    if (data.ok) {
      setTesteResult({ ok: true, msg: `Modelo ${data.modelo as string} funcionando corretamente!` })
    } else {
      setTesteResult({ ok: false, msg: (data.erro as string) || 'Falha no teste.' })
    }
  }

  const remover = async () => {
    setSalvando(true)
    const data = await callSettings('POST', { action: 'remove_gemini_key' })
    setSalvando(false)
    if (data.ok) {
      setGeminiConfigurado(false)
      setEditando(false)
      setTesteResult(null)
    }
  }

  const cancelarEdicao = () => {
    setEditando(false)
    setNovaKey('')
    setMostrarKey(false)
    setErro(null)
    setNovoModelo(geminiModelo)
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">IA & Modelos</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Gemini API Key compartilhada por toda a empresa. A key fica criptografada no banco e nunca é exposta.
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">

        {/* ── Modelo ── */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Modelo Gemini</label>
          {editando ? (
            <select
              value={novoModelo}
              onChange={(e) => setNovoModelo(e.target.value)}
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-brand-500"
            >
              {MODELOS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-white">
              {MODELOS.find((m) => m.value === geminiModelo)?.label ?? geminiModelo}
            </p>
          )}
        </div>

        {/* ── API Key ── */}
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-1.5">Gemini API Key</label>

          {editando ? (
            <div className="space-y-3">
              <div className="relative">
                <input
                  type={mostrarKey ? 'text' : 'password'}
                  value={novaKey}
                  onChange={(e) => setNovaKey(e.target.value)}
                  placeholder="AIza..."
                  autoComplete="off"
                  className="w-full px-3 py-2 pr-10 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white font-mono focus:outline-none focus:border-brand-500"
                />
                <button
                  type="button"
                  onClick={() => setMostrarKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                >
                  {mostrarKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {erro && <p className="text-xs text-red-400">{erro}</p>}

              <div className="flex items-center gap-2">
                <button
                  onClick={salvar}
                  disabled={salvando || !novaKey.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Salvar
                </button>
                <button
                  onClick={cancelarEdicao}
                  className="px-3 py-1.5 bg-gray-800 text-gray-400 text-sm rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                {geminiConfigurado && (
                  <button
                    onClick={remover}
                    disabled={salvando}
                    className="ml-auto px-3 py-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 text-sm rounded-lg transition-colors"
                  >
                    Remover key
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg">
                  <span className="text-sm font-mono text-gray-500 tracking-widest select-none">
                    {geminiConfigurado ? '●●●●●●●●●●●●●●●●●●●●' : '—'}
                  </span>
                </div>

                {isAdmin && (
                  <>
                    <button
                      onClick={() => setEditando(true)}
                      className="px-3 py-2 text-sm text-gray-400 border border-gray-700 rounded-lg hover:text-white hover:border-gray-600 transition-colors"
                    >
                      Editar
                    </button>
                    {geminiConfigurado && (
                      <button
                        onClick={testar}
                        disabled={testando}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 border border-gray-700 rounded-lg hover:text-white hover:border-gray-600 transition-colors"
                      >
                        {testando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Testar
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Status */}
              <div className="flex items-center gap-1.5">
                {geminiConfigurado ? (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    <span className="text-xs text-green-400">API Key configurada</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
                    <span className="text-xs text-gray-500">Não configurada</span>
                  </>
                )}
              </div>

              {/* Resultado do teste */}
              {testeResult && (
                <div className={`flex items-center gap-1.5 text-xs ${testeResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                  {testeResult.ok
                    ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    : <XCircle    className="w-3.5 h-3.5 flex-shrink-0" />
                  }
                  {testeResult.msg}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Como obter a key ── */}
        <div className="pt-2 border-t border-gray-800">
          <p className="text-xs text-gray-600">
            Como obter sua API Key:{' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-400 hover:text-brand-300 inline-flex items-center gap-0.5"
            >
              aistudio.google.com/apikey
              <ExternalLink className="w-3 h-3" />
            </a>
          </p>
        </div>
      </div>

      {/* Info box */}
      <div className="bg-blue-900/20 border border-blue-800/40 rounded-xl p-4">
        <p className="text-xs text-blue-300 leading-relaxed">
          Esta key é compartilhada por todos os agentes da empresa que não têm uma key individual configurada.
          Ela fica armazenada criptografada (AES-256-GCM) e nunca é transmitida ao navegador.
        </p>
      </div>
    </div>
  )
}
