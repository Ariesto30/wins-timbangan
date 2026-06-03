import { useState, useEffect, useRef, useCallback } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { isLoggedIn } from './utils/auth'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import InputTimbangan from './pages/InputTimbangan'
import BulkInput from './pages/BulkInput'
import DataTimbangan from './pages/DataTimbangan'
import Kontrak from './pages/Kontrak'
import Laporan from './pages/Laporan'
import Armada from './pages/Armada'
import AuditForensik from './pages/AuditForensik'
import RefineryReconciliation from './pages/RefineryReconciliation'
import TankInventory from './pages/TankInventory'
import QualityLog from './pages/QualityLog'
import PaymentAging from './pages/PaymentAging'
import Pengguna from './pages/Pengguna'

function PrivateRoute({ children }) {
  return isLoggedIn() ? children : <Navigate to="/login" replace />
}

const HIDE_DELAY = 2500   // ms sebelum auto-hide setelah cursor keluar
const REVEAL_ZONE = 18    // px dari tepi kiri untuk trigger

function Layout({ children }) {
  // Pin tersimpan di localStorage
  const [pinned, setPinned] = useState(() => localStorage.getItem('wins_sidebar_pinned') === '1')
  const [revealed, setRevealed] = useState(false)   // hover-reveal (desktop)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches)
  const hideTimer = useRef(null)

  // Deteksi mobile responsif
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const onChange = e => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const clearHide = useCallback(() => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null } }, [])
  const scheduleHide = useCallback(() => {
    clearHide()
    hideTimer.current = setTimeout(() => setRevealed(false), HIDE_DELAY)
  }, [clearHide])

  // Trigger zone tepi kiri (desktop, hanya saat tidak pinned)
  useEffect(() => {
    if (isMobile || pinned) return
    const onMove = e => { if (e.clientX <= REVEAL_ZONE) { clearHide(); setRevealed(true) } }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [isMobile, pinned, clearHide])

  // Ctrl/Cmd + B → toggle (pin di desktop, drawer di mobile)
  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        if (isMobile) setMobileOpen(o => !o)
        else togglePin()
      }
      if (e.key === 'Escape') { setMobileOpen(false); setRevealed(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMobile])

  function togglePin() {
    setPinned(p => { const np = !p; localStorage.setItem('wins_sidebar_pinned', np ? '1' : '0'); if (np) setRevealed(false); return np })
  }

  const desktopVisible = pinned || revealed
  const pushed = pinned && !isMobile   // hanya pin yang menggeser konten (overlay tidak)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Trigger rail (desktop, unpinned) — petunjuk hover halus */}
      {!isMobile && !pinned && (
        <div className="fixed left-0 top-0 h-screen z-40" style={{ width: REVEAL_ZONE }}
          onMouseEnter={() => { clearHide(); setRevealed(true) }}>
          <div className={`h-full w-1 bg-gradient-to-b from-orange-400/40 to-sky-500/40 transition-opacity ${revealed ? 'opacity-0' : 'opacity-100'}`} />
        </div>
      )}

      {/* Tombol hamburger (mobile) */}
      {isMobile && (
        <button onClick={() => setMobileOpen(true)} className="fixed top-3 left-3 z-40 p-2 rounded-xl bg-white shadow-md ring-1 ring-gray-200 text-gray-700">
          <Menu size={20} />
        </button>
      )}

      {/* Backdrop (mobile drawer) */}
      {isMobile && mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar — fixed overlay, transform animated */}
      <div
        className="fixed left-0 top-0 h-screen z-50 transition-transform duration-300 ease-[cubic-bezier(.22,.61,.36,1)]"
        style={{
          transform: (isMobile ? mobileOpen : desktopVisible) ? 'translateX(0)' : 'translateX(-100%)',
          boxShadow: (isMobile ? mobileOpen : (revealed && !pinned)) ? '0 24px 50px -12px rgba(2,6,23,.45)' : 'none',
        }}
        onMouseEnter={() => !isMobile && clearHide()}
        onMouseLeave={() => { if (!isMobile && !pinned) scheduleHide() }}
      >
        <div className="relative h-full">
          {isMobile && (
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-3 z-10 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-wins-border">
              <X size={16} />
            </button>
          )}
          <Sidebar pinned={pinned} onTogglePin={isMobile ? undefined : togglePin} onNavigate={() => setMobileOpen(false)} />
        </div>
      </div>

      {/* Konten — push hanya saat pinned (desktop) */}
      <main className={`p-6 overflow-auto min-h-screen transition-[margin] duration-300 ease-out ${pushed ? 'ml-60' : 'ml-0'}`}>
        {children}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>} />
      <Route path="/input" element={<PrivateRoute><Layout><InputTimbangan /></Layout></PrivateRoute>} />
      <Route path="/input/:id" element={<PrivateRoute><Layout><InputTimbangan /></Layout></PrivateRoute>} />
      <Route path="/bulk-input" element={<PrivateRoute><Layout><BulkInput /></Layout></PrivateRoute>} />
      <Route path="/data" element={<PrivateRoute><Layout><DataTimbangan /></Layout></PrivateRoute>} />
      <Route path="/kontrak" element={<PrivateRoute><Layout><Kontrak /></Layout></PrivateRoute>} />
      <Route path="/laporan" element={<PrivateRoute><Layout><Laporan /></Layout></PrivateRoute>} />
      <Route path="/armada" element={<PrivateRoute><Layout><Armada /></Layout></PrivateRoute>} />
      <Route path="/audit" element={<PrivateRoute><Layout><AuditForensik /></Layout></PrivateRoute>} />
      <Route path="/refinery" element={<PrivateRoute><Layout><RefineryReconciliation /></Layout></PrivateRoute>} />
      <Route path="/tank" element={<PrivateRoute><Layout><TankInventory /></Layout></PrivateRoute>} />
      <Route path="/quality" element={<PrivateRoute><Layout><QualityLog /></Layout></PrivateRoute>} />
      <Route path="/payment" element={<PrivateRoute><Layout><PaymentAging /></Layout></PrivateRoute>} />
      <Route path="/pengguna" element={<PrivateRoute><Layout><Pengguna /></Layout></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
