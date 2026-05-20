import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('wins_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('wins_token')
      localStorage.removeItem('wins_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api

export const fmt = {
  kg: (v) => v == null ? '—' : Number(v).toLocaleString('id-ID') + ' kg',
  ton: (v) => v == null ? '—' : (Number(v) / 1000).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ton',
  tonRaw: (v) => v == null ? '—' : (Number(v) / 1000).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  rp: (v) => v == null ? '—' : 'Rp ' + Number(v).toLocaleString('id-ID'),
  pct: (v) => v == null ? '—' : (Number(v) * 100).toFixed(1) + '%',
  tgl: (v) => v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
  num: (v) => v == null ? '—' : Number(v).toLocaleString('id-ID'),
}
