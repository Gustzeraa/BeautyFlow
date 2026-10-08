// Calendário compartilhado entre a tela da cliente e o painel
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
  'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function toISO(data) {
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${data.getFullYear()}-${mes}-${dia}`
}

export default function Calendario({
  mesAtual,
  onMudarMes,
  dataSelecionada,
  onSelecionar,
  bloquearPassado = true,
  diasMarcados, // Set de 'YYYY-MM-DD' que ganham um pontinho
}) {
  const ano = mesAtual.getFullYear()
  const mes = mesAtual.getMonth()
  const hojeISO = toISO(new Date())
  const selecionadoISO = dataSelecionada ? toISO(dataSelecionada) : null
  const diasNoMes = new Date(ano, mes + 1, 0).getDate()
  const primeiroDiaDaSemana = new Date(ano, mes, 1).getDay()

  const dias = []
  for (let i = 0; i < primeiroDiaDaSemana; i++) {
    dias.push(<div key={`vazio-${i}`} className="day-btn disabled" />)
  }

  for (let dia = 1; dia <= diasNoMes; dia++) {
    const data = new Date(ano, mes, dia)
    const iso = toISO(data)
    const passado = bloquearPassado && iso < hojeISO
    const selecionado = iso === selecionadoISO
    const hoje = iso === hojeISO
    const marcado = diasMarcados?.has(iso)

    dias.push(
      <button
        key={dia}
        disabled={passado}
        onClick={() => onSelecionar(data)}
        aria-pressed={selecionado}
        className={[
          'day-btn',
          passado && 'disabled',
          selecionado && 'selected',
          hoje && !selecionado && 'today',
          marcado && 'has-event',
        ].filter(Boolean).join(' ')}
      >
        {dia}
      </button>
    )
  }

  return (
    <div className="calendar-wrapper">
      <div className="calendar-header">
        <button onClick={() => onMudarMes(-1)} aria-label="Mês anterior">{'<'}</button>
        <span>{MESES[mes]} {ano}</span>
        <button onClick={() => onMudarMes(1)} aria-label="Próximo mês">{'>'}</button>
      </div>
      <div className="calendar-grid">
        {SEMANA.map((d) => <div key={d} className="weekday">{d}</div>)}
        {dias}
      </div>
    </div>
  )
}