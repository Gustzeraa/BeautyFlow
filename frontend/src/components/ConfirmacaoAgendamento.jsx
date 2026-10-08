import './ConfirmacaoAgendamento.css'

const moeda = (valor) =>
  Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function dataPorExtenso(data) {
  const texto = data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export default function ConfirmacaoAgendamento({ dados, onNovoAgendamento }) {
  const primeiroNome = dados.nome.trim().split(' ')[0]

  return (
    <div className="confirmacao">
      <div className="confirmacao-check" aria-hidden="true">
        <svg viewBox="0 0 52 52">
          <circle cx="26" cy="26" r="24" />
          <path d="M15 27 l7 7 l15 -15" />
        </svg>
      </div>

      <h3 className="confirmacao-titulo">Horário reservado!</h3>
      <p className="confirmacao-texto">
        Tudo certo, {primeiroNome}. Te esperamos no studio.
      </p>

      <dl className="confirmacao-resumo">
        <div>
          <dt>Serviço</dt>
          <dd>{dados.servico}</dd>
        </div>
        <div>
          <dt>Data</dt>
          <dd>{dataPorExtenso(dados.data)}</dd>
        </div>
        <div>
          <dt>Horário</dt>
          <dd>{dados.hora}</dd>
        </div>
        <div className="confirmacao-total">
          <dt>Valor</dt>
          <dd>{moeda(dados.preco)}</dd>
        </div>
      </dl>

      <p className="confirmacao-aviso">
        <i className="fab fa-whatsapp" /> Se precisar remarcar, é só chamar o studio no WhatsApp.
      </p>

      <button className="btn-confirmar" onClick={onNovoAgendamento}>
        FAZER OUTRO AGENDAMENTO
      </button>
    </div>
  )
}