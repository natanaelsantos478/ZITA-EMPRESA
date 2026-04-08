import { useState } from 'react'
import { X, Loader2, Eye, EyeOff, Plus, Trash2, Link2, Database, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import type { IaAgent, AgentTipo } from '../../../types'

// ─── Constants ───────────────────────────────────────────────────────────────

const INTEGRACOES = ['', 'flowise', 'runway', 'n8n', 'make', 'openai', 'anthropic', 'custom', 'webhook']
const TONS = ['profissional', 'casual', 'técnico', 'amigável']
const LINK_TIPOS = ['flowise', 'n8n', 'make', 'webhook', 'api', 'dashboard', 'outro'] as const
const FONTE_TIPOS = [
  { value: 'excel',           label: '📊 Excel (.xlsx)', fields: ['url'] },
  { value: 'csv',             label: '📄 CSV', fields: ['url'] },
  { value: 'api_rest',        label: '🔌 API REST', fields: ['url', 'metodo', 'headers'] },
  { value: 'webhook_entrada', label: '📥 Webhook de entrada', fields: ['secret'] },
  { value: 'google_sheets',   label: '📋 Google Sheets', fields: ['spreadsheet_id', 'aba'] },
  { value: 'banco_sql',       label: '🗄️ Banco SQL', fields: ['connection_string', 'query'] },
  { value: 'n8n',             label: '⚙️ N8N Workflow', fields: ['url'] },
  { value: 'make',            label: '🔄 Make Scenario', fields: ['url'] },
  { value: 'custom',          label: '🛠️ Personalizado', fields: ['json'] },
] as const

type FonteTipo = typeof FONTE_TIPOS[number]['value']
type LinkTipo  = typeof LINK_TIPOS[number]

interface AgentLink { label: string; url: string; tipo: LinkTipo }
interface FonteDados { tipo: FonteTipo; nome: string; config: Record<string, string> }

// ─── Field helpers ────────────────────────────────────────────────────────────

const INPUT_CLS = 'w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-brand-500'
const LABEL_CLS = 'block text-xs text-gray-500 mb-1'
const SECTION_TITLE = 'text-xs font-semibold text-gray-400 uppercase tracking-wide'

function fonteFields(tipo: FonteTipo) {
  return FONTE_TIPOS.find((f) => f.value === tipo)?.fields ?? []
}

function fonteFieldLabel(field: string): string {
  const map: Record<string, string> = {
    url: 'URL', metodo: 'Método (GET/POST)', headers: 'Headers (JSON)',
    secret: 'Secret (gerado automaticamente)', spreadsheet_id: 'Spreadsheet ID',
    aba: 'Aba', connection_string: 'Connection String', query: 'Query SQL', json: 'Config JSON',
  }
  return map[field] ?? field
}

function fonteFieldType(field: string): 'password' | 'select-metodo' | 'textarea' | 'text' {
  if (field === 'connection_string' || field === 'secret') return 'password'
  if (field === 'metodo') return 'select-metodo'
  if (field === 'headers' || field === 'query' || field === 'json') return 'textarea'
  return 'text'
}

// ─── Sub-component: collapsible section ───────────────────────────────────────

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-gray-800 pt-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left mb-3"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
        <span className={SECTION_TITLE}>{title}</span>
      </button>
      {open && children}
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  agent?: IaAgent | null
  agents: IaAgent[]
  onClose: () => void
  onSaved: () => void
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function IAModal({ agent, agents, onClose, onSaved }: Props) {
  const { companyId } = useAuth()
  const isEdit = !!agent

  // Identidade
  const [nome, setNome] = useState(agent?.nome ?? '')
  const [funcao, setFuncao] = useState(agent?.funcao ?? '')
  const [descricao, setDescricao] = useState(agent?.descricao ?? '')
  const [tipo, setTipo] = useState<AgentTipo>(agent?.tipo ?? 'subordinada')
  const [cor, setCor] = useState(agent?.cor_hex ?? '#4e5eff')
  const [parentId, setParentId] = useState(agent?.organograma_parent_id ?? '')

  // Integração principal (runtime do agente)
  const [integTipo, setIntegTipo] = useState(agent?.integracao_tipo ?? '')
  const [integUrl, setIntegUrl] = useState(agent?.integracao_url ?? '')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)

  // Links do agente
  const existingLinks = (agent?.integracao_config as { links?: AgentLink[] } | undefined)?.links ?? []
  const [links, setLinks] = useState<AgentLink[]>(existingLinks)

  // Fontes de dados
  const existingFontes = (agent?.integracao_config as { fontes_dados?: FonteDados[] } | undefined)?.fontes_dados ?? []
  const [fontes, setFontes] = useState<FonteDados[]>(existingFontes)

  // Personalidade
  const [tom, setTom] = useState(agent?.personalidade?.tom ?? 'profissional')
  const [prompt, setPrompt] = useState(agent?.personalidade?.prompt_sistema ?? '')
  const [temperatura, setTemperatura] = useState(agent?.personalidade?.temperatura ?? 0.7)
  const [maxTokens, setMaxTokens] = useState(agent?.personalidade?.max_tokens ?? 2048)

  // UI
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const zeusExists = agents.some((a) => a.tipo === 'zeus' && a.id !== agent?.id)
  const otherAgents = agents.filter((a) => a.id !== agent?.id)

  // ─── Links helpers ──────────────────────────────────────────────────────────

  const addLink = () => {
    if (links.length >= 10) return
    setLinks([...links, { label: '', url: '', tipo: 'api' }])
  }
  const removeLink = (i: number) => setLinks(links.filter((_, idx) => idx !== i))
  const updateLink = (i: number, field: keyof AgentLink, value: string) =>
    setLinks(links.map((l, idx) => idx === i ? { ...l, [field]: value } : l))

  // ─── Fontes helpers ─────────────────────────────────────────────────────────

  const addFonte = () => setFontes([...fontes, { tipo: 'api_rest', nome: '', config: {} }])
  const removeFonte = (i: number) => setFontes(fontes.filter((_, idx) => idx !== i))
  const updateFonteTipo = (i: number, t: FonteTipo) =>
    setFontes(fontes.map((f, idx) => idx === i ? { ...f, tipo: t, config: {} } : f))
  const updateFonteNome = (i: number, nome: string) =>
    setFontes(fontes.map((f, idx) => idx === i ? { ...f, nome } : f))
  const updateFonteConfig = (i: number, field: string, val: string) =>
    setFontes(fontes.map((f, idx) => idx === i ? { ...f, config: { ...f.config, [field]: val } } : f))

  // ─── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!nome.trim() || !companyId) return
    if (tipo === 'zeus' && zeusExists) {
      setErro('Já existe uma IA do tipo Zeus. Só pode haver uma.')
      return
    }
    setLoading(true)
    setErro('')

    // Build integracao_config — preserve existing fields, never log sensitive values
    const prev = (agent?.integracao_config ?? {}) as Record<string, unknown>
    const integracao_config: Record<string, unknown> = {
      ...prev,
      links: links.filter((l) => l.url.trim()),
      fontes_dados: fontes.filter((f) => f.nome.trim() || Object.keys(f.config).length > 0),
    }
    if (apiKey) integracao_config.api_key = apiKey

    const payload = {
      company_id: companyId,
      nome: nome.trim(),
      funcao: funcao.trim() || null,
      descricao: descricao.trim() || null,
      tipo,
      cor_hex: cor,
      integracao_tipo: integTipo || null,
      integracao_url: integUrl.trim() || null,
      integracao_config,
      organograma_parent_id: parentId || null,
      personalidade: { tom, idioma: 'pt-BR', prompt_sistema: prompt, temperatura, max_tokens: maxTokens },
      capacidades: agent?.capacidades ?? {},
    }

    if (isEdit && agent) {
      const { error } = await supabase.from('ia_agents').update(payload).eq('id', agent.id)
      if (error) { setErro(error.message); setLoading(false); return }
      try { await supabase.from('audit_log').insert({ acao: 'editar_ia', detalhes: { id: agent.id, nome: nome.trim() }, sucesso: true }) } catch { /* ignore */ }
    } else {
      const { error } = await supabase.from('ia_agents').insert({
        ...payload, status: 'offline', organograma_x: 100, organograma_y: 100,
        total_conversas: 0, total_tarefas_concluidas: 0, total_tarefas_erro: 0, uptime_segundos: 0,
      })
      if (error) { setErro(error.message); setLoading(false); return }
      try { await supabase.from('audit_log').insert({ acao: 'criar_ia', detalhes: { nome: nome.trim() }, sucesso: true }) } catch { /* ignore */ }
    }

    setLoading(false)
    onSaved()
    onClose()
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
          <div>
            <h2 className="font-bold text-white text-lg">{isEdit ? `Editar — ${agent.nome}` : 'Cadastrar nova IA'}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Preencha identidade, links, fontes de dados e personalidade</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5 space-y-0">
          {erro && (
            <div className="mb-4 px-3 py-2.5 bg-red-900/30 border border-red-700/50 rounded-lg text-sm text-red-400">{erro}</div>
          )}

          {/* ── IDENTIDADE ── */}
          <div className="space-y-4 pb-4">
            <p className={SECTION_TITLE}>Identidade</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={LABEL_CLS}>Nome *</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Zeus, Assistente de Vendas…"
                  className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Função / Cargo</label>
                <input value={funcao} onChange={(e) => setFuncao(e.target.value)}
                  placeholder="Ex: Coordenador de equipe"
                  className={INPUT_CLS} />
              </div>
              <div>
                <label className={LABEL_CLS}>Tipo</label>
                <select value={tipo} onChange={(e) => setTipo(e.target.value as AgentTipo)} className={INPUT_CLS}>
                  <option value="zeus">Zeus (Mestre)</option>
                  <option value="subordinada">Subordinada</option>
                  <option value="especialista">Especialista</option>
                </select>
                {tipo === 'zeus' && zeusExists && <p className="text-xs text-red-400 mt-1">Já existe uma Zeus</p>}
              </div>
              <div className="col-span-2">
                <label className={LABEL_CLS}>Descrição</label>
                <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2}
                  placeholder="Descreva o papel desta IA"
                  className={`${INPUT_CLS} resize-none`} />
              </div>
              <div>
                <label className={LABEL_CLS}>Cor do tema</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={cor} onChange={(e) => setCor(e.target.value)}
                    className="w-10 h-9 cursor-pointer rounded bg-gray-800 border border-gray-700 p-0.5" />
                  <input value={cor} onChange={(e) => setCor(e.target.value)}
                    className={`${INPUT_CLS} flex-1`} />
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>IA superior (hierarquia)</label>
                <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={INPUT_CLS}>
                  <option value="">Nenhuma (raiz)</option>
                  {otherAgents.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* ── INTEGRAÇÃO PRINCIPAL ── */}
          <Section title="Integração principal (runtime)">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL_CLS}>Plataforma</label>
                <select value={integTipo} onChange={(e) => setIntegTipo(e.target.value)} className={INPUT_CLS}>
                  {INTEGRACOES.map((i) => <option key={i} value={i}>{i || '— Nenhuma —'}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>URL do agente</label>
                <input value={integUrl} onChange={(e) => setIntegUrl(e.target.value)} placeholder="https://…"
                  className={INPUT_CLS} />
              </div>
              <div className="col-span-2">
                <label className={LABEL_CLS}>API Key {isEdit ? '(deixe vazio para manter atual)' : ''}</label>
                <div className="relative">
                  <input type={showKey ? 'text' : 'password'} value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={isEdit ? '••••••••' : 'sk-…'}
                    className={`${INPUT_CLS} pr-9`} />
                  <button type="button" onClick={() => setShowKey(!showKey)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </Section>

          {/* ── LINKS ── */}
          <Section title="Links do agente" defaultOpen={links.length > 0}>
            <div className="space-y-2">
              {links.length === 0 && (
                <p className="text-xs text-gray-600 py-1">Nenhum link cadastrado. Adicione URLs de acesso, dashboards, webhooks, etc.</p>
              )}
              {links.map((link, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={link.tipo}
                    onChange={(e) => updateLink(i, 'tipo', e.target.value)}
                    className="w-28 px-2 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-300 focus:outline-none focus:border-brand-500 flex-shrink-0"
                  >
                    {LINK_TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    value={link.label}
                    onChange={(e) => updateLink(i, 'label', e.target.value)}
                    placeholder="Rótulo"
                    className="w-32 px-2 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500 flex-shrink-0"
                  />
                  <input
                    value={link.url}
                    onChange={(e) => updateLink(i, 'url', e.target.value)}
                    placeholder="https://…"
                    className="flex-1 px-2 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
                  />
                  <button onClick={() => removeLink(i)}
                    className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors flex-shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {links.length < 10 && (
                <button onClick={addLink}
                  className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mt-1">
                  <Plus className="w-3.5 h-3.5" /> Adicionar link
                </button>
              )}
            </div>
          </Section>

          {/* ── FONTES DE DADOS ── */}
          <Section title="Fontes de dados (entradas)" defaultOpen={fontes.length > 0}>
            <div className="space-y-3">
              {fontes.length === 0 && (
                <p className="text-xs text-gray-600 py-1">Nenhuma fonte configurada. Adicione Excel, APIs, webhooks, Google Sheets, SQL, etc.</p>
              )}
              {fontes.map((fonte, i) => (
                <div key={i} className="bg-gray-800/60 border border-gray-700/60 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={fonte.tipo}
                      onChange={(e) => updateFonteTipo(i, e.target.value as FonteTipo)}
                      className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-brand-500"
                    >
                      {FONTE_TIPOS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    <input
                      value={fonte.nome}
                      onChange={(e) => updateFonteNome(i, e.target.value)}
                      placeholder="Nome desta fonte"
                      className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-500"
                    />
                    <button onClick={() => removeFonte(i)}
                      className="p-1.5 text-gray-600 hover:text-red-400 rounded-lg flex-shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Dynamic fields per fonte type */}
                  {fonteFields(fonte.tipo).map((field) => {
                    const fieldType = fonteFieldType(field)
                    const val = fonte.config[field] ?? ''
                    const isSecret = fieldType === 'password'
                    return (
                      <div key={field}>
                        <label className={LABEL_CLS}>{fonteFieldLabel(field)}</label>
                        {fieldType === 'textarea' ? (
                          <textarea
                            value={val}
                            onChange={(e) => updateFonteConfig(i, field, e.target.value)}
                            rows={2}
                            placeholder={field === 'headers' ? '{"Authorization": "Bearer …"}' : field === 'json' ? '{"key": "value"}' : ''}
                            className={`${INPUT_CLS} resize-none text-xs`}
                          />
                        ) : fieldType === 'select-metodo' ? (
                          <select
                            value={val || 'GET'}
                            onChange={(e) => updateFonteConfig(i, field, e.target.value)}
                            className={`${INPUT_CLS} text-xs`}
                          >
                            <option value="GET">GET</option>
                            <option value="POST">POST</option>
                            <option value="PUT">PUT</option>
                            <option value="PATCH">PATCH</option>
                          </select>
                        ) : (
                          <input
                            type={isSecret ? 'password' : 'text'}
                            value={isSecret && !val ? '' : val}
                            onChange={(e) => updateFonteConfig(i, field, e.target.value)}
                            placeholder={
                              field === 'url' ? 'https://…' :
                              field === 'spreadsheet_id' ? '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms' :
                              field === 'secret' ? 'Gerado automaticamente se vazio' : ''
                            }
                            readOnly={field === 'secret' && !val}
                            className={`${INPUT_CLS} text-xs`}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}

              <button onClick={addFonte}
                className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mt-1">
                <Database className="w-3.5 h-3.5" /> Adicionar fonte de dados
              </button>
            </div>
          </Section>

          {/* ── PERSONALIDADE ── */}
          <Section title="Personalidade / IA">
            <div className="space-y-3">
              <div>
                <label className={LABEL_CLS}>Tom</label>
                <select value={tom} onChange={(e) => setTom(e.target.value)} className={INPUT_CLS}>
                  {TONS.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Prompt de sistema</label>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
                  placeholder="Você é uma IA especializada em…"
                  className={`${INPUT_CLS} resize-none`} />
              </div>
              <div>
                <label className={LABEL_CLS}>
                  Temperatura: <span className="text-white font-medium">{temperatura}</span>
                  <span className="text-gray-700 ml-2">(mais criativo → 1.0)</span>
                </label>
                <input type="range" min={0.1} max={1} step={0.05} value={temperatura}
                  onChange={(e) => setTemperatura(parseFloat(e.target.value))}
                  className="w-full accent-brand-500" />
              </div>
              <div>
                <label className={LABEL_CLS}>Max tokens</label>
                <input type="number" value={maxTokens} min={256} max={32000} step={256}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
                  className={INPUT_CLS} />
              </div>
            </div>
          </Section>

          {/* bottom padding */}
          <div className="h-2" />
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-gray-800 flex-shrink-0">
          <div className="flex-1 flex items-center gap-2 text-xs text-gray-600">
            <Link2 className="w-3.5 h-3.5" />
            {links.filter((l) => l.url).length} link(s) · {fontes.length} fonte(s) de dados
          </div>
          <button onClick={onClose}
            className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={loading || !nome.trim() || (tipo === 'zeus' && zeusExists)}
            className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Salvando…' : isEdit ? 'Salvar alterações' : 'Cadastrar IA'}
          </button>
        </div>
      </div>
    </div>
  )
}
