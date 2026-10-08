import { useState } from 'react'
import { login } from './adminApi'
import '../App.css'
import './Admin.css'

export default function AdminLogin({ onEntrar }) {
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setErro('')
    setEntrando(true)
    try {
      await login(usuario.trim(), senha)
      onEntrar()
    } catch (err) {
      if (err.response?.status === 400) setErro('Usuário ou senha incorretos.')
      else setErro(err.message || 'Não foi possível entrar. Verifique se o servidor está rodando.')
    } finally {
      setEntrando(false)
    }
  }

  return (
    <div className="app-container admin">
      <div className="header">
        <h2>Painel do Studio</h2>
        <p className="admin-subtitulo">Entre para ver sua agenda</p>
      </div>

      <form className="content" onSubmit={entrar}>
        <div className="form-group">
          <div className="input-wrapper">
            <label htmlFor="usuario">Usuário</label>
            <input
              id="usuario" className="text-input" autoComplete="username"
              value={usuario} onChange={(e) => setUsuario(e.target.value)} required
            />
          </div>
          <div className="input-wrapper">
            <label htmlFor="senha">Senha</label>
            <input
              id="senha" type="password" className="text-input" autoComplete="current-password"
              value={senha} onChange={(e) => setSenha(e.target.value)} required
            />
          </div>
        </div>

        {erro && <p className="admin-erro" role="alert">{erro}</p>}

        <button className="btn-confirmar" disabled={entrando}>
          {entrando ? 'ENTRANDO…' : 'ENTRAR'}
        </button>
      </form>
    </div>
  )
}