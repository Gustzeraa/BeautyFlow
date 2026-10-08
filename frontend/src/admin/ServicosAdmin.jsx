import { useEffect, useState } from 'react'
import adminApi, { duracaoTexto, mensagemErro, moeda } from './adminApi'

const VAZIO = { id: null, nome: '', preco: '', duracao: 60 }
const DURACOES = Array.from({ length: 24 }, (_, i) => (i + 1) * 15) // 15 min até 6h

// Aceita "45", "45,90", "1.250,00" ou "45.90"
function lerPreco(texto) {
  const t = String(texto).trim()
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
}

export default function ServicosAdmin() {
  const [servicos, setServicos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [form, setForm] = useState(null) // null = folha fechada
  const [erroForm, setErroForm] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    adminApi
      .get('/admin/servicos/')
      .then(({ data }) => setServicos(data))
      .catch(() => setErro('Não foi possível carregar os serviços. Tente de novo em instantes.'))
      .finally(() => setCarregando(false))
  }, [])

  // Fecha a folha com Esc
  useEffect(() => {
    if (!form) return
    const aoTeclar = (e) => e.key === 'Escape' && fechar()
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [form])

  function abrirNovo() {
    setErroForm('')
    setForm(VAZIO)
  }

  function abrirEdicao(s) {
    setErroForm('')
    setForm({ id: s.id, nome: s.nome, preco: String(s.preco).replace('.', ','), duracao: s.duracao_minutos })
  }

  function fechar() {
    setForm(null)
    setErroForm('')
  }

  async function salvar(e) {
    e.preventDefault()
    const preco = lerPreco(form.preco)
    if (!form.nome.trim()) return setErroForm('Informe o nome do serviço.')
    if (!(preco > 0)) return setErroForm('Informe um preço válido, por exemplo 45,00.')

    const payload = { nome: form.nome.trim(), preco: preco.toFixed(2), duracao_minutos: Number(form.duracao) }
    setSalvando(true)
    setErroForm('')
    try {
      if (form.id) {
        const { data } = await adminApi.patch(`/admin/servicos/${form.id}/`, payload)
        setServicos((l) => l.map((s) => (s.id === data.id ? data : s)))
      } else {
        const { data } = await adminApi.post('/admin/servicos/', payload)
        setServicos((l) => [...l, data].sort((a, b) => a.nome.localeCompare(b.nome)))
      }
      fechar()
    } catch (err) {
      setErroForm(mensagemErro(err, 'Não foi possível salvar o serviço.'))
    } finally {
      setSalvando(false)
    }
  }

  async function excluir(s) {
    if (!window.confirm(`Excluir "${s.nome}"? As clientes deixam de ver esse serviço na hora.`)) return
    setErro('')
    try {
      await adminApi.delete(`/admin/servicos/${s.id}/`)
      setServicos((l) => l.filter((x) => x.id !== s.id))
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível excluir o serviço.'))
    }
  }

  const opcoesDuracao = form && !DURACOES.includes(Number(form.duracao))
    ? [...DURACOES, Number(form.duracao)].sort((a, b) => a - b)
    : DURACOES

  return (
    <section>
      <div className="servicos-topo">
        <h3>Seus serviços</h3>
        <button className="btn-novo" onClick={abrirNovo}>
          <i className="fas fa-plus" /> Novo serviço
        </button>
      </div>

      {erro && <p className="admin-erro" role="alert">{erro}</p>}
      {carregando && <p className="admin-carregando">Carregando serviços…</p>}
      {!carregando && servicos.length === 0 && (
        <p className="admin-vazio">
          Nenhum serviço cadastrado ainda. Toque em "Novo serviço" para criar o primeiro.
        </p>
      )}

      <ul className="servicos-lista">
        {servicos.map((s) => (
          <li key={s.id} className="servico-item">
            <div className="servico-info">
              <strong>{s.nome}</strong>
              <div className="servico-detalhes">
                <span className="servico-preco">{moeda(s.preco)}</span>
                <span><i className="far fa-clock" /> {duracaoTexto(s.duracao_minutos)}</span>
              </div>
            </div>
            <button className="btn-icone" onClick={() => abrirEdicao(s)} aria-label={`Editar ${s.nome}`}>
              <i className="fas fa-pen" />
            </button>
            <button className="btn-icone perigo" onClick={() => excluir(s)} aria-label={`Excluir ${s.nome}`}>
              <i className="fas fa-trash" />
            </button>
          </li>
        ))}
      </ul>

      {form && (
        <div className="sheet-fundo" onClick={fechar}>
          <form
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sheet-titulo"
            onClick={(e) => e.stopPropagation()}
            onSubmit={salvar}
          >
            <h3 id="sheet-titulo">{form.id ? 'Editar serviço' : 'Novo serviço'}</h3>

            <div className="form-group">
              <div className="input-wrapper">
                <label htmlFor="srv-nome">Nome do serviço</label>
                <input
                  id="srv-nome" className="text-input" placeholder="Alongamento em gel" autoFocus
                  value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>
              <div className="input-wrapper">
                <label htmlFor="srv-preco">Preço (R$)</label>
                <input
                  id="srv-preco" className="text-input" inputMode="decimal" placeholder="120,00"
                  value={form.preco} onChange={(e) => setForm({ ...form, preco: e.target.value })}
                />
              </div>
              <div className="input-wrapper">
                <label htmlFor="srv-duracao">Duração</label>
                <select
                  id="srv-duracao" className="select-input"
                  value={form.duracao} onChange={(e) => setForm({ ...form, duracao: e.target.value })}
                >
                  {opcoesDuracao.map((min) => (
                    <option key={min} value={min}>{duracaoTexto(min)}</option>
                  ))}
                </select>
              </div>
            </div>

            {erroForm && <p className="admin-erro" role="alert">{erroForm}</p>}

            <button className="btn-confirmar" disabled={salvando}>
              {salvando ? 'SALVANDO…' : 'SALVAR SERVIÇO'}
            </button>
            <button type="button" className="btn-texto" onClick={fechar}>Cancelar</button>
          </form>
        </div>
      )}
    </section>
  )
}