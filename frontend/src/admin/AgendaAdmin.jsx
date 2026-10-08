import { useEffect, useMemo, useState } from 'react'
import Calendario, { toISO } from '../components/Calendario'
import adminApi, { hora, mensagemErro, moeda } from './adminApi'

function tituloDoDia(data) {
  const iso = toISO(data)
  const amanha = new Date()
  amanha.setDate(amanha.getDate() + 1)
  const texto = data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  if (iso === toISO(new Date())) return `Hoje, ${texto}`
  if (iso === toISO(amanha)) return `Amanhã, ${texto}`
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function linkWhatsApp(numero) {
  let digitos = String(numero).replace(/\D/g, '')
  if (digitos.length <= 11) digitos = `55${digitos}`
  return `https://wa.me/${digitos}`
}

export default function AgendaAdmin() {
  const hoje = new Date()
  const [mesAtual, setMesAtual] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1))
  const [dataSelecionada, setDataSelecionada] = useState(
    new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  )
  const [agendamentos, setAgendamentos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [paraCancelar, setParaCancelar] = useState(null) // agendamento aberto na folha de cancelamento
  const [cancelando, setCancelando] = useState(false)
  const [erroCancelar, setErroCancelar] = useState('')
  const [aviso, setAviso] = useState('')

  // Busca o mês inteiro de uma vez: serve para os pontinhos e para a lista do dia
  useEffect(() => {
    let cancelado = false
    const ano = mesAtual.getFullYear()
    const mes = mesAtual.getMonth()

    setCarregando(true)
    setErro('')
    adminApi
      .get('/admin/agendamentos/', {
        params: { de: toISO(new Date(ano, mes, 1)), ate: toISO(new Date(ano, mes + 1, 0)) },
      })
      .then(({ data }) => !cancelado && setAgendamentos(data))
      .catch(() => !cancelado && setErro('Não foi possível carregar a agenda. Tente de novo em instantes.'))
      .finally(() => !cancelado && setCarregando(false))

    return () => { cancelado = true }
  }, [mesAtual])

  const diasMarcados = useMemo(
    () => new Set(agendamentos.map((a) => toISO(new Date(a.data_hora_inicio)))),
    [agendamentos]
  )

  const doDia = agendamentos.filter(
    (a) => toISO(new Date(a.data_hora_inicio)) === toISO(dataSelecionada)
  )
  const total = doDia.reduce((soma, a) => soma + Number(a.servico_preco), 0)

  // Fecha a folha com Esc
  useEffect(() => {
    if (!paraCancelar) return
    const aoTeclar = (e) => e.key === 'Escape' && !cancelando && setParaCancelar(null)
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [paraCancelar, cancelando])

  function abrirCancelamento(a) {
    setErroCancelar('')
    setAviso('')
    setParaCancelar(a)
  }

  async function confirmarCancelamento() {
    setCancelando(true)
    setErroCancelar('')
    try {
      await adminApi.delete(`/admin/agendamentos/${paraCancelar.id}/`)
      setAgendamentos((lista) => lista.filter((x) => x.id !== paraCancelar.id))
      setAviso(`Agendamento de ${paraCancelar.nome_cliente} cancelado. O horário já está livre de novo.`)
      setParaCancelar(null)
    } catch (err) {
      setErroCancelar(mensagemErro(err, 'Não foi possível cancelar. Tente de novo em instantes.'))
    } finally {
      setCancelando(false)
    }
  }

  function mudarMes(delta) {
    setMesAtual(new Date(mesAtual.getFullYear(), mesAtual.getMonth() + delta, 1))
  }

  return (
    <section>
      <Calendario
        mesAtual={mesAtual}
        onMudarMes={mudarMes}
        dataSelecionada={dataSelecionada}
        onSelecionar={(d) => { setDataSelecionada(d); setAviso('') }}
        bloquearPassado={false}
        diasMarcados={diasMarcados}
      />

      <h3 className="agenda-dia-titulo">{tituloDoDia(dataSelecionada)}</h3>

      {aviso && <p className="admin-sucesso" role="status">{aviso}</p>}

      {carregando ? (
        <p className="admin-carregando">Carregando agenda…</p>
      ) : erro ? (
        <p className="admin-erro" role="alert">{erro}</p>
      ) : doDia.length === 0 ? (
        <p className="admin-vazio">
          Nenhum horário marcado neste dia. Os dias com atendimento aparecem com um ponto no calendário.
        </p>
      ) : (
        <>
          <p className="agenda-resumo">
            {doDia.length} {doDia.length === 1 ? 'atendimento' : 'atendimentos'}, {moeda(total)} previstos
          </p>
          <ul className="agenda-lista">
            {doDia.map((a) => (
              <li key={a.id} className="agenda-item">
                <div className="agenda-hora">
                  <strong>{hora(a.data_hora_inicio)}</strong>
                  {a.data_hora_fim && <span>até {hora(a.data_hora_fim)}</span>}
                </div>
                <div className="agenda-info">
                  <strong>{a.nome_cliente}</strong>
                  <span>{a.servico_nome}</span>
                  <span className="agenda-preco">{moeda(a.servico_preco)}</span>
                </div>
                <div className="agenda-acoes">
                  <a
                    className="agenda-whats"
                    href={linkWhatsApp(a.whatsapp)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Chamar ${a.nome_cliente} no WhatsApp`}
                  >
                    <i className="fab fa-whatsapp" />
                  </a>
                  {new Date(a.data_hora_inicio) > new Date() && (
                    <button
                      className="agenda-cancelar"
                      onClick={() => abrirCancelamento(a)}
                      aria-label={`Cancelar agendamento de ${a.nome_cliente}`}
                    >
                      <i className="fas fa-times" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {paraCancelar && (
        <div className="sheet-fundo" onClick={() => !cancelando && setParaCancelar(null)}>
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancelar-titulo"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="cancelar-titulo">Cancelar agendamento?</h3>

            <dl className="cancelar-resumo">
              <div><dt>Cliente</dt><dd>{paraCancelar.nome_cliente}</dd></div>
              <div><dt>Serviço</dt><dd>{paraCancelar.servico_nome}</dd></div>
              <div><dt>Quando</dt><dd>{tituloDoDia(new Date(paraCancelar.data_hora_inicio))}, {hora(paraCancelar.data_hora_inicio)}</dd></div>
            </dl>

            <p className="cancelar-aviso">
              O horário volta a ficar livre para outras clientes. Isso não pode ser desfeito.
            </p>

            {erroCancelar && <p className="admin-erro" role="alert">{erroCancelar}</p>}

            <button className="btn-perigo" onClick={confirmarCancelamento} disabled={cancelando}>
              {cancelando ? 'CANCELANDO…' : 'SIM, CANCELAR AGENDAMENTO'}
            </button>
            <button className="btn-texto" onClick={() => setParaCancelar(null)} disabled={cancelando}>
              Voltar
            </button>
          </div>
        </div>
      )}
    </section>
  )
}