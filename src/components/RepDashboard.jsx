import { useEffect, useState, useCallback } from 'react'
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
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDateTime, formatRelativeTime, getSmartMapsUrl } from '../lib/format'
import { getReverseGeocodeAddress } from '../lib/geocode'

export default function RepDashboard({ user }) {
  const [customerName, setCustomerName] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [gpsStatus, setGpsStatus] = useState('')
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const [checkIns, setCheckIns] = useState([])
  const [loadingList, setLoadingList] = useState(true)
  const [addressMap, setAddressMap] = useState({})

  const loadMyCheckIns = useCallback(async () => {
    setLoadingList(true)
    try {
      const { data, error: fetchError } = await supabase
        .from('check_ins')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30)

      if (fetchError) throw fetchError
      const items = data || []
      setCheckIns(items)

      items.forEach(async (item) => {
        const fullAddr = await getReverseGeocodeAddress(item.latitude, item.longitude)
        setAddressMap((prev) => ({ ...prev, [item.id]: fullAddr }))
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
      const res = await fetch('https://ipapi.co/json/', { timeout: 3500 })
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
        accuracy === 0 ||
        (pos.coords.altitudeAccuracy === 0 && accuracy < 1)
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
      setSuccessMsg(`"${trimmedCustomer}" için konumunuz başarıyla kaydedildi!`)
      setTimeout(() => setSuccessMsg(''), 5000)
    } catch (err) {
      if (err?.code === 1) {
        setError(
          'Konum izni verilmedi. Lütfen telefonunuzun ayarlarından konum iznine izin verin.'
        )
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
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

      {/* Recent Check-ins */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold uppercase tracking-wider text-stone-500">
            Son Check-in&apos;lerim ({checkIns.length})
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

        {loadingList && checkIns.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200/80 p-8 text-center text-sm text-stone-500">
            Kayıtlar yükleniyor...
          </div>
        ) : checkIns.length === 0 ? (
          <div className="bg-white rounded-2xl border border-stone-200/80 p-8 text-center">
            <MapPin className="w-8 h-8 text-stone-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-stone-600">
              Henüz hiç check-in yapmadınız.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {checkIns.map((item, idx) => {
              const displayAddress = addressMap[item.id] || item.reverse_city || 'Adres belirleniyor...'

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl border border-stone-200/85 p-4 flex items-start justify-between gap-3 hover:border-stone-300 transition"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-xs px-2 py-0.5 rounded-md bg-stone-100 text-stone-700">
                        #{checkIns.length - idx}
                      </span>
                      <h4 className="font-bold text-stone-900 text-sm sm:text-base truncate">
                        {item.customer_name}
                      </h4>
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
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
