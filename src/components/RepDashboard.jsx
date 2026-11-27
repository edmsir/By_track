import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import L from 'leaflet'
import {
  MapPin,
  Navigation,
  CheckCircle2,
  Clock,
  ExternalLink,
  AlertCircle,
  Loader2,
  Building2,
  FileText,
  RefreshCw,
  ShieldCheck,
  Camera,
  X,
  Map,
  List,
  Paperclip,
  Calendar,
  Filter,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  formatDateTime,
  formatRelativeTime,
  getSmartMapsUrl,
  isToday,
  isThisWeek,
  isInDateRange,
  todayDateStr,
  daysAgoDateStr,
} from '../lib/format'
import { getReverseGeocodeAddress } from '../lib/geocode'
import { compressImageFile } from '../lib/imageCompressor'

const DOCUMENT_TYPES = [
  'Mutabakat Tutanağı',
  'Çek / Senet',
  'Fatura',
  'İrsaliye',
  'Numune Teslim',
  'Sipariş Formu',
  'Ziyaret Kartı',
  'Diğer Belge',
]

function isYesterday(isoString) {
  if (!isoString) return false
  const d = new Date(isoString)
  const y = new Date()
  y.setDate(y.getDate() - 1)
  return (
    d.getFullYear() === y.getFullYear() &&
    d.getMonth() === y.getMonth() &&
    d.getDate() === y.getDate()
  )
}

