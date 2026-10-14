import { useEffect, useState } from 'react'
import axios from 'axios'
import { API_URL, WHATSAPP_STUDIO } from '../config'
import './MeusHorarios.css'

const moeda = (valor) =>
  Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const hora = (iso) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

function diaPorExtenso(iso) {
  const texto = new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function linkRemarcar(ag, nomeCliente) {
  const d = new Date(ag.inicio)
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const semana = d.toLocaleDateString('pt-BR', { weekday: 'long' })
  const primeiroNome = (nomeCliente || '').trim().split(' ')[0]
  const texto =
    `Oi! Sou ${primeiroNome}, tenho horário de ${ag.servico} ` +
    `dia ${data} (${semana}) às ${hora(ag.inicio)} e preciso remarcar.`
  return `https://wa.me/${WHATSAPP_STUDIO}?text=${encodeURIComponent(texto)}`
}

export default function MeusHorarios({ sessao, onAgendar, onSessaoExpirada }) {
  const [agendamentos, setAgendamentos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    axios
      .get(`${API_URL}/meus-agendamentos/`, { headers: { Authorization: `Token ${sessao.token}` } })
      .then(({ data }) => setAgendamentos(data))
      .catch((error) => {
        if (error.response?.status === 401) onSessaoExpirada()
        else setErro('Não foi possível carregar seus horários. Tente de novo em instantes.')
      })
      .finally(() => setCarregando(false))
  }, [sessao.token])

  if (carregando) return <p className="meus-aviso">Carregando seus horários…</p>
  if (erro) return <p className="form-erro" role="alert">{erro}</p>

  const agora = new Date()
  const proximos = agendamentos
    .filter((a) => new Date(a.inicio) > agora)
    .sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
  const anteriores = agendamentos
    .filter((a) => new Date(a.inicio) <= agora)
    .sort((a, b) => new Date(b.inicio) - new Date(a.inicio))

  return (
    <section className="meus-horarios">
      <h3 className="meus-titulo">Próximos horários</h3>

      {proximos.length === 0 ? (
        <div className="meus-vazio">
          <p>Você não tem nenhum horário marcado.</p>
          <button className="btn-confirmar" onClick={onAgendar}>AGENDAR UM HORÁRIO</button>
        </div>
      ) : (
        <ul className="meus-lista">
          {proximos.map((a) => {
            const d = new Date(a.inicio)
            return (
              <li key={a.id} className="meus-card">
                <div className="meus-data" aria-hidden="true">
                  <strong>{d.getDate()}</strong>
                  <span>{d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')}</span>
                </div>
                <div className="meus-info">
                  <strong>{a.servico}</strong>
                  {a.total_sessoes > 1 && (
                    <span className="selo-combo">Combo, sessão {a.sessao_numero} de {a.total_sessoes}</span>
                  )}
                  <span>{diaPorExtenso(a.inicio)}</span>
                  <span>
                    {hora(a.inicio)}{a.fim && ` às ${hora(a.fim)}`}
                    {(a.total_sessoes <= 1 || a.sessao_numero === 1) && (
                      <span className="meus-preco"> · {moeda(a.preco)}</span>
                    )}
                  </span>
                  <a
                    className="meus-remarcar"
                    href={linkRemarcar(a, sessao.cliente?.nome)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <i className="fab fa-whatsapp" /> Preciso remarcar
                  </a>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {anteriores.length > 0 && (
        <>
          <h3 className="meus-titulo meus-titulo-historico">Histórico</h3>
          <ul className="meus-historico">
            {anteriores.map((a) => (
              <li key={a.id}>
                <span>{a.servico}</span>
                <span>{new Date(a.inicio).toLocaleDateString('pt-BR')}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}