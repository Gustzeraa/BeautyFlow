import axios from 'axios'

export const API_URL = 'http://127.0.0.1:8000/api'
const TOKEN_KEY = 'studio_admin_token'

const adminApi = axios.create({ baseURL: API_URL })

adminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Token ${token}`
  return config
})

adminApi.interceptors.response.use(
  (resposta) => resposta,
  (erro) => {
    if (erro.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      window.dispatchEvent(new Event('admin-logout'))
    }
    return Promise.reject(erro)
  }
)

export const estaLogado = () => Boolean(localStorage.getItem(TOKEN_KEY))

export async function login(usuario, senha) {
  const { data } = await axios.post(`${API_URL}/admin/login/`, { username: usuario, password: senha })
  localStorage.setItem(TOKEN_KEY, data.token)
  try {
    await adminApi.get('/admin/servicos/') // confere se é usuário da equipe (is_staff)
  } catch (erro) {
    localStorage.removeItem(TOKEN_KEY)
    if (erro.response?.status === 403) throw new Error('Este usuário não tem acesso ao painel.')
    throw erro
  }
}

export const logout = () => localStorage.removeItem(TOKEN_KEY)

export function mensagemErro(erro, padrao) {
  const d = erro?.response?.data
  if (!d) return padrao
  if (typeof d.detail === 'string') return d.detail
  const primeiro = Object.values(d)[0]
  return Array.isArray(primeiro) ? primeiro[0] : padrao
}

export const moeda = (valor) =>
  Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function duracaoTexto(minutos) {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  if (!h) return `${m} min`
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

export const hora = (iso) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export default adminApi