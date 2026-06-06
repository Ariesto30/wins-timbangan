import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Scale, FileText, BarChart2, Truck, FileSpreadsheet, Users, LogOut, Leaf, ClipboardPaste, Shield, Factory, Database, FlaskConical, Wallet, Pin, PinOff, PanelLeftClose, ChevronRight, TrendingUp, Sunrise, Brain, Upload, Gauge } from 'lucide-react'
import { getUser, logout, hasRole } from '../utils/auth'

const nav = [
  { section: 'Dashboard' },
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard Utama',  roles: ['admin','operator','manajer'] },
  { to: '/insight',    icon: Brain,           label: 'Insight Center',   roles: ['admin','manajer'] },
  { to: '/briefing',   icon: Sunrise,         label: 'Daily Briefing',   roles: ['admin','manajer'] },
  { section: 'Tank Farm' },
  { to: '/tank',       icon: Database,        label: 'Tank Inventory',   roles: ['admin','manajer'] },
  { to: '/quality',    icon: FlaskConical,    label: 'Quality Log',      roles: ['admin','manajer'] },
  { section: 'Refinery' },
  { to: '/produksi',   icon: Gauge,           label: 'Produksi Refinery',roles: ['admin','manajer'] },
  { to: '/refinery',   icon: Factory,         label: 'Refinery Balance', roles: ['admin','manajer'] },
  { section: 'Timbangan' },
  { to: '/input',      icon: Scale,           label: 'Input Timbangan',  roles: ['admin','operator','manajer'] },
  { to: '/bulk-input', icon: ClipboardPaste,  label: 'Input Massal',     roles: ['admin','operator','manajer'] },
  { to: '/data',       icon: FileSpreadsheet, label: 'Data Timbangan',   roles: ['admin','operator','manajer'] },
  { section: 'Kontrak' },
  { to: '/kontrak',    icon: FileText,        label: 'Kontrak',          roles: ['admin','manajer'] },
  { section: 'Analisa' },
  { to: '/laporan',    icon: BarChart2,       label: 'Laporan & Analisa',roles: ['admin','manajer'] },
  { to: '/armada',     icon: Truck,           label: 'Efisiensi Armada', roles: ['admin','manajer'] },
  { to: '/harga',      icon: TrendingUp,      label: 'Harga Pasar',      roles: ['admin','manajer'] },
  { section: 'Keuangan' },
  { to: '/payment',    icon: Wallet,          label: 'Payment & Aging',  roles: ['admin','manajer'] },
  { section: 'Audit' },
  { to: '/audit',      icon: Shield,          label: 'Audit Forensik',   roles: ['admin','manajer'] },
  { section: 'Sistem' },
  { to: '/import',     icon: Upload,          label: 'Import Data',      roles: ['admin','manajer'] },
  { to: '/pengguna',   icon: Users,           label: 'Pengguna',         roles: ['admin'] },
]

export default function Sidebar({ onClose, onNavigate }) {
  const navigate = useNavigate()
  const user = getUser()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <aside className="w-60 h-full border-r border-wins-border flex flex-col flex-shrink-0" style={{ background: 'linear-gradient(180deg,#07152A 0%,#0F172A 100%)' }}>
      {/* Header — logo perusahaan di panel putih */}
      <div className="px-3 py-3 border-b border-wins-border flex items-center justify-between gap-2">
        <div className="flex-1 bg-white rounded-xl px-3 py-2 flex items-center justify-center shadow-sm">
          <img src="/Logo Baru.png" alt="PT. Wijaya Inti Nusantara Sawit" className="h-10 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {onClose && (
            <button onClick={onClose} title="Sembunyikan sidebar (Ctrl+B)"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-wins-hover transition-colors">
              <PanelLeftClose size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map((n, i) => {
          if (n.section) return <div key={`s${i}`} className={`px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 ${i === 0 ? 'pt-1' : 'pt-3 mt-2 border-t border-white/5'}`}>{n.section}</div>
          if (!hasRole(...n.roles)) return null
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'text-white shadow-lg shadow-orange-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-wins-hover'
                }`
              }
              style={({ isActive }) => isActive ? { background: 'linear-gradient(135deg, #fb923c, #f59e0b)' } : {}}
            >
              <n.icon size={17} />
              {n.label}
            </NavLink>
          )
        })}
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

/* Mini-rail ikon-only (mode collapsed ala VSCode activity bar) */
export function MiniRail({ onExpand, onNavigate }) {
  const navigate = useNavigate()
  const user = getUser()
  const items = nav.filter(n => n.section || hasRole(...n.roles))
  return (
    <aside className="w-[60px] h-full bg-wins-card border-r border-wins-border flex flex-col items-center py-3">
      {/* Logo / expand */}
      <button onClick={onExpand} title="Perluas sidebar" className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-white font-extrabold flex-shrink-0" style={{ background: 'linear-gradient(135deg,#fb923c,#f59e0b)' }}>
        W
      </button>
      <div className="w-7 border-t border-wins-border mb-2" />

      {/* Nav ikon + tooltip */}
      <nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto w-full px-2 no-scrollbar">
        {items.map((n, i) => {
          if (n.section) return <div key={`s${i}`} className="w-5 border-t border-wins-border/60 my-1.5" />
          const Icon = n.icon
          return (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} onClick={onNavigate} title={n.label}
              className={({ isActive }) => `group relative w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${isActive ? 'text-white shadow-lg shadow-orange-500/20' : 'text-slate-400 hover:text-white hover:bg-wins-hover'}`}
              style={({ isActive }) => isActive ? { background: 'linear-gradient(135deg,#fb923c,#f59e0b)' } : {}}>
              <Icon size={18} />
              {/* Tooltip */}
              <span className="pointer-events-none absolute left-12 px-2 py-1 rounded-md bg-slate-900 text-white text-xs whitespace-nowrap opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all z-50 shadow-lg">
                {n.label}
              </span>
            </NavLink>
          )
        })}
      </nav>

      {/* Avatar + logout */}
      <div className="w-7 border-t border-wins-border my-2" />
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white font-bold text-xs flex-shrink-0 mb-2" title={user?.nama || user?.username}>
        {(user?.nama || user?.username || 'A')[0].toUpperCase()}
      </div>
      <button onClick={() => { logout(); navigate('/login') }} title="Keluar" className="group relative w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-wins-hover transition-colors flex-shrink-0">
        <LogOut size={15} />
        <span className="pointer-events-none absolute left-11 px-2 py-1 rounded-md bg-slate-900 text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50">Keluar</span>
      </button>
    </aside>
  )
}
