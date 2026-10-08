import { useState, useEffect } from 'react'
import axios from 'axios'
import Calendario, { toISO } from './components/Calendario'
import ConfirmacaoAgendamento from './components/ConfirmacaoAgendamento'
import './App.css'

// Formata enquanto digita: (62) 99999-9999 ou (62) 3333-4444 (fixo)
function formatarWhatsapp(valor) {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// Se o dia escolhido for hoje, tira os horários que já passaram
function removerHorariosPassados(lista, data) {
  const agora = new Date()
  if (toISO(data) !== toISO(agora)) return lista
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes()
  return lista.filter((h) => {
    const [hh, mm] = h.split(':').map(Number)
    return hh * 60 + mm > minutosAgora
  })
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

  // Envio e confirmação
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [confirmado, setConfirmado] = useState(null) // dados do agendamento feito

  // 1. Busca os serviços ao carregar a página
  useEffect(() => {
    const buscarServicos = async () => {
      try {
        const res = await axios.get('http://127.0.0.1:8000/api/servicos/')
        setServicos(res.data)
        if (res.data.length > 0) setServicoId(res.data[0].id)
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
        const resposta = await axios.get(`http://127.0.0.1:8000/api/horarios-disponiveis/`, {
          params: { data: toISO(dataSelecionada), servico_id: servicoId }
        })
        setHorarios(removerHorariosPassados(resposta.data.horarios_disponiveis, dataSelecionada))
      } catch (error) {
        setHorarios([])
      } finally {
        setCarregandoHorarios(false)
      }
    }
    buscarHorarios()
  }, [dataSelecionada, servicoId, confirmado])

  const mudarMes = (delta) => {
    setMesAtual(new Date(mesAtual.getFullYear(), mesAtual.getMonth() + delta, 1))
  }

  // Pega o serviço selecionado para mostrar o preço no botão
  const servicoSelecionadoObj = servicos.find(s => String(s.id) === String(servicoId))
  const precoAtual = servicoSelecionadoObj ? servicoSelecionadoObj.preco : '0.00'

  const confirmarAgendamento = async () => {
    const digitosWhats = whatsapp.replace(/\D/g, '')
    if (!horaSelecionada) return setErro('Escolha um horário para continuar.')
    if (!nome.trim()) return setErro('Digite seu nome.')
    if (digitosWhats.length !== 11) return setErro('Digite o WhatsApp completo, com DDD.')

    setErro('')
    setEnviando(true)
    try {
      await axios.post('http://127.0.0.1:8000/api/agendar/', {
        data: toISO(dataSelecionada),
        hora: horaSelecionada,
        servico_id: servicoId,
        nome_cliente: nome.trim(),
        whatsapp: digitosWhats
      })

      setConfirmado({
        nome: nome.trim(),
        servico: servicoSelecionadoObj?.nome ?? '',
        preco: precoAtual,
        data: dataSelecionada,
        hora: horaSelecionada,
      })
      window.scrollTo({ top: 0 })
    } catch (error) {
      const msgServidor = error.response?.data?.erro || error.response?.data?.detail
      setErro(msgServidor || 'Não foi possível confirmar. Tente outro horário ou tente de novo em instantes.')
    } finally {
      setEnviando(false)
    }
  }

  const novoAgendamento = () => {
    const agora = new Date()
    setConfirmado(null)
    setNome('')
    setWhatsapp('')
    setHoraSelecionada(null)
    setDataSelecionada(agora)
    setMesAtual(new Date(agora.getFullYear(), agora.getMonth(), 1))
  }

  return (
    <div className="app-container">
      <div className="header">
        <h2>Agendamento - Studio</h2>
      </div>

      <div className="content">
        {confirmado ? (
          <ConfirmacaoAgendamento dados={confirmado} onNovoAgendamento={novoAgendamento} />
        ) : (
          <>
            {/* CALENDÁRIO (componente compartilhado com o painel) */}
            <Calendario
              mesAtual={mesAtual}
              onMudarMes={mudarMes}
              dataSelecionada={dataSelecionada}
              onSelecionar={setDataSelecionada}
            />

            {/* HORÁRIOS */}
            <div className="horarios-grid">
              {carregandoHorarios ? (
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

            {/* FORMULÁRIO COM LABELS NA BORDA */}
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

              <div className="input-wrapper">
                <label>Serviço</label>
                <select
                  className="select-input" value={servicoId}
                  onChange={(e) => setServicoId(e.target.value)}
                >
                  {servicos.map(srv => (
                    <option key={srv.id} value={srv.id}>{srv.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            {erro && <p className="form-erro" role="alert">{erro}</p>}

            <button className="btn-confirmar" onClick={confirmarAgendamento} disabled={enviando}>
              {enviando ? 'CONFIRMANDO…' : `CONFIRMAR AGENDAMENTO (R$ ${precoAtual})`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default App