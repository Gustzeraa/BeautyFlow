import { useEffect, useState } from 'react'
import axios from 'axios'
import { toISO } from './Calendario'
import { API_URL, DIAS_FECHADOS } from '../config'

const FOLGA_DIAS = 1 // igual ao FOLGA_COMBO_DIAS do Django

function somarDias(data, dias) {
  const d = new Date(data)
  d.setDate(d.getDate() + dias)
  return d
}

// Se cair num dia fechado (domingo), avança para o próximo dia aberto
function proximoDiaAberto(data) {
  let d = new Date(data)
  while (DIAS_FECHADOS.includes(d.getDay())) d = somarDias(d, 1)
  return d
}

function dataCurta(data) {
  const texto = data.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
  return texto.charAt(0).toUpperCase() + texto.slice(1).replace('.', '')
}

// Escolha do horário de uma sessão seguinte do combo (2ª, 3ª...)
export default function SessaoExtra({ numero, dataSugerida, horaPreferida, servicoId, onChange }) {
  // Opções de data: a data do combo (ou o próximo dia aberto) + a folga para frente
  const opcoes = [proximoDiaAberto(dataSugerida)]
  for (let i = 0; i < FOLGA_DIAS; i++) opcoes.push(proximoDiaAberto(somarDias(opcoes[opcoes.length - 1], 1)))

  const [escolha, setEscolha] = useState(0)
  const [horarios, setHorarios] = useState([])
  const [hora, setHora] = useState(null)
  const [carregando, setCarregando] = useState(true)

  const data = opcoes[escolha]
  const dataISO = toISO(data)

  // Busca os horários livres do dia da sessão
  useEffect(() => {
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
    onChange(numero, { data: dataISO, hora })
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
              <span>{i === 0 ? 'data do combo' : 'dia seguinte'}</span>
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
            {escolha < opcoes.length - 1 ? ' Tente o dia seguinte.' : ' Fale com o studio pelo WhatsApp.'}
          </p>
        )}
      </div>
    </div>
  )
}