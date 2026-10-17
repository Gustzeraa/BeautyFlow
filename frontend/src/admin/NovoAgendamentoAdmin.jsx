import { useEffect, useState } from 'react'
import adminApi, { mensagemErro, moeda } from './adminApi'
import { toISO } from '../components/Calendario'
import SessaoExtra from '../components/SessaoExtra'
import '../components/SessaoExtra.css'

function formatarWhatsapp(valor) {
  const d = valor.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function somarDias(data, dias) {
  const d = new Date(data)
  d.setDate(d.getDate() + dias)
  return d
}

function dataPorExtenso(data) {
  const texto = data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

// Folha para a dona marcar um horário para uma cliente que não usa o app
export default function NovoAgendamentoAdmin({ data, onFechar, onCriado }) {
  const [servicos, setServicos] = useState([])
  const [servicoId, setServicoId] = useState('')
  const [horarios, setHorarios] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [fechado, setFechado] = useState(false)
  const [hora, setHora] = useState(null)
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [extras, setExtras] = useState({})
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const dataISO = toISO(data)
  const servico = servicos.find((s) => String(s.id) === String(servicoId))
  const totalSessoes = servico?.sessoes || 1
  const ehCombo = totalSessoes > 1
  const numerosExtras = Array.from({ length: totalSessoes - 1 }, (_, i) => i + 2)
  const chaveCombo = `${dataISO}-${hora}-${servicoId}`
  const extraValida = (n) => (extras[n]?.chave === chaveCombo ? extras[n] : null)

  useEffect(() => {
    adminApi.get('/admin/servicos/').then(({ data: lista }) => setServicos(lista)).catch(() => {})
  }, [])

  // Horários livres do dia para o serviço escolhido
  useEffect(() => {
    if (!servicoId) return
    let cancelado = false
    setCarregando(true)
    setHora(null)
    adminApi
      .get('/horarios-disponiveis/', { params: { data: dataISO, servico_id: servicoId } })
      .then(({ data: resp }) => {
        if (cancelado) return
        setHorarios(resp.horarios_disponiveis)
        setFechado(Boolean(resp.fechado))
      })
      .catch(() => !cancelado && setHorarios([]))
      .finally(() => !cancelado && setCarregando(false))
    return () => { cancelado = true }
  }, [servicoId, dataISO])

  // Fecha com Esc
  useEffect(() => {
    const aoTeclar = (e) => e.key === 'Escape' && !salvando && onFechar()
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [salvando])

  async function salvar() {
    if (!nome.trim()) return setErro('Digite o nome da cliente.')
    if (!servicoId) return setErro('Escolha o serviço.')
    if (!hora) return setErro('Escolha o horário.')
    const digitos = whatsapp.replace(/\D/g, '')
    if (digitos && digitos.length < 10) return setErro('WhatsApp incompleto. Se ela não tiver, deixe em branco.')
    if (ehCombo) {
      const faltando = numerosExtras.find((n) => !extraValida(n)?.hora)
      if (faltando) return setErro(`Escolha o horário da ${faltando}ª sessão do combo.`)
    }

    setErro('')
    setSalvando(true)
    try {
      await adminApi.post('/admin/agendar/', {
        data: dataISO,
        hora,
        servico_id: servicoId,
        nome_cliente: nome.trim(),
        whatsapp: digitos,
        sessoes_extras: ehCombo
          ? numerosExtras.map((n) => ({ data: extraValida(n).data, hora: extraValida(n).hora }))
          : [],
      })
      onCriado(nome.trim())
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível marcar. Tente de novo.'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="sheet-fundo" onClick={() => !salvando && onFechar()}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="novo-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="novo-titulo">Marcar horário</h3>
        <p className="novo-dia">{dataPorExtenso(data)}</p>

        <div className="form-group">
          <div className="input-wrapper">
            <label htmlFor="novo-nome">Nome da cliente</label>
            <input
              id="novo-nome" className="text-input" placeholder="Dona Maria"
              value={nome} onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="input-wrapper">
            <label htmlFor="novo-whats">WhatsApp (opcional)</label>
            <input
              id="novo-whats" className="text-input" placeholder="(00) 00000-0000"
              inputMode="tel" maxLength={15}
              value={whatsapp} onChange={(e) => setWhatsapp(formatarWhatsapp(e.target.value))}
            />
          </div>
          <div className="input-wrapper">
            <label htmlFor="novo-servico">Serviço</label>
            <select
              id="novo-servico" className="select-input"
              value={servicoId} onChange={(e) => setServicoId(e.target.value)}
            >
              <option value="" disabled>Escolha o serviço</option>
              {servicos.map((s) => (
                <option key={s.id} value={s.id}>{s.nome} ({moeda(s.preco)})</option>
              ))}
            </select>
          </div>
        </div>

        {servicoId && (
          <div className="horarios-grid">
            {carregando ? (
              <p style={{ gridColumn: '1/-1', textAlign: 'center' }}>Buscando...</p>
            ) : horarios.length > 0 ? (
              horarios.map((h) => (
                <button
                  key={h}
                  onClick={() => setHora(h)}
                  className={`btn-horario ${hora === h ? 'selecionado' : ''}`}
                >
                  {h}
                </button>
              ))
            ) : (
              <p style={{ gridColumn: '1/-1', textAlign: 'center', color: '#888' }}>
                {fechado ? 'O studio não abre neste dia.' : 'Sem horários livres neste dia.'}
              </p>
            )}
          </div>
        )}

        {ehCombo && hora && (
          <>
            <h3 className="combo-titulo">Próximas sessões do combo</h3>
            {numerosExtras.map((n) => (
              <SessaoExtra
                key={`${n}-${chaveCombo}`}
                numero={n}
                dataPrimeira={data}
                horaPreferida={hora}
                servicoId={servicoId}
                onChange={(numero, valor) =>
                  setExtras((atual) => ({ ...atual, [numero]: { ...valor, chave: chaveCombo } }))
                }
              />
            ))}
          </>
        )}

        {erro && <p className="admin-erro" role="alert">{erro}</p>}

        <button className="btn-confirmar" onClick={salvar} disabled={salvando}>
          {salvando ? 'MARCANDO…' : 'MARCAR HORÁRIO'}
        </button>
        <button className="btn-texto" onClick={onFechar} disabled={salvando}>Cancelar</button>
      </div>
    </div>
  )
}