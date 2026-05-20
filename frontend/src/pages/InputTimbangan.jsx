import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Save, ArrowLeft, Calculator } from 'lucide-react'
import api, { fmt } from '../utils/api'

const TRUCK_TYPES = ['6 Roda', '10 Roda', '12 Roda']
const PENIMBANG = ['Datu', 'Samsira', 'Chandra']

const emptyForm = {
  no_seri: '', no_seri_relasi: '', no_polisi: '', no_kontrak: '', do_number: '',
  relasi_id: '', relasi_nama: '', produk: '', truck_type: '',
  tanggal_masuk: new Date().toISOString().split('T')[0],
  berat_masuk: '', berat_keluar: '', berat_relasi: '',
  jam_masuk: '', jam_keluar: '',
  penimbang: '', driver: '', distance_km: '', transportir: '', lokasi_pengiriman: '', catatan: ''
}

export default function InputTimbangan() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = !!id

  const [form, setForm] = useState(emptyForm)
  const [relasi, setRelasi] = useState([])
  const [produkList, setProdukList] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const netto = form.berat_masuk && form.berat_keluar
    ? parseInt(form.berat_masuk) - parseInt(form.berat_keluar)
    : null

  useEffect(() => {
    api.get('/relasi').then(r => setRelasi(r.data))
    api.get('/produk').then(r => setProdukList(r.data))
    if (isEdit) {
      api.get(`/timbangan/${id}`).then(r => {
        const d = r.data
        setForm({
          ...d,
          tanggal_masuk: d.tanggal_masuk?.split('T')[0] || d.tanggal_masuk || '',
          jam_masuk: d.jam_masuk || '',
          jam_keluar: d.jam_keluar || '',
        })
      })
    }
  }, [id])

  function set(field) {
    return e => {
      const val = e.target.value
      setForm(f => {
        const next = { ...f, [field]: val }
        if (field === 'relasi_id') {
          const r = relasi.find(r => String(r.id) === String(val))
          next.relasi_nama = r?.nama || ''
          next.lokasi_pengiriman = r?.lokasi || ''
          next.transportir = r?.transportir || ''
        }
        return next
      })
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!form.tanggal_masuk || !form.berat_masuk || !form.berat_keluar) {
      return setError('Tanggal, berat masuk, dan berat keluar wajib diisi')
    }
    setLoading(true)
    try {
      if (isEdit) {
        await api.put(`/timbangan/${id}`, form)
        setSuccess('Data berhasil diupdate')
      } else {
        const r = await api.post('/timbangan', form)
        setSuccess(`Data disimpan! No. Seri: ${r.data.no_seri}`)
        setForm({ ...emptyForm, tanggal_masuk: form.tanggal_masuk, penimbang: form.penimbang })
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Gagal menyimpan data')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="text-slate-400 hover:text-white">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">{isEdit ? 'Edit Data Timbangan' : 'Input Data Timbangan'}</h1>
          <p className="text-sm text-slate-500">Isi formulir data timbangan harian</p>
        </div>
      </div>

      {error && <div className="bg-red-900/20 border border-red-700/50 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>}
      {success && <div className="bg-green-900/20 border border-green-700/50 text-green-400 px-4 py-3 rounded-lg text-sm">{success}</div>}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Section: Info Dasar */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 border-b border-wins-border pb-2">Informasi Dasar</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tanggal Masuk *</label>
              <input type="date" className="input" value={form.tanggal_masuk} onChange={set('tanggal_masuk')} required />
            </div>
            <div>
              <label className="label">No. Seri (otomatis jika kosong)</label>
              <input className="input" placeholder="000001" value={form.no_seri} onChange={set('no_seri')} />
            </div>
            <div>
              <label className="label">No. Seri Relasi</label>
              <input className="input" placeholder="Misal: CPO000001KMP" value={form.no_seri_relasi} onChange={set('no_seri_relasi')} />
            </div>
            <div>
              <label className="label">No. Polisi Kendaraan</label>
              <input className="input" placeholder="DD 1234 AB" value={form.no_polisi} onChange={set('no_polisi')} />
            </div>
            <div>
              <label className="label">No. Kontrak</label>
              <input className="input" placeholder="No. Kontrak" value={form.no_kontrak} onChange={set('no_kontrak')} />
            </div>
            <div>
              <label className="label">DO / Delivery Order</label>
              <input className="input" placeholder="Nomor DO" value={form.do_number} onChange={set('do_number')} />
            </div>
          </div>
        </div>

        {/* Section: Relasi & Produk */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 border-b border-wins-border pb-2">Relasi & Produk</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Relasi / Pembeli *</label>
              <select className="input" value={form.relasi_id} onChange={set('relasi_id')}>
                <option value="">-- Pilih Relasi --</option>
                {relasi.map(r => <option key={r.id} value={r.id}>{r.nama}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Produk *</label>
              <select className="input" value={form.produk} onChange={set('produk')}>
                <option value="">-- Pilih Produk --</option>
                {produkList.map(p => <option key={p.id} value={p.kode}>{p.kode}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Jenis Kendaraan</label>
              <select className="input" value={form.truck_type} onChange={set('truck_type')}>
                <option value="">-- Jenis Truck --</option>
                {TRUCK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Lokasi Pengiriman</label>
              <input className="input" placeholder="Lokasi tujuan" value={form.lokasi_pengiriman} onChange={set('lokasi_pengiriman')} />
            </div>
            <div>
              <label className="label">Transportir</label>
              <input className="input" placeholder="Nama transportir" value={form.transportir} onChange={set('transportir')} />
            </div>
            <div>
              <label className="label">Jarak (Km)</label>
              <input type="number" className="input" placeholder="0" value={form.distance_km} onChange={set('distance_km')} />
            </div>
          </div>
        </div>

        {/* Section: Berat */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 border-b border-wins-border pb-2">Data Timbangan</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Berat Masuk (Kg) *</label>
              <input type="number" className="input" placeholder="0" value={form.berat_masuk} onChange={set('berat_masuk')} required />
            </div>
            <div>
              <label className="label">Berat Keluar (Kg) *</label>
              <input type="number" className="input" placeholder="0" value={form.berat_keluar} onChange={set('berat_keluar')} required />
            </div>
            <div>
              <label className="label">Berat Relasi (Kg)</label>
              <input type="number" className="input" placeholder="0" value={form.berat_relasi} onChange={set('berat_relasi')} />
            </div>
          </div>
          {netto !== null && (
            <div className={`flex items-center gap-2 px-4 py-3 rounded-lg ${netto >= 0 ? 'bg-primary-900/20 border border-primary-700/40' : 'bg-red-900/20 border border-red-700/40'}`}>
              <Calculator size={16} className={netto >= 0 ? 'text-primary-400' : 'text-red-400'} />
              <span className="text-sm">
                Berat Netto PT WINS: <strong className={netto >= 0 ? 'text-primary-300' : 'text-red-300'}>{netto.toLocaleString('id-ID')} kg</strong>
                {form.berat_relasi && <span className="ml-3 text-slate-400">Selisih dengan relasi: <strong className={netto - form.berat_relasi > 0 ? 'text-yellow-300' : 'text-blue-300'}>{(netto - parseInt(form.berat_relasi || 0)).toLocaleString('id-ID')} kg</strong></span>}
              </span>
            </div>
          )}
        </div>

        {/* Section: Waktu & Personil */}
        <div className="card space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 border-b border-wins-border pb-2">Waktu & Personil</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Jam Masuk</label>
              <input type="time" className="input" value={form.jam_masuk} onChange={set('jam_masuk')} />
            </div>
            <div>
              <label className="label">Jam Keluar</label>
              <input type="time" className="input" value={form.jam_keluar} onChange={set('jam_keluar')} />
            </div>
            <div>
              <label className="label">Penimbang</label>
              <select className="input" value={form.penimbang} onChange={set('penimbang')}>
                <option value="">-- Pilih Penimbang --</option>
                {PENIMBANG.map(p => <option key={p} value={p}>{p}</option>)}
                <option value="__other">Lainnya...</option>
              </select>
            </div>
            <div>
              <label className="label">Driver</label>
              <input className="input" placeholder="Nama driver" value={form.driver} onChange={set('driver')} />
            </div>
          </div>
          <div>
            <label className="label">Catatan</label>
            <textarea className="input h-20 resize-none" placeholder="Catatan tambahan (opsional)" value={form.catatan} onChange={set('catatan')} />
          </div>
        </div>

        <div className="flex gap-3 pb-6">
          <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2 px-6 py-3">
            <Save size={16} />
            {loading ? 'Menyimpan...' : (isEdit ? 'Update Data' : 'Simpan Data')}
          </button>
          <button type="button" onClick={() => navigate('/data')} className="btn-secondary px-6 py-3">
            Batal
          </button>
        </div>
      </form>
    </div>
  )
}
