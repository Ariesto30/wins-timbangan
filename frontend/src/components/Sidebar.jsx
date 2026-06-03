import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Scale, FileText, BarChart2, Truck, FileSpreadsheet, Users, LogOut, Leaf, ClipboardPaste, Shield, Factory } from 'lucide-react'
import { getUser, logout, hasRole } from '../utils/auth'

const nav = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard',        roles: ['admin','operator','manajer'] },
  { to: '/input',      icon: Scale,           label: 'Input Timbangan',  roles: ['admin','operator','manajer'] },
  { to: '/bulk-input', icon: ClipboardPaste,  label: 'Input Massal',     roles: ['admin','operator','manajer'] },
  { to: '/data',       icon: FileSpreadsheet, label: 'Data Timbangan',   roles: ['admin','operator','manajer'] },
  { to: '/kontrak',    icon: FileText,        label: 'Kontrak',          roles: ['admin','manajer'] },
  { to: '/laporan',    icon: BarChart2,       label: 'Laporan & Analisa',roles: ['admin','manajer'] },
  { to: '/armada',     icon: Truck,           label: 'Efisiensi Armada', roles: ['admin','manajer'] },
  { to: '/audit',      icon: Shield,          label: 'Audit Forensik',   roles: ['admin','manajer'] },
  { to: '/refinery',   icon: Factory,         label: 'Refinery Balance', roles: ['admin','manajer'] },
  { to: '/pengguna',   icon: Users,           label: 'Pengguna',         roles: ['admin'] },
]

export default function Sidebar() {
  const navigate = useNavigate()
  const user = getUser()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <aside className="w-60 min-h-screen bg-wins-card border-r border-wins-border flex flex-col flex-shrink-0">
      {/* Header — title singkat, warna senada sidebar */}
      <div className="px-4 py-5 border-b border-wins-border">
        <div className="text-sm font-extrabold text-white tracking-wider">WINS TIMBANGAN</div>
        <div className="text-[10px] font-semibold tracking-widest text-orange-400">PT. WIJAYA INTI NUSANTARA SAWIT</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.filter(n => hasRole(...n.roles)).map(n => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'text-white shadow-lg shadow-orange-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-wins-border'
              }`
            }
            style={({ isActive }) => isActive ? { background: 'linear-gradient(135deg, #fb923c, #f59e0b)' } : {}}
          >
            <n.icon size={17} />
            {n.label}
          </NavLink>
        ))}
      </nav>

      {/* Sunset + Truck Illustration */}
      <div className="mx-3 mb-3 rounded-xl overflow-hidden">
        <img src="/sidebar-illust.svg" alt="" className="w-full h-auto block" />
      </div>

      {/* User info */}
      <div className="px-4 py-3 border-t border-wins-border bg-wins-dark/50">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {(user?.nama || user?.username || 'A')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-white truncate">{user?.nama || user?.username}</div>
            <div className="text-[10px] text-slate-500 capitalize">{user?.role}</div>
          </div>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-2 text-xs text-slate-400 hover:text-red-400 transition-colors w-full mt-1">
          <LogOut size={13} />
          Keluar
        </button>
      </div>
    </aside>
  )
}
