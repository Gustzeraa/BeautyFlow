import { GoogleLogin, googleLogout } from '@react-oauth/google'
import './ContaCliente.css'

// Sem login: cartão com o botão do Google. Com login: quem está agendando + "Sair".
export default function ContaCliente({ cliente, entrando, onEntrar, onErro, onSair }) {
  if (!cliente) {
    return (
      <div className="login-cliente">
        <p className="login-cliente-titulo">Entre para confirmar seu horário</p>
        <p className="login-cliente-texto">
          É rapidinho: sua conta Google serve só para identificar seus agendamentos.
        </p>
        <div className="login-cliente-botao">
          {entrando ? (
            <p className="login-cliente-texto">Entrando…</p>
          ) : (
            <GoogleLogin
              onSuccess={(resposta) => onEntrar(resposta.credential)}
              onError={() => onErro('Não foi possível entrar com o Google. Tente de novo.')}
              text="continue_with"
              shape="pill"
              locale="pt-BR"
            />
          )}
        </div>
      </div>
    )
  }

  const inicial = cliente.nome?.trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="conta-cliente">
      {cliente.foto ? (
        <img src={cliente.foto} alt="" className="conta-cliente-foto" referrerPolicy="no-referrer" />
      ) : (
        <span className="conta-cliente-foto conta-cliente-inicial">{inicial}</span>
      )}
      <div className="conta-cliente-info">
        <span>Agendando como</span>
        <strong>{cliente.email}</strong>
      </div>
      <button
        className="conta-cliente-sair"
        onClick={() => { googleLogout(); onSair() }}
      >
        Sair
      </button>
    </div>
  )
}