import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Menu } from 'lucide-react'
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
import ProduksiRefinery from './pages/ProduksiRefinery'
import TankInventory from './pages/TankInventory'
import QualityLog from './pages/QualityLog'
import PaymentAging from './pages/PaymentAging'
import HargaPasar from './pages/HargaPasar'
import DailyBriefing from './pages/DailyBriefing'
import InsightCenter from './pages/InsightCenter'
import ImportData from './pages/ImportData'
import Pengguna from './pages/Pengguna'

function PrivateRoute({ children }) {
  return isLoggedIn() ? children : <Navigate to="/login" replace />
}

function Layout({ children }) {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches)
  // Sidebar tampil/sembunyi — dikontrol HANYA oleh tombol ☰. Default: tampil di desktop, sembunyi di HP.
  const [open, setOpen] = useState(() => !window.matchMedia('(max-width: 768px)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const onChange = e => { setIsMobile(e.matches); setOpen(!e.matches) }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // Ctrl/Cmd+B toggle · Esc tutup
  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); setOpen(o => !o) }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const contentMl = !isMobile && open ? 'ml-60' : 'ml-0'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Tombol ☰ — toggle tampil/sembunyi sidebar. Sembunyi saat sidebar terbuka di desktop. */}
      {!(open && !isMobile) && (
        <button onClick={() => setOpen(true)} title="Tampilkan sidebar (Ctrl+B)"
          className="fixed top-3 left-3 z-[60] p-2 rounded-xl bg-white shadow-md ring-1 ring-gray-200 text-gray-700 hover:text-orange-600 transition-colors">
          <Menu size={20} />
        </button>
      )}

      {/* Backdrop (HP saat sidebar terbuka) */}
      {isMobile && open && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar — geser masuk/keluar */}
      <div className="fixed left-0 top-0 h-screen z-50 transition-transform duration-300 ease-[cubic-bezier(.22,.61,.36,1)]"
        style={{ transform: open ? 'translateX(0)' : 'translateX(-100%)', boxShadow: isMobile && open ? '0 24px 50px -12px rgba(2,6,23,.45)' : 'none' }}>
        <Sidebar onClose={() => setOpen(false)} onNavigate={() => { if (isMobile) setOpen(false) }} />
      </div>

      {/* Konten — terdorong saat sidebar tampil di desktop */}
      <main className={`p-6 overflow-auto min-h-screen transition-[margin] duration-300 ease-out ${contentMl}`}>
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
      <Route path="/produksi" element={<PrivateRoute><Layout><ProduksiRefinery /></Layout></PrivateRoute>} />
      <Route path="/tank" element={<PrivateRoute><Layout><TankInventory /></Layout></PrivateRoute>} />
      <Route path="/quality" element={<PrivateRoute><Layout><QualityLog /></Layout></PrivateRoute>} />
      <Route path="/payment" element={<PrivateRoute><Layout><PaymentAging /></Layout></PrivateRoute>} />
      <Route path="/harga" element={<PrivateRoute><Layout><HargaPasar /></Layout></PrivateRoute>} />
      <Route path="/briefing" element={<PrivateRoute><Layout><DailyBriefing /></Layout></PrivateRoute>} />
      <Route path="/insight" element={<PrivateRoute><Layout><InsightCenter /></Layout></PrivateRoute>} />
      <Route path="/import" element={<PrivateRoute><Layout><ImportData /></Layout></PrivateRoute>} />
      <Route path="/pengguna" element={<PrivateRoute><Layout><Pengguna /></Layout></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
