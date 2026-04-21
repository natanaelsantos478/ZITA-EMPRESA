import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Bot, Users, Building2, Shield, Plus, Pencil, Trash2,
  Loader2, Check, AlertTriangle, Cpu
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { IaAgent, Profile, UserRole } from '../types'
import IAModal from '../modules/IAs/Config/IAModal'
import GeminiConfig from '../modules/Configuracoes/GeminiConfig'

const STATUS_COLOR: Record<string, string> = {
  online: 'bg-green-500', ocupada: 'bg-yellow-500', aguardando: 'bg-blue-500',
  offline: 'bg-gray-500', erro: 'bg-red-500', pausada: 'bg-orange-500',
}

type Tab = 'ias' | 'usuarios' | 'empresa' | 'permissoes' | 'ia_modelos'

const CAPACIDADES_COLS = ['enviar_mensagem', 'criar_tarefa', 'delegar_tarefa', 'acessar_historico', 'executar_webhook']

export default function Configuracoes() {
  const { companyId, profile } = useAuth()
  const location = useLocation()
  const [tab, setTab] = useState<Tab>('ias')
  const [agents, setAgents] = useState<IaAgent[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)
  const [modalAgent, setModalAgent] = useState<IaAgent | null | undefined>(undefined) // undefined = closed
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [caps, setCaps] = useState<Record<string, Record<string, boolean>>>({})

  // Hash routing for /configuracoes/ias
  useEffect(() => {
    if (location.pathname.includes('/ias')) setTab('ias')
  }, [location.pathname])

  const loadAgents = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    const { data } = await supabase
      .from('ia_agents').select('*').eq('company_id', companyId).order('tipo')
    if (data) {
      setAgents(data as IaAgent[])
      // Build caps map
      const c: Record<string, Record<string, boolean>> = {}
      data.forEach((a: IaAgent) => {
        c[a.id] = {}
        CAPACIDADES_COLS.forEach((cap) => {
          c[a.id][cap] = !!(a.capacidades as Record<string, boolean>)[cap]
        })
      })
      setCaps(c)
    }
    setLoading(false)
  }, [companyId])

  const loadProfiles = useCallback(async () => {
    if (!companyId) return
    const { data } = await supabase.from('profiles').select('*').eq('company_id', companyId)
    if (data) setProfiles(data as Profile[])
  }, [companyId])

  useEffect(() => {
    loadAgents()
    loadProfiles()
  }, [loadAgents, loadProfiles])

  const deleteAgent = async (id: string) => {
    const agent = agents.find((a) => a.id === id)
    if (agent?.tipo === 'zeus') return // protect Zeus
    await supabase.from('ia_agents').delete().eq('id', id)
    try { await supabase.from('audit_log').insert({ acao: 'excluir_ia', detalhes: { id }, sucesso: true }) } catch { /* ignore */ }
    setDeleteConfirm(null)
    loadAgents()
  }

  const savePermissoes = async () => {
    setSaving(true)
    for (const [agentId, capMap] of Object.entries(caps)) {
      await supabase.from('ia_agents').update({ capacidades: capMap }).eq('id', agentId)
    }
    try { await supabase.from('audit_log').insert({ acao: 'editar_permissoes', detalhes: {}, sucesso: true }) } catch { /* ignore */ }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const updateRole = async (profileId: string, role: UserRole) => {
    await supabase.from('profiles').update({ role }).eq('id', profileId)
    try { await supabase.from('audit_log').insert({ acao: 'editar_usuario', detalhes: { id: profileId, role }, sucesso: true }) } catch { /* ignore */ }
    loadProfiles()
  }

  const TABS: { key: Tab; label: string; icon: typeof Bot }[] = [
    { key: 'ias',        label: 'Minhas IAs',  icon: Bot       },
    { key: 'permissoes', label: 'Permissões',  icon: Shield    },
    { key: 'usuarios',   label: 'Usuários',    icon: Users     },
    { key: 'empresa',    label: 'Empresa',     icon: Building2 },
    { key: 'ia_modelos', label: 'IA & Modelos', icon: Cpu      },
  ]

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-52 flex-shrink-0 border-r border-gray-800 bg-gray-900/50 p-3 space-y-1">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide px-3 py-2">Configurações</p>
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-brand-600/20 text-brand-400 border border-brand-600/30'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
          </div>
        ) : (
          <>
            {/* IAs */}
            {tab === 'ias' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-white">Minhas IAs</h2>
                    <p className="text-sm text-gray-500 mt-0.5">{agents.length} IA{agents.length !== 1 ? 's' : ''} cadastrada{agents.length !== 1 ? 's' : ''}</p>
                  </div>
                  <button
                    onClick={() => setModalAgent(null)}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Adicionar IA
                  </button>
                </div>

                <div className="space-y-3">
                  {agents.map((a) => (
                    <div
                      key={a.id}
                      id={a.id}
                      className="flex items-center gap-4 p-4 bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl transition-colors"
                    >
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                        style={{ backgroundColor: a.cor_hex || '#3a40f5' }}
                      >
                        {a.avatar_url
                          ? <img src={a.avatar_url} alt={a.nome} className="w-full h-full rounded-xl object-cover" />
                          : a.nome.slice(0, 2).toUpperCase()
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white">{a.nome}</p>
                          <span className="text-xs text-gray-600 capitalize border border-gray-700 px-1.5 py-0.5 rounded">{a.tipo}</span>
                          {a.tipo === 'zeus' && (
                            <span className="text-xs text-yellow-400 border border-yellow-700/50 px-1.5 py-0.5 rounded">Mestre</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1.5 text-xs text-gray-500">
                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_COLOR[a.status]}`} />
                            {a.status}
                          </span>
                          {a.integracao_tipo && (
                            <span className="text-xs text-gray-600">{a.integracao_tipo}</span>
                          )}
                          {a.funcao && <span className="text-xs text-gray-600">{a.funcao}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setModalAgent(a)}
                          className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {a.tipo !== 'zeus' && (
                          <button
                            onClick={() => setDeleteConfirm(a.id)}
                            className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {agents.length === 0 && (
                    <div className="text-center py-12 border border-dashed border-gray-800 rounded-xl">
                      <Bot className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                      <p className="text-sm text-gray-500">Nenhuma IA ainda</p>
                      <button
                        onClick={() => setModalAgent(null)}
                        className="mt-3 text-sm text-brand-400 hover:text-brand-300"
                      >
                        Adicionar primeira IA →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PERMISSÕES */}
            {tab === 'permissoes' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-white">Permissões</h2>
                    <p className="text-sm text-gray-500 mt-0.5">Capacidades habilitadas por IA</p>
                  </div>
                  <button
                    onClick={savePermissoes}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
                    {saved ? 'Salvo!' : 'Salvar'}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left py-3 px-4 text-gray-500 font-medium">IA</th>
                        {CAPACIDADES_COLS.map((c) => (
                          <th key={c} className="text-center py-3 px-3 text-gray-500 font-medium text-xs">
                            {c.replace(/_/g, ' ')}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {agents.map((a) => (
                        <tr key={a.id} className="hover:bg-gray-900/50">
                          <td className="py-3 px-4 text-white font-medium">{a.nome}</td>
                          {CAPACIDADES_COLS.map((cap) => (
                            <td key={cap} className="py-3 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={caps[a.id]?.[cap] ?? false}
                                onChange={(e) =>
                                  setCaps((prev) => ({
                                    ...prev,
                                    [a.id]: { ...(prev[a.id] ?? {}), [cap]: e.target.checked },
                                  }))
                                }
                                className="w-4 h-4 rounded text-brand-500 border-gray-600 bg-gray-800 focus:ring-brand-500"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* USUÁRIOS */}
            {tab === 'usuarios' && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-white">Usuários</h2>
                    <p className="text-sm text-gray-500 mt-0.5">{profiles.length} usuário{profiles.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {profiles.map((p) => (
                    <div key={p.id} className="flex items-center gap-4 p-4 bg-gray-900 border border-gray-800 rounded-xl">
                      <div className="w-9 h-9 rounded-full bg-brand-700/40 flex items-center justify-center text-brand-300 font-medium text-sm flex-shrink-0">
                        {p.nome.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{p.nome}</p>
                        <p className="text-xs text-gray-500">{p.email}</p>
                      </div>
                      {p.id === profile?.id ? (
                        <span className="text-xs text-gray-500 capitalize border border-gray-700 px-2 py-1 rounded">{p.role} (você)</span>
                      ) : (
                        <select
                          value={p.role}
                          onChange={(e) => updateRole(p.id, e.target.value as UserRole)}
                          className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-brand-500"
                        >
                          <option value="owner">Owner</option>
                          <option value="admin">Admin</option>
                          <option value="operator">Operator</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* EMPRESA */}
            {tab === 'empresa' && (
              <div>
                <h2 className="text-xl font-bold text-white mb-6">Empresa</h2>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 max-w-lg space-y-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">ID da empresa</p>
                    <p className="text-sm font-mono text-gray-400">{companyId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Projeto Supabase</p>
                    <p className="text-sm text-gray-400">fyearatapvhgyreifniq</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Região</p>
                    <p className="text-sm text-gray-400">us-west-2</p>
                  </div>
                </div>
              </div>
            )}

            {/* IA & MODELOS */}
            {tab === 'ia_modelos' && <GeminiConfig />}
          </>
        )}
      </div>

      {/* Modals */}
      {modalAgent !== undefined && (
        <IAModal
          agent={modalAgent}
          agents={agents}
          onClose={() => setModalAgent(undefined)}
          onSaved={loadAgents}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <h3 className="font-semibold text-white">Excluir IA?</h3>
            </div>
            <p className="text-sm text-gray-400 mb-6">Esta ação é irreversível. Todas as conversas e tarefas desta IA serão mantidas no banco.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2 bg-gray-800 text-gray-300 text-sm rounded-lg hover:bg-gray-700">
                Cancelar
              </button>
              <button onClick={() => deleteAgent(deleteConfirm)} className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
