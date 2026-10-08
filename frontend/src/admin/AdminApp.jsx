import { useEffect, useState } from 'react'
import { estaLogado, logout } from './adminApi'
import AdminLogin from './AdminLogin'
import AgendaAdmin from './AgendaAdmin'
import ServicosAdmin from './ServicosAdmin'
import '../App.css'
import './Admin.css'

export default function AdminApp() {
  const [logado, setLogado] = useState(estaLogado())
  const [aba, setAba] = useState('agenda')

  useEffect(() => {
    const sair = () => setLogado(false)
    window.addEventListener('admin-logout', sair)
    return () => window.removeEventListener('admin-logout', sair)
  }, [])

  if (!logado) return <AdminLogin onEntrar={() => setLogado(true)} />

  return (
    <div className="app-container admin">
      <div className="header">
        <button className="admin-sair" onClick={() => { logout(); setLogado(false) }}>
          Sair
        </button>
        <h2>Painel do Studio</h2>
        <p className="admin-subtitulo">Sua agenda e seus serviços</p>

        <div className="admin-abas" role="tablist">
          <button
            role="tab"
            aria-selected={aba === 'agenda'}
            className={aba === 'agenda' ? 'ativa' : ''}
            onClick={() => setAba('agenda')}
          >
            Agenda
          </button>
          <button
            role="tab"
            aria-selected={aba === 'servicos'}
            className={aba === 'servicos' ? 'ativa' : ''}
            onClick={() => setAba('servicos')}
          >
            Serviços
          </button>
        </div>
      </div>

      <div className="content">
        {aba === 'agenda' ? <AgendaAdmin /> : <ServicosAdmin />}
      </div>
    </div>
  )
}