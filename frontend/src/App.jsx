import { useState, useEffect } from 'react'
import axios from 'axios'
import Calendario, { toISO } from './components/Calendario'
import ConfirmacaoAgendamento from './components/ConfirmacaoAgendamento'
import ContaCliente from './components/ContaCliente'
import MeusHorarios from './components/MeusHorarios'
import { API_URL as API } from './config'
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

function App() {
  const [servicos, setServicos] = useState([])
  const [horarios, setHorarios] = useState([])
  const [carregandoHorarios, setCarregandoHorarios] = useState(false)

  // Controle do Calendário
  const hoje = new Date()
  const [mesAtual, setMesAtual] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const [dataSelecionada, setDataSelecionada] = useState(hoje)

  // Formulário
  const [horaSelecionada, setHoraSelecionada] = useState(null)
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [servicoId, setServicoId] = useState('')

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
  }, [])

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

  const confirmarAgendamento = async () => {
    const digitosWhats = whatsapp.replace(/\D/g, '')
    if (!sessao) return setErro('Entre com sua conta Google para confirmar.')
    if (!servicoId) return setErro('Escolha o serviço que você quer fazer.')
    if (!horaSelecionada) return setErro('Escolha um horário para continuar.')
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
        whatsapp: digitosWhats
      }, {
        headers: { Authorization: `Token ${sessao.token}` }
      })

      // Lembra o WhatsApp para o próximo agendamento
      const atualizada = { ...sessao, cliente: { ...sessao.cliente, whatsapp: digitosWhats } }
      salvarSessao(atualizada)
      setSessao(atualizada)

      setConfirmado({
        nome: nome.trim(),
        servico: servicoSelecionadoObj?.nome ?? '',
        preco: precoAtual,
        data: dataSelecionada,
        hora: horaSelecionada,
      })
      window.scrollTo({ top: 0 })
    } catch (error) {
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
            <Calendario
              mesAtual={mesAtual}
              onMudarMes={mudarMes}
              dataSelecionada={dataSelecionada}
              onSelecionar={setDataSelecionada}
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
                <p style={{ gridColumn: '1/-1', textAlign: 'center', color: '#888' }}>Sem horários neste dia.</p>
              )}
            </div>

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
                  : servicoId ? `CONFIRMAR AGENDAMENTO (R$ ${precoAtual})` : 'CONFIRMAR AGENDAMENTO'}
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
      </div>
    </div>
  )
}

export default App