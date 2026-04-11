/**
 * EcosystemEngine.ts
 *
 * Orquestrador client-side do ecossistema de IAs.
 * Processa a fila ia_acoes com Gemini, compartilha memórias,
 * respeita hierarquia e delega entre agentes.
 */
import { supabase } from '../supabase'
import type { IaAgent } from '../../types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AcaoTipo     = 'pergunta' | 'comando' | 'delegacao' | 'relatorio' | 'memoria' | 'broadcast'
export type AcaoStatus   = 'pendente' | 'em_processamento' | 'concluida' | 'erro' | 'expirada' | 'cancelada'
export type AcaoPrio     = 'baixa' | 'normal' | 'alta' | 'urgente'
export type MemoriaViz   = 'privada' | 'equipe' | 'global'
export type MemoriaTipo  = 'fato' | 'contexto' | 'instrucao' | 'resultado' | 'aprendizado' | 'regra'

export interface IaAcao {
  id:             string
  company_id:     string
  de_agent_id:    string | null
  para_agent_id:  string
  tipo:           AcaoTipo
  prioridade:     AcaoPrio
  payload:        Record<string, unknown>
  resultado?:     Record<string, unknown>
  status:         AcaoStatus
  tentativas:     number
  max_tentativas: number
  executar_apos:  string
  expira_em:      string
  processada_at?: string
  erro_mensagem?: string
  created_at:     string
  updated_at:     string
}

export interface IaMemoria {
  id:            string
  company_id:    string
  agent_id:      string
  tipo:          MemoriaTipo
  titulo?:       string
  conteudo:      string
  tags:          string[]
  visibilidade:  MemoriaViz
  importancia:   number
  expira_em?:    string
  created_at:    string
  updated_at:    string
}

