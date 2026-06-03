import { Routes, Route, Navigate } from 'react-router-dom'
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
import Pengguna from './pages/Pengguna'

function PrivateRoute({ children }) {
  return isLoggedIn() ? children : <Navigate to="/login" replace />
}

function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto min-w-0">
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
      <Route path="/pengguna" element={<PrivateRoute><Layout><Pengguna /></Layout></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}
