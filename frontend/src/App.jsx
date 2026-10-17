import { useState, useEffect } from 'react'
import axios from 'axios'
import Calendario, { toISO } from './components/Calendario'
import ConfirmacaoAgendamento from './components/ConfirmacaoAgendamento'
import ContaCliente from './components/ContaCliente'
import MeusHorarios from './components/MeusHorarios'
import SessaoExtra from './components/SessaoExtra'
import './components/SessaoExtra.css'
import { API_URL as API, DIAS_FECHADOS } from './config'
import { lerSessao, salvarSessao, limparSessao } from './auth/clienteAuth'
import './App.css'

// Formata enquanto digita: (62) 99999-9999 ou (62) 3333-4444 (fixo)
function formatarWhatsapp(valor) {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// 'YYYY-MM-DD' -> Date (sem problema de fuso)
function isoParaData(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d)
}

function somarDias(data, dias) {
  const d = new Date(data)
  d.setDate(d.getDate() + dias)
  return d
}

function App() {
  const [servicos, setServicos] = useState([])
  const [horarios, setHorarios] = useState([])
  const [carregandoHorarios, setCarregandoHorarios] = useState(false)
  const [diaFechado, setDiaFechado] = useState(false)
  const [motivoFechado, setMotivoFechado] = useState('')
  const [diasBloqueados, setDiasBloqueados] = useState(new Set()) // folgas da dona

  // Controle do Calendário
  const hoje = new Date()
  const [mesAtual, setMesAtual] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const [dataSelecionada, setDataSelecionada] = useState(hoje)

  // Formulário
  const [horaSelecionada, setHoraSelecionada] = useState(null)
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [servicoId, setServicoId] = useState('')
  const [sessoesExtras, setSessoesExtras] = useState({}) // combo: { 2: {data, hora, chave}, ... }

  // Login da cliente (Google)
  const [sessao, setSessao] = useState(lerSessao()) // { token, cliente }
  const [entrando, setEntrando] = useState(false)
  const [aba, setAba] = useState('agendar') // 'agendar' | 'meus' (só com login)
  const [recarregar, setRecarregar] = useState(0)

  // Envio e confirmação
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmado, setConfirmado] = useState(null) // dados do agendamento feito

  // Preenche nome e WhatsApp com o que já sabemos da cliente
  const preencherComConta = (cliente) => {
    setNome((atual) => atual || cliente.nome || '')
    setWhatsapp((atual) => atual || formatarWhatsapp(cliente.whatsapp || ''))
  }

  // 0. Se já tinha sessão salva, confere se ainda vale e atualiza os dados
  //    (roda de novo quando a cliente volta para a aba)
  useEffect(() => {
    const salva = lerSessao()
    if (!salva) return
    axios.get(`${API}/minha-conta/`, { headers: { Authorization: `Token ${salva.token}` } })
      .then(({ data }) => {
        const atualizada = { ...salva, cliente: data }
        salvarSessao(atualizada)
        setSessao(atualizada)
        preencherComConta(data)
      })
      .catch((error) => {
        if (error.response?.status === 401) sair()
      })
  }, [recarregar])

  const entrarComGoogle = async (credential) => {
    setErro('')
    setEntrando(true)
    try {
      const { data } = await axios.post(`${API}/auth/google/`, { credential })
      salvarSessao(data)
      setSessao(data)
      preencherComConta(data.cliente)
    } catch (error) {
      setErro(error.response?.data?.erro || 'Não foi possível entrar com o Google. Tente de novo.')
    } finally {
      setEntrando(false)
    }
  }

  const sair = () => {
    limparSessao()
    setSessao(null)
    setAba('agendar')
    setNome('')
    setWhatsapp('')
  }

  // Quando a cliente volta para a aba, busca os horários de novo
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') setRecarregar((n) => n + 1)
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [])

  // Se o mês escolhido já tem horário, leva o calendário para o próximo mês livre
  const ocupadosChave = (sessao?.cliente?.meses_ocupados || []).join(',')
  useEffect(() => {
    const ocupados = ocupadosChave ? ocupadosChave.split(',') : []
    if (!ocupados.includes(toISO(dataSelecionada).slice(0, 7))) return
    const d = new Date(dataSelecionada)
    d.setDate(1)
    while (ocupados.includes(toISO(d).slice(0, 7))) d.setMonth(d.getMonth() + 1)
    const hojeZero = new Date(new Date().setHours(0, 0, 0, 0))
    if (d < hojeZero) d.setTime(hojeZero.getTime())
    while (DIAS_FECHADOS.includes(d.getDay())) d.setDate(d.getDate() + 1)
    setMesAtual(new Date(d.getFullYear(), d.getMonth(), 1))
    setDataSelecionada(d)
  }, [ocupadosChave])

  // Folgas/feriados do mês que está no calendário
  useEffect(() => {
    const ano = mesAtual.getFullYear()
    const mes = mesAtual.getMonth()
    axios
      .get(`${API}/dias-bloqueados/`, {
        params: { de: toISO(new Date(ano, mes, 1)), ate: toISO(new Date(ano, mes + 1, 0)) },
      })
      .then(({ data }) => setDiasBloqueados(new Set(data.dias)))
      .catch(() => setDiasBloqueados(new Set()))
  }, [mesAtual, recarregar])

  // 1. Busca os serviços ao carregar a página
  useEffect(() => {
    const buscarServicos = async () => {
      try {
        const res = await axios.get(`${API}/servicos/`)
        setServicos(res.data) // nenhum serviço vem pré-selecionado
      } catch (error) {
        console.error("Erro ao buscar serviços", error)
      }
    }
    buscarServicos()
  }, [])

  // 2. Busca horários sempre que a data ou o serviço mudarem
  useEffect(() => {
    if (!servicoId || confirmado) return

    const buscarHorarios = async () => {
      setCarregandoHorarios(true)
      setHoraSelecionada(null)
      try {
        const resposta = await axios.get(`${API}/horarios-disponiveis/`, {
          params: { data: toISO(dataSelecionada), servico_id: servicoId }
        })
        setHorarios(resposta.data.horarios_disponiveis)
        setDiaFechado(Boolean(resposta.data.fechado))
        setMotivoFechado(resposta.data.motivo || '')
      } catch (error) {
        setHorarios([])
      } finally {
        setCarregandoHorarios(false)
      }
    }
    buscarHorarios()
  }, [dataSelecionada, servicoId, confirmado, recarregar])

  const mudarMes = (delta) => {
    setMesAtual(new Date(mesAtual.getFullYear(), mesAtual.getMonth() + delta, 1))
  }

  // Pega o serviço selecionado para mostrar o preço no botão
  const servicoSelecionadoObj = servicos.find(s => String(s.id) === String(servicoId))
  const precoAtual = servicoSelecionadoObj ? servicoSelecionadoObj.preco : '0.00'

  // Regra de um agendamento por vez
  const agendamentoAtivo = sessao?.cliente?.agendamento_ativo || null
  // Um agendamento por mês, podendo deixar vários meses marcados (até max_ativos)
  const totalAtivos = sessao?.cliente?.total_ativos ?? (agendamentoAtivo ? 1 : 0)
  const maxAtivos = sessao?.cliente?.max_ativos ?? 1
  const mesesOcupados = sessao?.cliente?.meses_ocupados || [] // ['YYYY-MM']
  const bloqueado = Boolean(agendamentoAtivo) && totalAtivos >= maxAtivos
  const nomesMesesOcupados = mesesOcupados
    .map((m) => isoParaData(`${m}-01`).toLocaleDateString('pt-BR', { month: 'long' }))
    .join(', ')

  // Combo: serviço com mais de uma sessão
  const totalSessoes = servicoSelecionadoObj?.sessoes || 1
  const intervaloDias = servicoSelecionadoObj?.intervalo_dias || 0
  const ehCombo = totalSessoes > 1
  // Identifica a 1ª sessão escolhida; se ela mudar, as escolhas das próximas são descartadas
  const chaveCombo = `${toISO(dataSelecionada)}-${horaSelecionada}-${servicoId}`
  const numerosExtras = Array.from({ length: totalSessoes - 1 }, (_, i) => i + 2)
  const extraValida = (n) => {
    const v = sessoesExtras[n]
    return v && v.chave === chaveCombo ? v : null
  }
  const aoMudarSessao = (numero, valor) => {
    setSessoesExtras((atual) => ({ ...atual, [numero]: { ...valor, chave: chaveCombo } }))
  }

  const confirmarAgendamento = async () => {
    const digitosWhats = whatsapp.replace(/\D/g, '')
    if (!sessao) return setErro('Entre com sua conta Google para confirmar.')
    if (!servicoId) return setErro('Escolha o serviço que você quer fazer.')
    if (!horaSelecionada) return setErro('Escolha um horário para continuar.')
    if (ehCombo) {
      const faltando = numerosExtras.find((n) => !extraValida(n)?.hora)
      if (faltando) return setErro(`Escolha o horário da ${faltando}ª sessão do combo.`)
    }
    if (!nome.trim()) return setErro('Digite seu nome.')
    if (digitosWhats.length !== 11) return setErro('Digite o WhatsApp completo, com DDD.')

    setErro('')
    setEnviando(true)
    try {
      await axios.post(`${API}/agendar/`, {
        data: toISO(dataSelecionada),
        hora: horaSelecionada,
        servico_id: servicoId,
        nome_cliente: nome.trim(),
        whatsapp: digitosWhats,
        sessoes_extras: ehCombo
          ? numerosExtras.map((n) => ({ data: extraValida(n).data, hora: extraValida(n).hora }))
          : []
      }, {
        headers: { Authorization: `Token ${sessao.token}` }
      })

      // Lembra o WhatsApp e o agendamento em andamento (um por vez)
      const [hh, mm] = horaSelecionada.split(':').map(Number)
      const inicio = new Date(dataSelecionada.getFullYear(), dataSelecionada.getMonth(), dataSelecionada.getDate(), hh, mm)
      const atualizada = {
        ...sessao,
        cliente: {
          ...sessao.cliente,
          whatsapp: digitosWhats,
          agendamento_ativo: sessao.cliente.agendamento_ativo ||
            { servico: servicoSelecionadoObj?.nome ?? '', inicio: inicio.toISOString() },
        },
      }
      salvarSessao(atualizada)
      setSessao(atualizada)
      setRecarregar((n) => n + 1) // busca a situação atualizada da conta (meses ocupados etc.)

      setConfirmado({
        nome: nome.trim(),
        servico: servicoSelecionadoObj?.nome ?? '',
        preco: precoAtual,
        data: dataSelecionada,
        hora: horaSelecionada,
        sessoes: [
          { data: dataSelecionada, hora: horaSelecionada },
          ...(ehCombo
            ? numerosExtras.map((n) => ({ data: isoParaData(extraValida(n).data), hora: extraValida(n).hora }))
            : []),
        ],
      })
      window.scrollTo({ top: 0 })
    } catch (error) {
      if (error.response?.status === 429) {
        return setErro('Muitas tentativas seguidas. Aguarde um pouco e tente de novo.')
      }
      if (error.response?.status === 409) setRecarregar((n) => n + 1) // atualiza horários e a conta
      if (error.response?.status === 401) {
        sair()
        return setErro('Sua sessão expirou. Entre com o Google de novo para confirmar.')
      }
      const msgServidor = error.response?.data?.erro || error.response?.data?.detail
      setErro(msgServidor || 'Não foi possível confirmar. Tente outro horário ou tente de novo em instantes.')
    } finally {
      setEnviando(false)
    }
  }

  const verMeusHorarios = () => {
    novoAgendamento()
    setAba('meus')
    window.scrollTo({ top: 0 })
  }

  const novoAgendamento = () => {
    const agora = new Date()
    setConfirmado(null)
    setErro('')
    setNome(sessao?.cliente?.nome || '')
    setWhatsapp(formatarWhatsapp(sessao?.cliente?.whatsapp || ''))
    setHoraSelecionada(null)
    setDataSelecionada(agora)
    setMesAtual(new Date(agora.getFullYear(), agora.getMonth(), 1))
  }

  return (
    <div className="app-container">
      <div className="header">
        <h2>Agendamento - Studio</h2>

        {/* Abas só aparecem depois que a cliente entra com o Google */}
        {sessao && (
          <div className="abas-cliente" role="tablist">
            <button
              role="tab"
              aria-selected={aba === 'agendar'}
              className={aba === 'agendar' ? 'ativa' : ''}
              onClick={() => setAba('agendar')}
            >
              Agendar
            </button>
            <button
              role="tab"
              aria-selected={aba === 'meus'}
              className={aba === 'meus' ? 'ativa' : ''}
              onClick={() => { setConfirmado(null); setAba('meus') }}
            >
              Meus horários
            </button>
          </div>
        )}
      </div>

      <div className="content">
        {sessao && aba === 'meus' ? (
          <MeusHorarios
            sessao={sessao}
            onAgendar={() => setAba('agendar')}
            onSessaoExpirada={sair}
          />
        ) : confirmado ? (
          <ConfirmacaoAgendamento
            dados={confirmado}
            onNovoAgendamento={novoAgendamento}
            onVerMeusHorarios={sessao ? verMeusHorarios : undefined}
          />
        ) : (
          <>
            {/* CALENDÁRIO (componente compartilhado com o painel) */}
            {/* Já tem horário: pode deixar outros meses marcados, um por mês */}
            {mesesOcupados.length > 0 && !bloqueado && (
              <p className="combo-info">
                <strong>Você já tem horário em {nomesMesesOcupados}.</strong>{' '}
                Quer deixar os próximos garantidos? Pode marcar um horário em cada mês.
              </p>
            )}

            <Calendario
              mesAtual={mesAtual}
              onMudarMes={mudarMes}
              dataSelecionada={dataSelecionada}
              onSelecionar={setDataSelecionada}
              diasFechados={DIAS_FECHADOS}
              mesesBloqueados={mesesOcupados}
              diasBloqueados={diasBloqueados}
            />

            {/* SERVIÇO (vem antes dos horários, porque a duração muda os horários livres) */}
            <div className="input-wrapper" style={{ marginBottom: 20 }}>
              <label>Serviço</label>
              <select
                className="select-input" value={servicoId}
                onChange={(e) => { setServicoId(e.target.value); setErro('') }}
              >
                <option value="" disabled>Escolha o serviço</option>
                {servicos.map(srv => (
                  <option key={srv.id} value={srv.id}>{srv.nome}</option>
                ))}
              </select>
            </div>

            {ehCombo && (
              <p className="combo-info">
                <strong>Combo com {totalSessoes} sessões:</strong> escolha o horário da 1ª e
                {totalSessoes > 2 ? ' as próximas já ficam sugeridas' : ' a 2ª já fica sugerida'} a cada {intervaloDias} dias.
              </p>
            )}

            {/* HORÁRIOS */}
            <div className="horarios-grid">
              {!servicoId ? (
                <p style={{ gridColumn: '1/-1', textAlign: 'center', color: '#888' }}>
                  Escolha um serviço para ver os horários livres.
                </p>
              ) : carregandoHorarios ? (
                <p style={{ gridColumn: '1/-1', textAlign: 'center' }}>Buscando...</p>
              ) : horarios.length > 0 ? (
                horarios.map((hora) => (
                  <button
                    key={hora}
                    onClick={() => { setHoraSelecionada(hora); setErro('') }}
                    className={`btn-horario ${horaSelecionada === hora ? 'selecionado' : ''}`}
                  >
                    {hora}
                  </button>
                ))
              ) : (
                <p style={{ gridColumn: '1/-1', textAlign: 'center', color: '#888' }}>
                  {diaFechado
                    ? `O studio não vai atender neste dia${motivoFechado ? ` (${motivoFechado})` : ''}.`
                    : 'Sem horários neste dia.'}
                </p>
              )}
            </div>

            {/* UM AGENDAMENTO POR VEZ: cliente com horário em andamento não marca outro */}
            {bloqueado ? (
              <div className="aviso-ativo">
                <p className="aviso-ativo-titulo">Você já tem {totalAtivos} horários marcados</p>
                <div className="aviso-ativo-horario">
                  <strong>{agendamentoAtivo.servico}</strong>
                  {new Date(agendamentoAtivo.inicio).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })},
                  {' às '}{new Date(agendamentoAtivo.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <p className="aviso-ativo-texto">
                  Esse é o máximo por enquanto. Assim que um deles for concluído, você pode marcar outro por aqui.
                </p>
                <button className="btn-confirmar" onClick={() => setAba('meus')}>VER MEUS HORÁRIOS</button>
              </div>
            ) : (
            <>
            {/* PRÓXIMAS SESSÕES DO COMBO */}
            {ehCombo && horaSelecionada && (
              <>
                <h3 className="combo-titulo">Próximas sessões do combo</h3>
                <p className="combo-texto">
                  A próxima sessão é {intervaloDias} dias depois, no mesmo horário (se cair no domingo, vai para segunda).
                  Se o horário não estiver livre, você pode escolher um dia antes ou um dia depois.
                </p>
                {numerosExtras.map((n) => (
                  <SessaoExtra
                    key={`${n}-${chaveCombo}`}
                    numero={n}
                    dataPrimeira={dataSelecionada}
                    horaPreferida={horaSelecionada}
                    servicoId={servicoId}
                    onChange={aoMudarSessao}
                  />
                ))}
              </>
            )}

            {/* QUEM ESTÁ AGENDANDO */}
            {sessao && (
              <ContaCliente cliente={sessao.cliente} onSair={sair} />
            )}

            {/* FORMULÁRIO COM LABELS NA BORDA */}
            {sessao && (
              <div className="form-group">
                  <div className="input-wrapper">
                    <label>Seu Nome</label>
                    <input
                      type="text" className="text-input" placeholder="Kalita Francielly"
                      value={nome} onChange={(e) => setNome(e.target.value)}
                    />
                  </div>

                  <div className="input-wrapper">
                    <label>WhatsApp</label>
                    <input
                      type="text" className="text-input" placeholder="(00) 00000-0000"
                      inputMode="tel" maxLength={15}
                      value={whatsapp} onChange={(e) => setWhatsapp(formatarWhatsapp(e.target.value))}
                    />
                    <span className="icon-whatsapp"><i className="fab fa-whatsapp"></i></span>
                  </div>
              </div>
            )}

            {erro && <p className="form-erro" role="alert">{erro}</p>}

            {sessao ? (
              <button className="btn-confirmar" onClick={confirmarAgendamento} disabled={enviando}>
                {enviando
                  ? 'CONFIRMANDO…'
                  : !servicoId ? 'CONFIRMAR AGENDAMENTO'
                  : ehCombo ? `CONFIRMAR COMBO (R$ ${precoAtual})`
                  : `CONFIRMAR AGENDAMENTO (R$ ${precoAtual})`}
              </button>
            ) : (
              <ContaCliente
                cliente={null}
                entrando={entrando}
                onEntrar={entrarComGoogle}
                onErro={setErro}
              />
            )}
            </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default App