export default function RepDashboard({ user }) {
  const [customerName, setCustomerName] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [gpsStatus, setGpsStatus] = useState('')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Belge / Fotoğraf yükleme
  const [documentType, setDocumentType] = useState('')
  const [documentPreview, setDocumentPreview] = useState(null) // base64
  const [documentCompressed, setDocumentCompressed] = useState(null) // küçük base64
  const [documentLoading, setDocumentLoading] = useState(false)
  const fileInputRef = useRef(null)

  const [checkIns, setCheckIns] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [addressMap, setAddressMap] = useState({})
  const [activePanel, setActivePanel] = useState('checkin') // 'checkin' | 'map' | 'history'

  // Tarih Filtresi: Varsayılan olarak "today" (Bugün)
  const [dateFilter, setDateFilter] = useState('today') // 'today' | 'yesterday' | 'week' | 'all' | 'custom'
  const [customStart, setCustomStart] = useState(daysAgoDateStr(7))
  const [customEnd, setCustomEnd] = useState(todayDateStr())

  // Kendi konum haritası
  const mapContainerRef = useRef(null)
  const myMapRef = useRef(null)

  const loadMyCheckIns = useCallback(async () => {
    setLoadingList(true)
    try {
      const { data, error: fetchError } = await supabase
        .rpc('get_authorized_check_ins', { p_requester_id: user.id })

      if (fetchError) {
        // Fallback
        const { data: d2 } = await supabase
          .from('check_ins')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(300)
        const items = d2 || []
        setCheckIns(items)
        items.forEach(async (item) => {
          const a = await getReverseGeocodeAddress(item.latitude, item.longitude)
          setAddressMap((p) => ({ ...p, [item.id]: a }))
        })
        return
      }

      const items = data || []
      setCheckIns(items)
      items.forEach(async (item) => {
        const a = await getReverseGeocodeAddress(item.latitude, item.longitude)
        setAddressMap((p) => ({ ...p, [item.id]: a }))
      })
    } catch (err) {
      console.error('Check-in listesi alınamadı:', err)
    } finally {
      setLoadingList(false)
    }
  }, [user.id])

  useEffect(() => {
    loadMyCheckIns()
  }, [loadMyCheckIns])

  // Filtrelenmiş Check-in'ler
  const filteredCheckIns = useMemo(() => {
    return checkIns.filter((item) => {
      if (dateFilter === 'today') return isToday(item.created_at)
      if (dateFilter === 'yesterday') return isYesterday(item.created_at)
      if (dateFilter === 'week') return isThisWeek(item.created_at)
      if (dateFilter === 'custom') return isInDateRange(item.created_at, customStart, customEnd)
      return true // 'all'
    })
  }, [checkIns, dateFilter, customStart, customEnd])

  // Component unmount olduğunda haritayı temizle
  useEffect(() => {
    return () => {
      if (myMapRef.current) {
        myMapRef.current.remove()
        myMapRef.current = null
      }
    }
  }, [])

  // Kendi konum haritasını oluştur ve güncelle
  useEffect(() => {
    if (!mapContainerRef.current) return

    // Harita örneği yoksa oluştur
    if (!myMapRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [39.9, 32.8],
        zoom: 6,
        zoomControl: true,
      })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)
      myMapRef.current = map
    }

    const map = myMapRef.current

    // Panel 'map' ise Leaflet boyutunu tazeleyip hizala (sekme geçişlerindeki yüklenmeme sorununu çözer)
    if (activePanel === 'map') {
      setTimeout(() => {
        map.invalidateSize()
      }, 50)
      setTimeout(() => {
        map.invalidateSize()
      }, 250)
    }

    // Eski marker ve polylineleri temizle
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer)
      }
    })

    const sorted = [...filteredCheckIns].sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    )
    const bounds = []

    sorted.forEach((item, idx) => {
      const isLast = idx === sorted.length - 1
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:${isLast ? 28 : 22}px;height:${
          isLast ? 28 : 22
        }px;border-radius:9999px;background:${
          isLast ? '#C81D77' : '#94C11F'
        };color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);">${
          idx + 1
        }</div>`,
        iconSize: [isLast ? 28 : 22, isLast ? 28 : 22],
        iconAnchor: [isLast ? 14 : 11, isLast ? 14 : 11],
      })
      const addr = addressMap[item.id] || item.reverse_city || ''
      const docBadge = item.document_type
        ? `<br/><span style="color:#b45309;font-weight:bold;font-size:11px;">📎 ${item.document_type}</span>`
        : ''
      const marker = L.marker([item.latitude, item.longitude], { icon }).bindPopup(
        `<div style="font-family:sans-serif;font-size:12px;line-height:1.4;">
          <strong style="color:#1c1917;font-size:13px;">${item.customer_name}</strong>
          ${addr ? `<div style="color:#57534e;margin-top:2px;">📍 ${addr}</div>` : ''}
          <div style="color:#78716c;margin-top:2px;">⏰ ${formatDateTime(item.created_at)}</div>
          ${docBadge}
        </div>`
      )
      marker.addTo(map)
      bounds.push([item.latitude, item.longitude])
    })

    if (sorted.length > 1) {
      L.polyline(bounds, {
        color: '#C81D77',
        weight: 3,
        opacity: 0.75,
        dashArray: '6,6',
      }).addTo(map)
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 15)
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 16 })
    } else {
      map.setView([39.9, 32.8], 6)
    }
  }, [activePanel, filteredCheckIns, addressMap])

  // Belge / Fotoğraf seçimi
  async function handleFileSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setDocumentLoading(true)
    try {
      const compressed = await compressImageFile(file, 1200, 1200, 0.65)
      setDocumentCompressed(compressed)
      setDocumentPreview(compressed)
      if (!documentType) setDocumentType('Diğer Belge')
    } catch (err) {
      setError('Fotoğraf işlenemedi: ' + err.message)
    } finally {
      setDocumentLoading(false)
      e.target.value = ''
    }
  }

  function clearDocument() {
    setDocumentPreview(null)
    setDocumentCompressed(null)
    if (!documentType) setDocumentType('')
  }

  function getCurrentHardwarePosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Tarayıcınız konum özelliğini desteklemiyor.'))
        return
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 18000,
        maximumAge: 0,
      })
    })
  }

  async function fetchNetworkCity() {
    try {
      const res = await fetch('https://ipapi.co/json/')
      if (!res.ok) return null
      const data = await res.json()
      return data.city || data.region || null
    } catch {
      return null
    }
  }

  async function handleCheckIn(e) {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    const trimmedCustomer = customerName.trim()
    if (trimmedCustomer.length < 2) {
      setError('Lütfen ziyaret ettiğiniz müşterinin adını yazın.')
      return
    }

    setSubmitting(true)
    setGpsStatus('Canlı GPS uydusuna bağlanılıyor...')

    try {
      const pos = await getCurrentHardwarePosition()
      const { latitude, longitude, accuracy } = pos.coords

      const isMock = Boolean(
        accuracy === 0 || (pos.coords.altitudeAccuracy === 0 && accuracy < 1)
      )

      setGpsStatus('Adres ve konum doğrulanıyor...')

      const [networkCity, reverseCity] = await Promise.all([
        fetchNetworkCity(),
        getReverseGeocodeAddress(latitude, longitude),
      ])

      setGpsStatus('Konum merkeze iletiliyor...')

      const { data, error: rpcError } = await supabase.rpc('create_check_in', {
        p_user_id: user.id,
        p_customer_name: trimmedCustomer,
        p_note: note.trim(),
        p_latitude: latitude,
        p_longitude: longitude,
        p_accuracy: accuracy ? Math.round(accuracy) : null,
        p_is_mock: isMock,
        p_network_city: networkCity,
        p_reverse_city: reverseCity,
        p_document_type: documentType || null,
        p_document_url: documentCompressed || null,
      })

      if (rpcError) {
        throw new Error(rpcError.message || 'Check-in kaydedilemedi.')
      }

      if (data) {
        setCheckIns((prev) => [data, ...prev])
        setAddressMap((prev) => ({ ...prev, [data.id]: reverseCity }))
      } else {
        await loadMyCheckIns()
      }

      setCustomerName('')
      setNote('')
      setDocumentType('')
      clearDocument()
      setSuccessMsg(`"${trimmedCustomer}" için konumunuz başarıyla kaydedildi!`)
      setTimeout(() => setSuccessMsg(''), 5000)
    } catch (err) {
      if (err?.code === 1) {
        setError('Konum izni verilmedi. Lütfen telefonunuzun ayarlarından konum iznine izin verin.')
      } else if (err?.code === 2) {
        setError('GPS sinyali alınamadı. Telefonunuzun Konum servisini açın.')
      } else if (err?.code === 3) {
        setError('GPS bağlantı süresi doldu. Lütfen açık alanda tekrar deneyin.')
      } else {
        setError(err.message || 'Konum paylaşılırken bir hata oluştu.')
      }
    } finally {
      setSubmitting(false)
      setGpsStatus('')
    }
  }

  // Aktif filtre başlık etiketi
  const filterLabel = useMemo(() => {
    if (dateFilter === 'today') return 'Bugünkü'
    if (dateFilter === 'yesterday') return 'Dünkü'
    if (dateFilter === 'week') return 'Son 7 Günlük'
    if (dateFilter === 'custom') return `${customStart} - ${customEnd}`
    return 'Tüm Zamanlar'
  }, [dateFilter, customStart, customEnd])

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
      {/* Sekme Butonları (Tab Bar) */}
      <div className="flex items-center gap-1.5 bg-white border border-stone-200/90 p-1 rounded-2xl shadow-xs">
        {[
          { key: 'checkin', label: 'Ziyaret Kaydet', Icon: Navigation },
          { key: 'map', label: `Rota Haritam (${filteredCheckIns.length})`, Icon: Map },
          { key: 'history', label: `Geçmişim (${filteredCheckIns.length})`, Icon: List },
        ].map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActivePanel(key)}
            className={`flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-semibold transition cursor-pointer ${
              activePanel === key
                ? 'bg-[#C81D77] text-white shadow-sm shadow-[#C81D77]/30'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-50'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
            <span className="sm:hidden">{label.split(' ')[0]}</span>
          </button>
        ))}
      </div>

      {/* Tarih Filtresi Barı (Sadece Harita ve Geçmiş sekmelerinde gösterilir) */}
      {activePanel !== 'checkin' && (
        <div className="bg-white rounded-2xl border border-stone-200/90 p-3 shadow-xs space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
              <Filter className="w-3.5 h-3.5 text-[#C81D77]" />
              <span>Tarih Filtresi:</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {[
                { id: 'today', label: 'Bugün' },
                { id: 'yesterday', label: 'Dün' },
                { id: 'week', label: 'Son 7 Gün' },
                { id: 'all', label: 'Tümü' },
                { id: 'custom', label: 'Özel Tarih' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setDateFilter(f.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    dateFilter === f.id
                      ? 'bg-[#C81D77] text-white shadow-xs'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Özel Tarih Seçici */}
          {dateFilter === 'custom' && (
            <div className="pt-2 border-t border-stone-100 flex items-center gap-2 flex-wrap">
              <Calendar className="w-4 h-4 text-stone-400" />
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="px-2.5 py-1 text-xs rounded-lg border border-stone-200 bg-stone-50 text-stone-800 focus:outline-none focus:border-[#C81D77]"
              />
              <span className="text-xs text-stone-400">-</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2.5 py-1 text-xs rounded-lg border border-stone-200 bg-stone-50 text-stone-800 focus:outline-none focus:border-[#C81D77]"
              />
            </div>
          )}
        </div>
      )}

      {/* Panel 1: Ziyaret Kaydet */}
      {activePanel === 'checkin' && (
        <section className="bg-white rounded-3xl border border-stone-200/90 shadow-[0_12px_35px_-12px_rgba(24,24,27,0.07)] p-5 sm:p-7">
          <div className="flex items-center justify-between mb-5">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#C81D77]">
                <Navigation className="w-3.5 h-3.5" />
                Saha Bildirimi
              </span>
              <h2 className="text-xl font-bold text-stone-900 mt-0.5">
                Müşteri Ziyareti &amp; Konum
              </h2>
            </div>
            <div className="h-11 w-11 rounded-2xl bg-[#94C11F]/15 text-[#5D7B10] flex items-center justify-center">
              <MapPin className="w-5 h-5" />
            </div>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 flex items-start gap-2.5 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleCheckIn} className="space-y-4">
            {/* Müşteri Adı */}
            <div>
              <label
                htmlFor="customerName"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5"
              >
                Müşteri / Firma Adı *
              </label>
              <div className="relative">
                <Building2 className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="customerName"
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Örn: Yılmaz Tekstil A.Ş."
                  disabled={submitting}
                  className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-stone-50 border border-stone-200 text-stone-900 placeholder:text-stone-400 text-sm font-medium focus:outline-none focus:bg-white focus:border-[#C81D77] focus:ring-4 focus:ring-[#C81D77]/10 transition"
                />
              </div>
            </div>

            {/* Ziyaret Notu */}
            <div>
              <label
                htmlFor="visitNote"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5"
              >
                Ziyaret Notu <span className="text-stone-400 font-normal">(İsteğe bağlı)</span>
              </label>
              <div className="relative">
                <FileText className="w-4 h-4 text-stone-400 absolute left-3.5 top-3.5" />
                <textarea
                  id="visitNote"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Örn: Kartela bırakıldı, numune kumaş istendi."
                  disabled={submitting}
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-stone-50 border border-stone-200 text-stone-900 placeholder:text-stone-400 text-sm focus:outline-none focus:bg-white focus:border-[#C81D77] focus:ring-4 focus:ring-[#C81D77]/10 transition resize-none"
                />
              </div>
            </div>

            {/* Belge / Evrak Alanı */}
            <div className="border border-dashed border-amber-300 rounded-2xl p-4 bg-amber-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5" />
                  Belge / Evrak Fotoğrafı{' '}
                  <span className="font-normal text-amber-600">(İsteğe bağlı)</span>
                </span>
              </div>

              {documentPreview ? (
                <div className="space-y-2">
                  <div className="relative inline-block w-full">
                    <img
                      src={documentPreview}
                      alt="Belge önizleme"
                      className="w-full max-h-48 object-contain rounded-xl border border-amber-200 bg-white"
                    />
                    <button
                      type="button"
                      onClick={clearDocument}
                      className="absolute top-2 right-2 h-7 w-7 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md cursor-pointer hover:bg-rose-600 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <select
                    value={documentType}
                    onChange={(e) => setDocumentType(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-amber-200 text-sm font-medium text-stone-700 focus:outline-none focus:border-amber-400"
                  >
                    <option value="">Belge Tipi Seçin *</option>
                    {DOCUMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    disabled={documentLoading || submitting}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-800 text-sm font-semibold transition disabled:opacity-60 cursor-pointer border border-amber-200"
                  >
                    {documentLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sıkıştırılıyor...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-4 h-4" />
                        <span>Fotoğraf Çek / Seç</span>
                      </>
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>
              )}
            </div>

            {/* Kaydet Butonu */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-4 px-5 rounded-2xl bg-[#C81D77] hover:bg-[#B01767] active:scale-[0.99] text-white font-bold text-base shadow-lg shadow-[#C81D77]/25 flex items-center justify-center gap-2.5 transition disabled:opacity-65 cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{gpsStatus || 'Konum Alınıyor...'}</span>
                </>
              ) : (
                <>
                  <MapPin className="w-5 h-5" />
                  <span>Canlı Konum Paylaş ve Kaydet</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-center gap-1.5 text-xs text-stone-400">
            <ShieldCheck className="w-3.5 h-3.5 text-[#94C11F]" />
            <span>Canlı GPS uydusu ve açık sokak adresiyle doğrulanır</span>
          </div>
        </section>
      )}

      {/* Panel 2: Rota Haritam (DOM'da kalması için hidden/block kullanıyoruz, böylece harita sekme değişiminde asla kaybolmaz!) */}
      <section
        className={`bg-white rounded-3xl border border-stone-200/90 shadow-sm overflow-hidden ${
          activePanel === 'map' ? 'block' : 'hidden'
        }`}
      >
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-stone-900">{filterLabel} Rota Haritam</h3>
            <p className="text-xs text-stone-500 mt-0.5">
              {filteredCheckIns.length} ziyaret noktası işaretlendi
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              loadMyCheckIns()
              setTimeout(() => myMapRef.current?.invalidateSize(), 200)
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 text-xs font-semibold cursor-pointer transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
            <span>Yenile</span>
          </button>
        </div>

        {filteredCheckIns.length === 0 ? (
          <div className="p-10 text-center">
            <MapPin className="w-10 h-10 text-stone-200 mx-auto mb-2" />
            <p className="text-sm font-semibold text-stone-700">
              Seçilen tarih aralığında ziyaret kaydınız bulunmuyor.
            </p>
            <p className="text-xs text-stone-400 mt-1">
              Filtreyi &quot;Tümü&quot; veya &quot;Son 7 Gün&quot; olarak değiştirebilirsiniz.
            </p>
          </div>
        ) : (
          <div ref={mapContainerRef} style={{ height: '440px', width: '100%' }} />
        )}
      </section>

      {/* Panel 3: Geçmişim */}
      {activePanel === 'history' && (
        <section className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-500">
              {filterLabel} Check-in&apos;lerim ({filteredCheckIns.length})
            </h3>
            <button
              type="button"
              onClick={loadMyCheckIns}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-600 hover:text-[#C81D77] py-1 px-2 rounded-lg hover:bg-stone-100 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>

          {loadingList && filteredCheckIns.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200/80 p-8 text-center text-sm text-stone-500">
              Kayıtlar yükleniyor...
            </div>
          ) : filteredCheckIns.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200/80 p-8 text-center">
              <MapPin className="w-8 h-8 text-stone-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-stone-600">
                Seçilen tarihte check-in kaydınız bulunamadı.
              </p>
              <button
                type="button"
                onClick={() => setDateFilter('all')}
                className="mt-2 text-xs font-semibold text-[#C81D77] hover:underline cursor-pointer"
              >
                Tüm kayıtları görüntüle
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredCheckIns.map((item, idx) => {
                const displayAddress =
                  addressMap[item.id] || item.reverse_city || 'Adres belirleniyor...'
                const hasDoc = Boolean(item.document_url)

                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl border border-stone-200/85 p-4 hover:border-stone-300 transition"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-xs px-2 py-0.5 rounded-md bg-stone-100 text-stone-700">
                            #{filteredCheckIns.length - idx}
                          </span>
                          <h4 className="font-bold text-stone-900 text-sm sm:text-base">
                            {item.customer_name}
                          </h4>
                          {item.document_type && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                              <Paperclip className="w-3 h-3" />
                              {item.document_type}
                            </span>
                          )}
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#94C11F]/15 text-[#5D7B10]">
                            {formatRelativeTime(item.created_at)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-xs text-stone-600 font-medium">
                          <MapPin className="w-3.5 h-3.5 text-[#C81D77] shrink-0" />
                          <span className="truncate">{displayAddress}</span>
                        </div>

                        {item.note && (
                          <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                            💬 {item.note}
                          </p>
                        )}

                        <div className="flex items-center gap-3 pt-1 text-xs text-stone-400">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {formatDateTime(item.created_at)}
                          </span>
                        </div>
                      </div>

                      <a
                        href={getSmartMapsUrl(item.latitude, item.longitude, item.customer_name)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-stone-100 hover:bg-[#C81D77]/10 text-stone-700 hover:text-[#C81D77] text-xs font-semibold transition"
                      >
                        <span>Harita</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>

                    {/* Belge Fotoğrafı */}
                    {hasDoc && (
                      <div className="mt-3 pt-3 border-t border-stone-100">
                        <p className="text-xs font-semibold text-amber-700 mb-1.5 flex items-center gap-1">
                          <Paperclip className="w-3 h-3" />
                          Ekli Belge: {item.document_type || 'Belge'}
                        </p>
                        <img
                          src={item.document_url}
                          alt={item.document_type || 'Belge'}
                          className="rounded-xl border border-amber-200 max-h-40 object-contain bg-white w-full cursor-pointer"
                          onClick={() => window.open(item.document_url, '_blank')}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
