// Endereço da API (troque pelo da Railway quando subir para produção)
export const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'

// WhatsApp do studio: só números, com 55 + DDD. Ex.: 5562999998888
export const WHATSAPP_STUDIO = '5562996234864'

// Dias em que o studio não abre (0 = domingo ... 6 = sábado).
// Precisa bater com o EXPEDIENTE do views.py no Django.
export const DIAS_FECHADOS = [0]