import { useEffect, useState } from 'react'
import adminApi, { hora, mensagemErro } from './adminApi'
import { toISO } from '../components/Calendario'

function isoParaData(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d)
}

function dataCurta(iso) {
  return isoParaData(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
    .replace('.', '')
}

function periodo(b) {
  if (b.data_inicio === b.data_fim) return dataCurta(b.data_inicio)
  return `${dataCurta(b.data_inicio)} até ${dataCurta(b.data_fim)}`
}

const hhmm = (t) => (t ? t.slice(0, 5) : '')

// Como o bloqueio aparece para a dona
export function textoHorario(b) {
  if (!b.hora_inicio && !b.hora_fim) return 'Dia inteiro'
  if (b.hora_inicio && !b.hora_fim) return `Atende só até ${hhmm(b.hora_inicio)}`
  if (!b.hora_inicio && b.hora_fim) return `Atende só a partir de ${hhmm(b.hora_fim)}`
  return `Sem atendimento das ${hhmm(b.hora_inicio)} às ${hhmm(b.hora_fim)}`
}

const TIPOS = [
  { id: 'inteiro', rotulo: 'Dia inteiro' },
  { id: 'ate', rotulo: 'Atender só até um horário' },
  { id: 'apartir', rotulo: 'Atender só a partir de um horário' },
  { id: 'intervalo', rotulo: 'Bloquear um intervalo do dia' },
]

// Folgas, feriados e férias: a dona bloqueia dias em que não vai atender
export default function FolgasAdmin() {
  const hoje = toISO(new Date())
  const [bloqueios, setBloqueios] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [inicio, setInicio] = useState(hoje)
  const [fim, setFim] = useState(hoje)
  const [motivo, setMotivo] = useState('')
  const [tipo, setTipo] = useState('inteiro')
  const [horaA, setHoraA] = useState('14:00')
  const [horaB, setHoraB] = useState('16:00')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [conflitos, setConflitos] = useState(null) // agendamentos que já existiam no período

  useEffect(() => {
    adminApi
      .get('/admin/bloqueios/')
      .then(({ data }) => setBloqueios(data))
      .catch(() => setErro('Não foi possível carregar as folgas. Tente de novo em instantes.'))
      .finally(() => setCarregando(false))
  }, [])

  async function bloquear(e) {
    e.preventDefault()
    if (!inicio) return setErro('Escolha o dia.')
    if (tipo === 'intervalo' && horaB <= horaA) return setErro('O horário final precisa ser depois do inicial.')
    const horas = {
      inteiro: { hora_inicio: null, hora_fim: null },
      ate: { hora_inicio: horaA, hora_fim: null },          // bloqueia de horaA até o fim do dia
      apartir: { hora_inicio: null, hora_fim: horaA },      // bloqueia do começo até horaA
      intervalo: { hora_inicio: horaA, hora_fim: horaB },
    }[tipo]
    setErro('')
    setConflitos(null)
    setSalvando(true)
    try {
      const { data } = await adminApi.post('/admin/bloqueios/', {
        data_inicio: inicio,
        data_fim: fim || inicio,
        motivo: motivo.trim(),
        ...horas,
      })
      const { agendamentos_no_periodo: marcados, ...novo } = data
      setBloqueios((lista) => [...lista, novo].sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)))
      setConflitos(marcados?.length ? marcados : null)
      setMotivo('')
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível bloquear. Confira as datas.'))
    } finally {
      setSalvando(false)
    }
  }

  async function desbloquear(b) {
    if (!window.confirm(`Liberar ${periodo(b)} para agendamentos de novo?`)) return
    setErro('')
    try {
      await adminApi.delete(`/admin/bloqueios/${b.id}/`)
      setBloqueios((lista) => lista.filter((x) => x.id !== b.id))
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível desbloquear.'))
    }
  }

  return (
    <section>
      <form className="admin-form-folga" onSubmit={bloquear}>
        <h3>Bloquear dias</h3>
        <p className="folga-texto">Feriado, férias, curso... Nesses dias as clientes não conseguem marcar.</p>

        <div className="form-group">
          <div className="folga-datas">
            <div className="input-wrapper">
              <label htmlFor="folga-inicio">De</label>
              <input
                id="folga-inicio" type="date" className="text-input" min={hoje}
                value={inicio}
                onChange={(e) => {
                  setInicio(e.target.value)
                  if (!fim || fim < e.target.value) setFim(e.target.value)
                }}
              />
            </div>
            <div className="input-wrapper">
              <label htmlFor="folga-fim">Até</label>
              <input
                id="folga-fim" type="date" className="text-input" min={inicio || hoje}
                value={fim} onChange={(e) => setFim(e.target.value)}
              />
            </div>
          </div>
          <div className="input-wrapper">
            <label htmlFor="folga-tipo">Tipo de bloqueio</label>
            <select
              id="folga-tipo" className="select-input"
              value={tipo} onChange={(e) => setTipo(e.target.value)}
            >
              {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
            </select>
          </div>
          {tipo !== 'inteiro' && (
            <div className="folga-datas">
              <div className="input-wrapper">
                <label htmlFor="folga-hora-a">
                  {tipo === 'ate' ? 'Atende até' : tipo === 'apartir' ? 'Atende a partir de' : 'Das'}
                </label>
                <input
                  id="folga-hora-a" type="time" step="1800" className="text-input"
                  value={horaA} onChange={(e) => setHoraA(e.target.value)}
                />
              </div>
              {tipo === 'intervalo' && (
                <div className="input-wrapper">
                  <label htmlFor="folga-hora-b">Até</label>
                  <input
                    id="folga-hora-b" type="time" step="1800" className="text-input"
                    value={horaB} onChange={(e) => setHoraB(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}
          <div className="input-wrapper">
            <label htmlFor="folga-motivo">Motivo (opcional)</label>
            <input
              id="folga-motivo" className="text-input" placeholder="Feriado, férias..." maxLength={100}
              value={motivo} onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </div>

        {erro && <p className="admin-erro" role="alert">{erro}</p>}

        <button className="btn-confirmar" disabled={salvando}>
          {salvando ? 'BLOQUEANDO…' : tipo !== 'inteiro' ? 'BLOQUEAR HORÁRIO' : inicio === fim ? 'BLOQUEAR DIA' : 'BLOQUEAR PERÍODO'}
        </button>
      </form>

      {conflitos && (
        <div className="folga-conflitos" role="alert">
          <strong>Atenção: já tinha cliente marcada nesses dias.</strong>
          <ul>
            {conflitos.map((a) => (
              <li key={a.id}>
                {a.nome_cliente}: {dataCurta(toISO(new Date(a.data_hora_inicio)))} às {hora(a.data_hora_inicio)}
              </li>
            ))}
          </ul>
          <span>Esses horários continuam marcados. Avise as clientes e cancele ou remarque pela Agenda.</span>
        </div>
      )}

      <h3 className="folgas-titulo">Próximas folgas</h3>
      {carregando ? (
        <p className="admin-carregando">Carregando…</p>
      ) : bloqueios.length === 0 ? (
        <p className="admin-vazio">Nenhum dia bloqueado. Domingos já ficam fechados automaticamente.</p>
      ) : (
        <ul className="servicos-lista">
          {bloqueios.map((b) => (
            <li key={b.id} className="servico-item">
              <div className="servico-info">
                <strong>{periodo(b)}</strong>
                <span className="folga-motivo">
                  {textoHorario(b)}{b.motivo ? ` (${b.motivo})` : ''}
                </span>
              </div>
              <button className="btn-texto-curto" onClick={() => desbloquear(b)}>Desbloquear</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}