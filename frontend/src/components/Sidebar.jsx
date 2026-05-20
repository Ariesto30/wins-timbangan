import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Scale, FileText, BarChart2, Truck, FileSpreadsheet, Users, LogOut, Leaf, ClipboardPaste } from 'lucide-react'
import { getUser, logout, hasRole } from '../utils/auth'

const nav = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard',        roles: ['admin','operator','manajer'] },
  { to: '/input',      icon: Scale,           label: 'Input Timbangan',  roles: ['admin','operator','manajer'] },
  { to: '/bulk-input', icon: ClipboardPaste,  label: 'Input Massal',     roles: ['admin','operator','manajer'] },
  { to: '/data',       icon: FileSpreadsheet, label: 'Data Timbangan',   roles: ['admin','operator','manajer'] },
  { to: '/kontrak',    icon: FileText,        label: 'Kontrak',          roles: ['admin','manajer'] },
  { to: '/laporan',    icon: BarChart2,       label: 'Laporan & Analisa',roles: ['admin','manajer'] },
  { to: '/armada',     icon: Truck,           label: 'Efisiensi Armada', roles: ['admin','manajer'] },
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
      {/* Logo */}
      <div className="px-5 py-5 border-b border-wins-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-primary-600 rounded-lg flex items-center justify-center">
            <Leaf size={20} className="text-white" />
          </div>
          <div>
            <div className="font-bold text-sm text-white">WINS Timbangan</div>
            <div className="text-xs text-slate-500">PT Wins Sawit</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.filter(n => hasRole(...n.roles)).map(n => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-600/20 text-primary-400 border border-primary-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-wins-border'
              }`
            }
          >
            <n.icon size={17} />
            {n.label}
          </NavLink>
        ))}
      </nav>

      {/* User info */}
      <div className="px-4 py-4 border-t border-wins-border">
        <div className="mb-3">
          <div className="text-sm font-medium text-white truncate">{user?.nama || user?.username}</div>
          <div className="text-xs text-slate-500 capitalize">{user?.role}</div>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-2 text-xs text-slate-400 hover:text-red-400 transition-colors w-full">
          <LogOut size={14} />
          Keluar
        </button>
      </div>
    </aside>
  )
}