// Schema que o Gemini deve retornar (JSON mode)
interface GeminiResponse {
  resposta:             string
  raciocinio?:          string
  salvar_como_memoria?: boolean
  titulo_memoria?:      string
  tags?:                string[]
  visibilidade_memoria?: MemoriaViz
  importancia_memoria?: number
  delegar_para?:        Array<{ agent_id: string; pergunta: string; prioridade?: AcaoPrio }>
  status_sugerido?:     IaAgent['status']
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class EcosystemEngine {
  private agents:    IaAgent[]
  private companyId: string
  /** Prevents double-processing the same action in the same session */
  private inFlight = new Set<string>()

  constructor(agents: IaAgent[], companyId: string) {
    this.agents    = agents
    this.companyId = companyId
  }

  updateAgents(agents: IaAgent[]): void {
    this.agents = agents
  }

  // ── Queue queries ────────────────────────────────────────────────────────────

  /** Returns pending actions for a list of agent IDs that this client can process */
  async fetchPending(agentIds: string[]): Promise<IaAcao[]> {
    if (agentIds.length === 0) return []
    const { data } = await supabase
      .from('ia_acoes')
      .select('*')
      .in('para_agent_id', agentIds)
      .eq('status', 'pendente')
      .lte('executar_apos', new Date().toISOString())
      .order('prioridade', { ascending: false })   // urgente primeiro
      .order('created_at',  { ascending: true })   // mais antigas primeiro
      .limit(20)
    return (data ?? []) as IaAcao[]
  }

  // ── Process one action ───────────────────────────────────────────────────────

  async processAction(acao: IaAcao): Promise<void> {
    if (this.inFlight.has(acao.id)) return
    this.inFlight.add(acao.id)

    const agentMap = new Map(this.agents.map(a => [a.id, a]))
    const target   = agentMap.get(acao.para_agent_id)
    if (!target) { this.inFlight.delete(acao.id); return }

    // Claim the action (prevent another tab/session from also processing it)
    const { error: claimErr } = await supabase
      .from('ia_acoes')
      .update({ status: 'em_processamento', tentativas: acao.tentativas + 1, updated_at: new Date().toISOString() })
      .eq('id', acao.id)
      .eq('status', 'pendente')   // only claim if still pending (optimistic lock)
    if (claimErr) { this.inFlight.delete(acao.id); return }

    try {
      const result = await this._callGemini(acao, target, agentMap)

      await supabase.from('ia_acoes').update({
        status:        'concluida',
        resultado:     result,
        processada_at: new Date().toISOString(),
        updated_at:    new Date().toISOString(),
      }).eq('id', acao.id)

      // Update agent status
      const nextStatus = result.status_sugerido ?? 'online'
      await supabase.from('ia_agents').update({ status: nextStatus }).eq('id', target.id)

      // Auto-save memory if Gemini flagged it
      if (result.salvar_como_memoria && result.resposta) {
        await this.saveMemoria({
          agent_id:     target.id,
          tipo:         'resultado',
          titulo:       result.titulo_memoria,
          conteudo:     result.resposta,
          tags:         result.tags,
          visibilidade: result.visibilidade_memoria ?? 'equipe',
          importancia:  result.importancia_memoria ?? 6,
          origem_acao_id: acao.id,
        })
      }

      // Send response back to requester if this was a pergunta/delegacao
      if (acao.de_agent_id && ['pergunta', 'delegacao', 'comando'].includes(acao.tipo)) {
        await this.sendAction({
          de_agent_id:   target.id,
          para_agent_id: acao.de_agent_id,
          tipo:          'relatorio',
          prioridade:    acao.prioridade,
          payload: {
            resposta:     result.resposta,
            de_acao_id:   acao.id,
            tipo_original: acao.tipo,
          },
        })
      }

      // Process any delegations the AI decided to make
      if (result.delegar_para && result.delegar_para.length > 0) {
        await Promise.all(result.delegar_para.map(d =>
          this.sendAction({
            de_agent_id:   target.id,
            para_agent_id: d.agent_id,
            tipo:          'pergunta',
            prioridade:    d.prioridade ?? 'normal',
            payload: {
              pergunta:             d.pergunta,
              responde_para_acao_id: acao.id,
              contexto:             { origem: target.nome, acao_pai: acao.tipo },
            },
          })
        ))
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const novasTentativas = acao.tentativas + 1
      const falhou = novasTentativas >= acao.max_tentativas

      await supabase.from('ia_acoes').update({
        status:        falhou ? 'erro' : 'pendente',
        erro_mensagem: msg,
        tentativas:    novasTentativas,
        // Exponential backoff: 1min, 2min, 4min
        executar_apos: !falhou
          ? new Date(Date.now() + Math.pow(2, novasTentativas) * 60_000).toISOString()
          : undefined,
        updated_at: new Date().toISOString(),
      }).eq('id', acao.id)

      await supabase.from('ia_agents').update({ status: 'online' }).eq('id', target.id)
    }

    this.inFlight.delete(acao.id)
  }

  // ── Gemini call ───────────────────────────────────────────────────────────────

  private async _callGemini(
    acao:     IaAcao,
    agent:    IaAgent,
    agentMap: Map<string, IaAgent>,
  ): Promise<GeminiResponse> {
    const apiKey =
      (agent.integracao_config?.gemini_api_key as string | undefined) ||
      (import.meta.env.VITE_GEMINI_KEY as string | undefined)

    if (!apiKey) throw new Error('Chave Gemini não configurada para ' + agent.nome)

    // Mark agent as busy
    await supabase.from('ia_agents').update({ status: 'ocupada' }).eq('id', agent.id)

    const memories = await this.fetchMemories(agent.id)
    const systemPrompt = this._buildSystemPrompt(agent, agentMap, memories)
    const userMessage  = this._buildUserMessage(acao, agentMap)

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: {
            temperature:     agent.personalidade?.temperatura    ?? 0.7,
            maxOutputTokens: agent.personalidade?.max_tokens     ?? 2000,
            responseMimeType: 'application/json',
          },
        }),
      }
    )

    if (!resp.ok) {
      const txt = await resp.text()
      throw new Error(`Gemini ${resp.status}: ${txt.slice(0, 200)}`)
    }

    const data = await resp.json()
    const raw  = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}') as string

    try {
      return JSON.parse(raw) as GeminiResponse
    } catch {
      return { resposta: raw, salvar_como_memoria: false }
    }
  }

  // ── Prompt builders ─────────────────────────────────────────────────────────

  private _buildSystemPrompt(
    agent:    IaAgent,
    agentMap: Map<string, IaAgent>,
    memories: IaMemoria[],
  ): string {
    const all        = Array.from(agentMap.values())
    const zeus       = all.find(a => a.tipo === 'zeus')
    const superior   = agent.organograma_parent_id ? agentMap.get(agent.organograma_parent_id) : null
    const reports    = all.filter(a => a.organograma_parent_id === agent.id)

    const agentList = all.map(a =>
      `  • ${a.nome} [${a.tipo}][${a.status}]${a.funcao ? ' — ' + a.funcao : ''} (id: ${a.id})`
    ).join('\n')

    const memList = memories.length > 0
      ? memories.map(m => `  • [${m.tipo}] ${m.titulo ?? ''}: ${m.conteudo.slice(0, 200)}`).join('\n')
      : '  (nenhuma memória ainda)'

    return `Você é ${agent.nome}, uma IA do ecossistema ZITA.
Tipo: ${agent.tipo} | Função: ${agent.funcao ?? 'Geral'} | Status: ${agent.status}
${agent.personalidade?.prompt_sistema ? '\nPersonalidade:\n' + agent.personalidade.prompt_sistema : ''}
${superior ? `\nVocê se reporta a: ${superior.nome} (${superior.tipo})` : ''}
${reports.length > 0 ? `Você gerencia: ${reports.map(r => r.nome).join(', ')}` : ''}
${zeus && zeus.id !== agent.id ? `IA mestre do ecossistema: ${zeus.nome}` : agent.tipo === 'zeus' ? 'Você é a IA mestre (Zeus) — lidere com clareza.' : ''}

═══ ECOSSISTEMA — Todos os agentes ═══
${agentList}

═══ SUAS MEMÓRIAS (use para contextualizar respostas) ═══
${memList}

═══ REGRAS DO ECOSSISTEMA ═══
1. Você PODE e DEVE delegar para outros agentes quando adequado
2. Use o campo "delegar_para" para solicitar ajuda de outros agentes — informe o agent_id exato
3. Memorize informações importantes — elas ficarão disponíveis nas próximas interações
4. Respeite a hierarquia: Zeus ordena, você executa e reporta
5. Sempre seja direto e útil

═══ RESPONDA SEMPRE EM JSON VÁLIDO com este schema ═══
{
  "resposta": "sua resposta principal ao solicitante",
  "raciocinio": "breve explicação interna (não enviado ao usuário)",
  "salvar_como_memoria": false,
  "titulo_memoria": "título curto se salvar",
  "tags": [],
  "visibilidade_memoria": "equipe",
  "importancia_memoria": 6,
  "delegar_para": [
    { "agent_id": "uuid-exato", "pergunta": "o que perguntar", "prioridade": "normal" }
  ],
  "status_sugerido": "online"
}`
  }

  private _buildUserMessage(acao: IaAcao, agentMap: Map<string, IaAgent>): string {
    const sender = acao.de_agent_id ? agentMap.get(acao.de_agent_id) : null
    const de     = sender ? `${sender.nome} (${sender.tipo})` : 'Humano/Sistema'

    switch (acao.tipo) {
      case 'pergunta':
        return `${de} fez uma pergunta para você:\n\n"${acao.payload.pergunta}"\n\n${
          acao.payload.contexto ? 'Contexto: ' + JSON.stringify(acao.payload.contexto) : ''
        }`

      case 'comando':
        return `${de} enviou um comando:\n\n"${acao.payload.comando}"\n\n${
          acao.payload.contexto ? 'Detalhes: ' + JSON.stringify(acao.payload.contexto) : ''
        }\n\nExecute e relate o resultado.`

      case 'delegacao':
        return `${de} delegou uma tarefa para você:\n\nTarefa: "${acao.payload.tarefa}"\nDescrição: ${
          acao.payload.descricao ?? '—'
        }\nPrazo: ${acao.payload.prazo ?? 'sem prazo'}\n\nAnalise, execute o que puder e relate.`

      case 'relatorio':
        return `${de} enviou um resultado/relatório para você:\n\n"${acao.payload.resposta}"\n\nIntegre esta informação. Responda confirmando ou tomando ação.`

      case 'memoria':
        return `${de} compartilhou uma memória com você:\n\n"${acao.payload.conteudo}"\nTags: ${
          (acao.payload.tags as string[] ?? []).join(', ')
        }\n\nProcesse e confirme o recebimento.`

      case 'broadcast':
        return `Zeus enviou uma mensagem para todo o ecossistema:\n\n"${acao.payload.mensagem}"\n\nAcuse o recebimento e execute se for uma instrução.`

      default:
        return `Ação recebida de ${de}:\n${JSON.stringify(acao.payload, null, 2)}`
    }
  }

  // ── Memory CRUD ──────────────────────────────────────────────────────────────

  /** Busca memórias relevantes para um agente (privadas + equipe/global da empresa) */
  async fetchMemories(agentId: string, limit = 10): Promise<IaMemoria[]> {
    const { data } = await supabase
      .from('ia_memorias')
      .select('*')
      .eq('company_id', this.companyId)
      .or(`agent_id.eq.${agentId},visibilidade.eq.global,visibilidade.eq.equipe`)
      .or('expira_em.is.null,expira_em.gt.' + new Date().toISOString())
      .order('importancia', { ascending: false })
      .order('created_at',  { ascending: false })
      .limit(limit)
    return (data ?? []) as IaMemoria[]
  }

  async saveMemoria(params: {
    agent_id:       string
    tipo?:          MemoriaTipo
    titulo?:        string
    conteudo:       string
    tags?:          string[]
    visibilidade?:  MemoriaViz
    importancia?:   number
    expira_em?:     Date
    origem_acao_id?: string
  }): Promise<IaMemoria | null> {
    const { data } = await supabase
      .from('ia_memorias')
      .insert({
        company_id:     this.companyId,
        agent_id:       params.agent_id,
        tipo:           params.tipo        ?? 'fato',
        titulo:         params.titulo,
        conteudo:       params.conteudo,
        tags:           params.tags        ?? [],
        visibilidade:   params.visibilidade ?? 'equipe',
        importancia:    params.importancia  ?? 5,
        expira_em:      params.expira_em?.toISOString(),
        origem_acao_id: params.origem_acao_id,
      })
      .select()
      .single()
    return data as IaMemoria | null
  }

  async deleteMemoria(id: string): Promise<void> {
    await supabase.from('ia_memorias').delete().eq('id', id)
  }

  // ── Action creation helpers ──────────────────────────────────────────────────

  async sendAction(params: {
    de_agent_id?:   string | null
    para_agent_id:  string
    tipo?:          AcaoTipo
    prioridade?:    AcaoPrio
    payload:        Record<string, unknown>
    executar_apos?: Date
    expira_em?:     Date
  }): Promise<string | null> {
    const { data } = await supabase
      .from('ia_acoes')
      .insert({
        company_id:    this.companyId,
        de_agent_id:   params.de_agent_id ?? null,
        para_agent_id: params.para_agent_id,
        tipo:          params.tipo       ?? 'pergunta',
        prioridade:    params.prioridade ?? 'normal',
        payload:       params.payload,
        executar_apos: params.executar_apos?.toISOString() ?? new Date().toISOString(),
        expira_em:     params.expira_em?.toISOString()
          ?? new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .select('id')
      .single()
    return data?.id ?? null
  }

  /** Zeus envia um broadcast para todos os subordinados diretos */
  async zeusBroadcast(
    zeusId:     string,
    mensagem:   string,
    prioridade: AcaoPrio = 'normal',
  ): Promise<void> {
    const subordinates = this.agents.filter(a => a.organograma_parent_id === zeusId)
    await Promise.all(subordinates.map(a =>
      this.sendAction({
        de_agent_id:   zeusId,
        para_agent_id: a.id,
        tipo:          'broadcast',
        prioridade,
        payload:       { mensagem },
      })
    ))
  }

  /** Cancela uma ação pendente */
  async cancelAction(acaoId: string): Promise<void> {
    await supabase
      .from('ia_acoes')
      .update({ status: 'cancelada', updated_at: new Date().toISOString() })
      .eq('id', acaoId)
      .eq('status', 'pendente')
  }

  /** Busca histórico de ações (para exibir na UI) */
  async fetchHistory(limit = 50): Promise<IaAcao[]> {
    const { data } = await supabase
      .from('ia_acoes')
      .select('*')
      .eq('company_id', this.companyId)
      .order('created_at', { ascending: false })
      .limit(limit)
    return (data ?? []) as IaAcao[]
  }
}
