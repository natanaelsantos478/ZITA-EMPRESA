import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// ──────────────────────────────────────────────────────────
// WhatsApp Gateway — ZITA Escritório de IA
//
// Fluxo:
//   Z-API recebe mensagem
//   → chama esta Edge Function (verify_jwt: false)
//   → descobre qual agente responde via ia_agents.zapi_instance_id
//   → chama o Flowise configurado no agente
//   → salva mensagens no banco
//   → responde via Z-API
//
// Para adicionar nova IA com WhatsApp:
//   INSERT na ia_agents com zapi_instance_id, zapi_token, whatsapp_ativo=true
//
// Para trocar número/Flowise:
//   UPDATE de 1 linha em ia_agents — sem novo deploy
// ──────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' }
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Body inválido' }, 400)
  }

  // Ignorar mensagens enviadas pelo próprio bot (evita loop infinito)
  if (body.fromMe === true) {
    return json({ ok: true, info: 'mensagem própria ignorada' })
  }

  // ── Extrair dados do payload do Z-API ──────────────────
  const instanceId    = (body.instanceId as string) || ''
  const rawPhone      = (body.phone as string) || ''
  const contatoNumero = rawPhone
    .replace('@s.whatsapp.net', '')
    .replace('@c.us', '')
    .replace(/\D/g, '')
  const contatoNome   = (body.senderName as string) || (body.chatName as string) || contatoNumero
  const textObj       = body.text as Record<string, string> | undefined
  const mensagem      = textObj?.message || (body.caption as string) || ''

  if (!mensagem || !contatoNumero || !instanceId) {
    return json({ ok: true, info: 'sem conteúdo processável' })
  }

  // ── 1. Descobrir qual agente responde por este instanceId ──
  const { data: agent, error: agentError } = await supabase
    .from('ia_agents')
    .select(`
      id, company_id, nome, status, total_conversas,
      integracao_url, integracao_config,
      zapi_instance_id, zapi_token, whatsapp_ativo
    `)
    .eq('zapi_instance_id', instanceId)
    .eq('whatsapp_ativo', true)
    .single()

  if (agentError || !agent) {
    console.error('Agente não encontrado para instanceId:', instanceId, agentError?.message)
    return json({ error: 'Agente não configurado para esta instância' }, 404)
  }

  // ── 2. Verificar disponibilidade ───────────────────────
  if (agent.status === 'pausada' || agent.status === 'offline') {
    return json({ ok: true, info: `agente ${agent.status}` })
  }

  // ── 3. Buscar ou criar sessão desta conversa ───────────
  let sessao: Record<string, unknown> | null = null
  const { data: sessaoExistente } = await supabase
    .from('whatsapp_sessoes')
    .select('*')
    .eq('agent_id', agent.id)
    .eq('contato_numero', contatoNumero)
    .maybeSingle()

  let novaConversa = false

  if (sessaoExistente) {
    sessao = sessaoExistente
  } else {
    novaConversa = true

    const { data: conv } = await supabase
      .from('ia_conversas')
      .insert({
        company_id:      agent.company_id,
        agent_id:        agent.id,
        titulo:          `WhatsApp: ${contatoNome}`,
        canal:           'whatsapp',
        canal_remetente: contatoNumero,
        status:          'ativa'
      })
      .select('id')
      .single()

    const { data: novaSessao } = await supabase
      .from('whatsapp_sessoes')
      .insert({
        company_id:     agent.company_id,
        agent_id:       agent.id,
        contato_numero: contatoNumero,
        contato_nome:   contatoNome,
        conversa_id:    conv?.id,
        sessao_flowise: `zap_${agent.id}_${contatoNumero}`,
      })
      .select('*')
      .single()

    sessao = novaSessao
  }

  if (!sessao) return json({ error: 'Erro ao criar sessão' }, 500)

  // ── 4. Salvar mensagem do contato ──────────────────────
  await supabase.from('ia_mensagens').insert({
    conversa_id:    sessao.conversa_id,
    company_id:     agent.company_id,
    remetente_tipo: 'humano',
    remetente_nome: contatoNome,
    conteudo:       mensagem,
    conteudo_tipo:  'texto',
    metadados:      { canal: 'whatsapp', numero: contatoNumero }
  })

  // ── 5. Chamar o Flowise do agente ──────────────────────
  const config     = (agent.integracao_config as Record<string, string>) || {}
  const flowiseUrl = (agent.integracao_url as string) || ''
  const chatflowId = config.chatflow_id || config.chatflowid || ''

  if (!flowiseUrl || !chatflowId) {
    console.error('Flowise não configurado para agente:', agent.id)
    await supabase.from('ia_agents')
      .update({ status: 'erro', status_detalhe: 'Flowise não configurado' })
      .eq('id', agent.id)
    return json({ error: 'Flowise não configurado neste agente' }, 502)
  }

  const inicio = Date.now()
  let resposta  = ''

  try {
    await supabase.from('ia_agents')
      .update({ status: 'ocupada', status_detalhe: `Respondendo ${contatoNome}` })
      .eq('id', agent.id)

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (config.api_key) headers['Authorization'] = `Bearer ${config.api_key}`

    const flowRes = await fetch(
      `${flowiseUrl}/api/v1/prediction/${chatflowId}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          question:        mensagem,
          sessionId:       sessao.sessao_flowise,
          overrideConfig:  { sessionId: sessao.sessao_flowise }
        })
      }
    )

    if (!flowRes.ok) {
      throw new Error(`Flowise retornou ${flowRes.status}: ${await flowRes.text()}`)
    }

    const flowData = await flowRes.json() as Record<string, string>
    resposta = flowData.text || flowData.answer || flowData.output || ''
    if (!resposta) throw new Error('Flowise retornou resposta vazia')

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Erro no Flowise:', msg)

    await supabase.from('ia_mensagens').insert({
      conversa_id:    sessao.conversa_id,
      company_id:     agent.company_id,
      remetente_tipo: 'sistema',
      remetente_nome: 'Sistema',
      conteudo:       `Erro ao contatar IA: ${msg}`,
      conteudo_tipo:  'texto',
      acao_tipo:      'erro_flowise',
      acao_status:    'erro'
    })

    await supabase.from('ia_agents')
      .update({ status: 'erro', status_detalhe: msg })
      .eq('id', agent.id)

    return json({ error: 'IA indisponível' }, 502)
  }

  const latencia = Date.now() - inicio

  // ── 6. Salvar resposta da IA ───────────────────────────
  await supabase.from('ia_mensagens').insert({
    conversa_id:    sessao.conversa_id,
    company_id:     agent.company_id,
    remetente_tipo: 'ia',
    remetente_id:   agent.id,
    remetente_nome: agent.nome,
    conteudo:       resposta,
    conteudo_tipo:  'texto',
    latencia_ms:    latencia,
    metadados:      { canal: 'whatsapp', numero_destino: contatoNumero }
  })

  // ── 7. Atualizar sessão e agente ───────────────────────
  await supabase.from('whatsapp_sessoes')
    .update({
      ultimo_contato_at: new Date().toISOString(),
      total_mensagens:   ((sessao.total_mensagens as number) || 0) + 2,
      contato_nome:      contatoNome
    })
    .eq('id', sessao.id)

  await supabase.from('ia_agents')
    .update({
      status:          'online',
      status_detalhe:  null,
      total_conversas: ((agent.total_conversas as number) || 0) + (novaConversa ? 1 : 0)
    })
    .eq('id', agent.id)

  // ── 8. Enviar resposta pelo Z-API ──────────────────────
  try {
    await fetch(
      `https://api.z-api.io/instances/${agent.zapi_instance_id}/token/${agent.zapi_token}/send-text`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone: contatoNumero, message: resposta })
      }
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Erro ao enviar via Z-API:', msg)
    // Não falhar — a resposta foi gerada, só o envio falhou
  }

  return json({ ok: true, resposta })
})
