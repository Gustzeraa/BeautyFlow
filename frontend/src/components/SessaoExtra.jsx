import { useEffect, useState } from 'react'
import axios from 'axios'
import { toISO } from './Calendario'
import { API_URL } from '../config'

function isoParaData(iso) {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(a, m - 1, d)
}

function dataCurta(data) {
  const texto = data.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
  return texto.charAt(0).toUpperCase() + texto.slice(1).replace('.', '')
}

// Escolha do horário de uma sessão seguinte do combo (2ª, 3ª...)
export default function SessaoExtra({ numero, dataPrimeira, horaPreferida, servicoId, onChange }) {
  // Datas possíveis vêm do Django: já consideram domingo, expediente e folgas da dona
  const [opcoes, setOpcoes] = useState([])
  const [indiceBase, setIndiceBase] = useState(0)
  const [escolha, setEscolha] = useState(0)
  const [horarios, setHorarios] = useState([])
  const [hora, setHora] = useState(null)
  const [carregando, setCarregando] = useState(true)

  const primeiraISO = toISO(dataPrimeira)
  useEffect(() => {
    let cancelado = false
    axios
      .get(`${API_URL}/datas-combo/`, { params: { data: primeiraISO, servico_id: servicoId, sessao: numero } })
      .then(({ data: resp }) => {
        if (cancelado) return
        const lista = resp.datas.map(isoParaData)
        const base = Math.max(resp.datas.indexOf(resp.sugerida), 0)
        setOpcoes(lista)
        setIndiceBase(base)
        setEscolha(base)
      })
      .catch(() => !cancelado && setOpcoes([]))
    return () => { cancelado = true }
  }, [primeiraISO, servicoId, numero])

  const data = opcoes[escolha] || null
  const dataISO = data ? toISO(data) : null

  // Busca os horários livres do dia da sessão
  useEffect(() => {
    if (!dataISO) return
    let cancelado = false
    setCarregando(true)
    axios
      .get(`${API_URL}/horarios-disponiveis/`, { params: { data: dataISO, servico_id: servicoId } })
      .then(({ data: resp }) => {
        if (cancelado) return
        const lista = resp.horarios_disponiveis
        setHorarios(lista)
        // Sugere o mesmo horário da 1ª sessão, se estiver livre
        setHora((atual) => (lista.includes(atual) ? atual : lista.includes(horaPreferida) ? horaPreferida : null))
      })
      .catch(() => !cancelado && setHorarios([]))
      .finally(() => !cancelado && setCarregando(false))
    return () => { cancelado = true }
  }, [dataISO, servicoId, horaPreferida])

  // Avisa o App sempre que a data ou o horário mudarem
  useEffect(() => {
    if (dataISO) onChange(numero, { data: dataISO, hora })
  }, [dataISO, hora])

  return (
    <div className="sessao-extra">
      <div className="sessao-extra-topo">
        <span className="sessao-badge">{numero}ª sessão</span>
      </div>

      {opcoes.length > 1 && (
        <div className="sessao-extra-dias" role="radiogroup" aria-label={`Dia da ${numero}ª sessão`}>
          {opcoes.map((op, i) => (
            <button
              key={toISO(op)}
              role="radio"
              aria-checked={escolha === i}
              className={escolha === i ? 'ativo' : ''}
              onClick={() => setEscolha(i)}
            >
              <strong>{dataCurta(op)}</strong>
              <span>{i === indiceBase ? 'data do combo' : i < indiceBase ? 'antes' : 'depois'}</span>
            </button>
          ))}
        </div>
      )}

      <div className="horarios-grid sessao-extra-horarios">
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
            Sem horários livres neste dia.
            {' Tente outro dos dias acima.'}
          </p>
        )}
      </div>
    </div>
  )
}