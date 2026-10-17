import { useEffect, useMemo, useState } from 'react'
import Calendario, { toISO } from '../components/Calendario'
import adminApi, { hora, mensagemErro, moeda } from './adminApi'
import '../components/SessaoExtra.css'
import NovoAgendamentoAdmin from './NovoAgendamentoAdmin'
import { textoHorario } from './FolgasAdmin'
import { DIAS_FECHADOS } from '../config'

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
  const [novoAberto, setNovoAberto] = useState(false)
  const [recarregar, setRecarregar] = useState(0)
  const [bloqueios, setBloqueios] = useState([]) // folgas que tocam o mês

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

    adminApi
      .get('/admin/bloqueios/', {
        params: { de: toISO(new Date(ano, mes, 1)), ate: toISO(new Date(ano, mes + 1, 0)) },
      })
      .then(({ data }) => !cancelado && setBloqueios(data))
      .catch(() => !cancelado && setBloqueios([]))

    return () => { cancelado = true }
  }, [mesAtual, recarregar])

  // Expande os períodos de folga em dias 'YYYY-MM-DD'
  const diasBloqueados = useMemo(() => {
    const dias = new Set()
    bloqueios.filter((b) => !b.hora_inicio && !b.hora_fim).forEach((b) => {
      const [a1, m1, d1] = b.data_inicio.split('-').map(Number)
      const [a2, m2, d2] = b.data_fim.split('-').map(Number)
      const dia = new Date(a1, m1 - 1, d1)
      const fim = new Date(a2, m2 - 1, d2)
      while (dia <= fim) { dias.add(toISO(dia)); dia.setDate(dia.getDate() + 1) }
    })
    return dias
  }, [bloqueios])
  const bloqueiosDoDia = bloqueios.filter(
    (b) => b.data_inicio <= toISO(dataSelecionada) && b.data_fim >= toISO(dataSelecionada)
  )
  // Folga de dia inteiro (o dia fecha) x bloqueio parcial (só alguns horários somem)
  const folgaDoDia = bloqueiosDoDia.find((b) => !b.hora_inicio && !b.hora_fim)
  const parciaisDoDia = bloqueiosDoDia.filter((b) => b.hora_inicio || b.hora_fim)

  const diasMarcados = useMemo(
    () => new Set(agendamentos.map((a) => toISO(new Date(a.data_hora_inicio)))),
    [agendamentos]
  )

  const doDia = agendamentos.filter(
    (a) => toISO(new Date(a.data_hora_inicio)) === toISO(dataSelecionada)
  )
  // No combo, conta só a parte do valor de cada sessão
  const total = doDia.reduce((soma, a) => soma + Number(a.valor_sessao ?? a.servico_preco), 0)

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
      const { data } = await adminApi.delete(`/admin/agendamentos/${paraCancelar.id}/`)
      const cancelados = data?.cancelados ?? [paraCancelar.id]
      setAgendamentos((lista) => lista.filter((x) => !cancelados.includes(x.id)))
      setAviso(
        cancelados.length > 1
          ? `Combo de ${paraCancelar.nome_cliente} cancelado (${cancelados.length} sessões). Os horários já estão livres de novo.`
          : `Agendamento de ${paraCancelar.nome_cliente} cancelado. O horário já está livre de novo.`
      )
      setParaCancelar(null)
    } catch (err) {
      setErroCancelar(mensagemErro(err, 'Não foi possível cancelar. Tente de novo em instantes.'))
    } finally {
      setCancelando(false)
    }
  }

  // Só dá para marcar em dia aberto, de hoje em diante
  const podeMarcar =
    toISO(dataSelecionada) >= toISO(new Date()) &&
    !DIAS_FECHADOS.includes(dataSelecionada.getDay()) &&
    !folgaDoDia

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
        diasBloqueados={diasBloqueados}
        travarDiasBloqueados={false}
      />

      <div className="agenda-dia-topo">
        <h3 className="agenda-dia-titulo">{tituloDoDia(dataSelecionada)}</h3>
        {podeMarcar && (
          <button className="btn-marcar" onClick={() => { setAviso(''); setNovoAberto(true) }}>
            <i className="fas fa-plus" /> Marcar
          </button>
        )}
      </div>

      {folgaDoDia && (
        <p className="folga-aviso">
          <i className="fas fa-ban" /> Dia bloqueado{folgaDoDia.motivo ? `: ${folgaDoDia.motivo}` : ''}. As clientes não conseguem marcar.
        </p>
      )}

      {!folgaDoDia && parciaisDoDia.map((b) => (
        <p key={b.id} className="folga-aviso">
          <i className="far fa-clock" /> {textoHorario(b)}{b.motivo ? ` (${b.motivo})` : ''}.
        </p>
      ))}

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
                  {a.total_sessoes > 1 && (
                    <span className="selo-combo">Combo, sessão {a.sessao_numero} de {a.total_sessoes}</span>
                  )}
                  <span className="agenda-preco">
                    {moeda(a.servico_preco)}{a.total_sessoes > 1 && ' (combo)'}
                  </span>
                </div>
                <div className="agenda-acoes">
                  {a.whatsapp && (
                  <a
                    className="agenda-whats"
                    href={linkWhatsApp(a.whatsapp)}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Chamar ${a.nome_cliente} no WhatsApp`}
                  >
                    <i className="fab fa-whatsapp" />
                  </a>
                  )}
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

      {novoAberto && (
        <NovoAgendamentoAdmin
          data={dataSelecionada}
          onFechar={() => setNovoAberto(false)}
          onCriado={(nome) => {
            setNovoAberto(false)
            setAviso(`Horário de ${nome} marcado.`)
            setRecarregar((n) => n + 1)
          }}
        />
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
            <h3 id="cancelar-titulo">
              {paraCancelar.total_sessoes > 1 ? 'Cancelar combo?' : 'Cancelar agendamento?'}
            </h3>

            <dl className="cancelar-resumo">
              <div><dt>Cliente</dt><dd>{paraCancelar.nome_cliente}</dd></div>
              <div><dt>Serviço</dt><dd>{paraCancelar.servico_nome}</dd></div>
              {paraCancelar.sessoes_combo?.length > 1 ? (
                paraCancelar.sessoes_combo.map((sessao) => {
                  const jaFoi = new Date(sessao.data_hora_inicio) <= new Date()
                  return (
                    <div key={sessao.id} className={jaFoi ? 'cancelar-sessao-feita' : ''}>
                      <dt>{sessao.sessao_numero}ª sessão</dt>
                      <dd>
                        {tituloDoDia(new Date(sessao.data_hora_inicio))}, {hora(sessao.data_hora_inicio)}
                        {jaFoi && <small> (já realizada)</small>}
                      </dd>
                    </div>
                  )
                })
              ) : (
                <div><dt>Quando</dt><dd>{tituloDoDia(new Date(paraCancelar.data_hora_inicio))}, {hora(paraCancelar.data_hora_inicio)}</dd></div>
              )}
            </dl>

            <p className="cancelar-aviso">
              {paraCancelar.total_sessoes > 1
                ? 'Todas as sessões que ainda não aconteceram serão canceladas e os horários voltam a ficar livres. Isso não pode ser desfeito.'
                : 'O horário volta a ficar livre para outras clientes. Isso não pode ser desfeito.'}
            </p>

            {erroCancelar && <p className="admin-erro" role="alert">{erroCancelar}</p>}

            <button className="btn-perigo" onClick={confirmarCancelamento} disabled={cancelando}>
              {cancelando
                ? 'CANCELANDO…'
                : paraCancelar.total_sessoes > 1 ? 'SIM, CANCELAR COMBO' : 'SIM, CANCELAR AGENDAMENTO'}
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