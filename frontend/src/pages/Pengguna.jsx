import { useEffect, useState } from 'react'
import { Plus, X, UserPlus } from 'lucide-react'
import api from '../utils/api'

const ROLES = ['admin', 'manajer', 'operator']
const ROLE_LABEL = { admin: 'Administrator', manajer: 'Manajer', operator: 'Operator Timbangan' }
const ROLE_COLOR = { admin: 'badge-danger', manajer: 'badge-warning', operator: 'badge-info' }

export default function Pengguna() {
  const [users, setUsers] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', nama_lengkap: '', role: 'operator' })
  const [error, setError] = useState('')

  function load() { api.get('/auth/users').then(r => setUsers(r.data)) }
  useEffect(() => { load() }, [])

  async function save() {
    setError('')
    try {
      await api.post('/auth/users', form)
      setShowModal(false)
      setForm({ username: '', password: '', nama_lengkap: '', role: 'operator' })
      load()
    } catch (e) {
      setError(e.response?.data?.error || 'Gagal membuat user')
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Manajemen Pengguna</h1>
          <p className="text-sm text-slate-500">{users.length} pengguna terdaftar</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <UserPlus size={16} /> Tambah Pengguna
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-wins-border">
              <th className="table-header">Nama</th>
              <th className="table-header">Username</th>
              <th className="table-header">Role</th>
              <th className="table-header">Status</th>
              <th className="table-header">Dibuat</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-wins-border/50">
                <td className="table-cell font-medium text-white">{u.nama_lengkap || u.username}</td>
                <td className="table-cell text-slate-400 font-mono text-sm">{u.username}</td>
                <td className="table-cell"><span className={ROLE_COLOR[u.role]}>{ROLE_LABEL[u.role]}</span></td>
                <td className="table-cell"><span className={u.aktif ? 'badge-success' : 'badge-neutral'}>{u.aktif ? 'Aktif' : 'Nonaktif'}</span></td>
                <td className="table-cell text-xs text-slate-500">{u.created_at?.split('T')[0] || u.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card bg-wins-dark/50">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Hak Akses per Role</h3>
        <div className="space-y-2 text-xs text-slate-400">
          <div><strong className="text-red-400">Admin</strong> — Akses penuh: input, edit, hapus, kontrak, laporan, kelola pengguna</div>
          <div><strong className="text-yellow-400">Manajer</strong> — Input, edit, lihat semua laporan & kontrak (tidak bisa hapus & kelola pengguna)</div>
          <div><strong className="text-blue-400">Operator</strong> — Input dan edit data milik sendiri saja, tidak bisa hapus atau akses kontrak</div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-wins-card border border-wins-border rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-wins-border">
              <h2 className="font-semibold text-white">Tambah Pengguna Baru</h2>
              <button onClick={() => setShowModal(false)}><X size={18} className="text-slate-400 hover:text-white" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <p className="text-red-400 text-sm bg-red-900/20 px-3 py-2 rounded-lg">{error}</p>}
              <div><label className="label">Nama Lengkap</label><input className="input" value={form.nama_lengkap} onChange={e => setForm(f => ({ ...f, nama_lengkap: e.target.value }))} /></div>
              <div><label className="label">Username *</label><input className="input" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} /></div>
              <div><label className="label">Password *</label><input type="password" className="input" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
              <div><label className="label">Role</label>
                <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={save} className="btn-primary flex-1 py-2.5">Buat Pengguna</button>
                <button onClick={() => setShowModal(false)} className="btn-secondary flex-1 py-2.5">Batal</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
