// Guarda a sessão da cliente (token + dados básicos) no navegador
const CHAVE = 'beautyflow_cliente'

export function lerSessao() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE))
  } catch {
    return null
  }
}

export function salvarSessao(sessao) {
  localStorage.setItem(CHAVE, JSON.stringify(sessao))
}

export function limparSessao() {
  localStorage.removeItem(CHAVE)
}