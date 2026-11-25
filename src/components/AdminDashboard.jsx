import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  MapPin,
  Users,
  Volume2,
  VolumeX,
  BellRing,
  Search,
  Clock,
  ExternalLink,
  RefreshCw,
  Radio,
  X,
  FileSpreadsheet,
  Route,
  ShieldAlert,
  Download,
  Trash2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  playCheckInAlert,
  unlockAudio,
  requestBrowserNotificationPermission,
  showBrowserNotification,
} from '../lib/sound'
import {
  formatDateTime,
  formatRelativeTime,
  getSmartMapsUrl,
  isToday,
  isThisWeek,
} from '../lib/format'
import { exportCheckInsToExcel } from '../lib/excelExport'
import { analyzeCheckInFraud } from '../lib/fraudDetector'
import { getReverseGeocodeAddress } from '../lib/geocode'
import AdminMap from './AdminMap'
import UserManagement from './UserManagement'

export default function AdminDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('tracking')
  const [checkIns, setCheckIns] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [addressMap, setAddressMap] = useState({})

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [repFilter, setRepFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('today')

  // Route & Sound states
  const [showRoute, setShowRoute] = useState(true)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const [liveConnected, setLiveConnected] = useState(false)
  const [liveToast, setLiveToast] = useState(null)
  const [actionMsg, setActionMsg] = useState('')
  const [notifPermission, setNotifPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  )

  const loadCheckIns = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('check_ins')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(400)

      if (error) throw error
      const items = data || []
      setCheckIns(items)

      items.forEach(async (item) => {
        const fullAddr = await getReverseGeocodeAddress(item.latitude, item.longitude)
        setAddressMap((prev) => ({ ...prev, [item.id]: fullAddr }))
      })
    } catch (err) {
      console.error('Check-in verileri yüklenemedi:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCheckIns()
  }, [loadCheckIns])

  useEffect(() => {
    const handleFirstTouch = async () => {
      const ok = await unlockAudio()
      if (ok) {
        setAudioUnlocked(true)
        window.removeEventListener('pointerdown', handleFirstTouch)
      }
    }
    window.addEventListener('pointerdown', handleFirstTouch, { passive: true })
    return () => window.removeEventListener('pointerdown', handleFirstTouch)
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('admin-checkins-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'check_ins' },
        async (payload) => {
          const newRecord = payload.new
          if (!newRecord) return

          setCheckIns((prev) => {
            if (prev.some((c) => c.id === newRecord.id)) return prev
            return [newRecord, ...prev]
          })
          setSelectedId(newRecord.id)

          getReverseGeocodeAddress(newRecord.latitude, newRecord.longitude).then((addr) => {
            setAddressMap((prev) => ({ ...prev, [newRecord.id]: addr }))
          })

          setLiveToast(newRecord)
          setTimeout(() => {
            setLiveToast((current) =>
              current?.id === newRecord.id ? null : current
            )
          }, 9000)

          if (soundEnabled) {
            await playCheckInAlert()
          }

          showBrowserNotification(
            `🔔 Yeni Ziyaret: ${newRecord.full_name}`,
            `${newRecord.customer_name}${newRecord.note ? ' — ' + newRecord.note : ''}`
          )
        }
      )
      .subscribe((status) => {
        setLiveConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [soundEnabled])

  async function handleRequestNotification() {
    await unlockAudio()
    setAudioUnlocked(true)
    const perm = await requestBrowserNotificationPermission()
    setNotifPermission(perm)
    await playCheckInAlert()
    showBrowserNotification(
      'by Fabric Bildirimleri Aktif!',
      'Saha ekibinden yeni bir konum geldiğinde ses ve bildirim alacaksınız.'
    )
  }

  async function handleToggleSound() {
    if (!soundEnabled) {
      await unlockAudio()
      setAudioUnlocked(true)
      setSoundEnabled(true)
      await playCheckInAlert()
    } else {
      setSoundEnabled(false)
    }
  }

  // Bildirim Yönetimi: Kesin Silme
  async function handleDeleteCheckIn(item) {
    const ok = window.confirm(
      `"${item.customer_name}" (${item.full_name}) bildirimini silmek istediğinize emin misiniz?`
    )
    if (!ok) return

    try {
      // 1. Önce doğrudan RPC fonksiyonunu çalıştır (RLS'e takılmaz)
      const { data, error: rpcErr } = await supabase.rpc('admin_delete_check_in', {
        p_admin_id: user.id,
        p_check_in_id: item.id,
      })

      // Eğer rpc hata verirse doğrudan DELETE dene
      if (rpcErr) {
        console.warn('RPC hatası, doğrudan delete deneniyor:', rpcErr)
        const { error: directErr } = await supabase
          .from('check_ins')
          .delete()
          .eq('id', item.id)

        if (directErr) throw directErr
      }

      setCheckIns((prev) => prev.filter((c) => c.id !== item.id))
      setActionMsg(`"${item.customer_name}" bildirimi kalıcı olarak silindi.`)
      setTimeout(() => setActionMsg(''), 4000)
    } catch (err) {
      console.error('Silme hatası:', err)
      alert('Bildirim veritabanından silinemedi: ' + (err.message || 'Yetki hatası'))
    }
  }

  const uniqueReps = useMemo(() => {
    const map = new Map()
    for (const c of checkIns) {
      if (!map.has(c.username)) {
        map.set(c.username, c.full_name)
      }
    }
    return Array.from(map.entries()).map(([username, fullName]) => ({
      username,
      fullName,
    }))
  }, [checkIns])

  const filteredCheckIns = useMemo(() => {
    return checkIns.filter((item) => {
      if (repFilter !== 'all' && item.username !== repFilter) return false
      if (dateFilter === 'today' && !isToday(item.created_at)) return false
      if (dateFilter === 'week' && !isThisWeek(item.created_at)) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchCustomer = item.customer_name.toLowerCase().includes(q)
        const matchRep = item.full_name.toLowerCase().includes(q)
        const matchNote = (item.note || '').toLowerCase().includes(q)
        const matchAddr = (addressMap[item.id] || '').toLowerCase().includes(q)
        if (!matchCustomer && !matchRep && !matchNote && !matchAddr) return false
      }
      return true
    })
  }, [checkIns, repFilter, dateFilter, searchQuery, addressMap])

  const fraudAnalysisMap = useMemo(() => {
    const map = {}
    const sorted = [...checkIns].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    const lastSeenByRep = {}
    sorted.forEach((item) => {
      const prev = lastSeenByRep[item.username]
      const result = analyzeCheckInFraud(item, prev)
      map[item.id] = result
      lastSeenByRep[item.username] = item
    })
    return map
  }, [checkIns])

  const todayCount = useMemo(
    () => checkIns.filter((c) => isToday(c.created_at)).length,
    [checkIns]
  )

  function handleExportExcel() {
    try {
      exportCheckInsToExcel(
        filteredCheckIns,
        { rep: repFilter, date: dateFilter },
        addressMap
      )
    } catch (err) {
      alert(err.message || 'Excel oluşturulamadı.')
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-5 space-y-5">
      {notifPermission !== 'granted' && (
        <div className="bg-gradient-to-r from-[#C81D77] to-[#8c1050] text-white p-3.5 sm:p-4 rounded-2xl shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <BellRing className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-sm">
                Web Sitesi Bildirimleri &amp; Sesleri Açın
              </p>
              <p className="text-xs text-white/85">
                Yeni bir müşteri ziyareti yapıldığında ekranda sesli zil ve popup almak için izin verin.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestNotification}
            className="px-4 py-2 rounded-xl bg-white text-[#C81D77] hover:bg-stone-100 font-bold text-xs shrink-0 shadow-sm transition cursor-pointer"
          >
            Bildirim &amp; Sesi Etkinleştir
          </button>
        </div>
      )}

      {actionMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold rounded-xl">
          {actionMsg}
        </div>
      )}

      {liveToast && (
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:w-96 z-50 bg-stone-900 text-white rounded-2xl p-4 shadow-2xl border border-[#C81D77]/40 flex items-start gap-3 animate-bounce">
          <div className="h-10 w-10 rounded-xl bg-[#C81D77] flex items-center justify-center shrink-0">
            <BellRing className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#94C11F]">
              Yeni Konum Bildirimi
            </p>
            <p className="font-bold text-sm truncate mt-0.5">
              {liveToast.full_name} &rarr; {liveToast.customer_name}
            </p>
            {liveToast.note && (
              <p className="text-xs text-stone-300 truncate mt-0.5">{liveToast.note}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setLiveToast(null)}
            className="text-stone-400 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-2xl border border-stone-200/90 p-3 sm:px-4 shadow-xs">
        <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveTab('tracking')}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
              activeTab === 'tracking'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <MapPin className="w-4 h-4 text-[#C81D77]" />
            <span>Canlı Takip</span>
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#94C11F]/20 text-[#5D7B10] font-bold">
              {todayCount} bugün
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('users')}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
              activeTab === 'users'
                ? 'bg-white text-stone-900 shadow-xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Users className="w-4 h-4 text-[#C81D77]" />
            <span>Kullanıcı Yönetimi</span>
          </button>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 flex-wrap">
          <div
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold ${
              liveConnected
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-stone-100 text-stone-500'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${liveConnected ? 'animate-pulse' : ''}`} />
            <span>{liveConnected ? 'Canlı Bağlı' : 'Bağlanıyor...'}</span>
          </div>

          <button
            type="button"
            onClick={handleToggleSound}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
              soundEnabled
                ? 'bg-[#C81D77]/10 text-[#C81D77] hover:bg-[#C81D77]/15'
                : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
            }`}
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-4 h-4" />
                <span>Ses Açık</span>
              </>
            ) : (
              <>
                <VolumeX className="w-4 h-4" />
                <span>Ses Kapalı</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={async () => {
              await unlockAudio()
              await playCheckInAlert()
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#94C11F]/20 hover:bg-[#94C11F]/30 text-[#4c660b] text-xs font-bold transition cursor-pointer"
            title="Sesi Test Et"
          >
            <BellRing className="w-3.5 h-3.5" />
            <span>Sesi Çal</span>
          </button>
        </div>
      </div>

      {activeTab === 'users' ? (
        <UserManagement adminUser={user} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Günün Ziyaret Sıralaması &amp; Rota Haritası
            </span>

            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showRoute}
                onChange={(e) => setShowRoute(e.target.checked)}
                className="rounded text-[#C81D77] focus:ring-[#C81D77]"
              />
              <Route className="w-3.5 h-3.5 text-[#C81D77]" />
              <span>Yol / Rota Çiz</span>
            </label>
          </div>

          <AdminMap
            checkIns={filteredCheckIns}
            selectedId={selectedId}
            onSelect={setSelectedId}
            showRoute={showRoute}
            addressMap={addressMap}
          />

          {/* Filters, Excel Export & Feed */}
          <div className="bg-white rounded-3xl border border-stone-200/90 p-4 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Müşteri, adres, temsilci veya not ara..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:bg-white focus:border-[#C81D77]"
                  />
                </div>

                <select
                  value={repFilter}
                  onChange={(e) => setRepFilter(e.target.value)}
                  className="px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm font-medium text-stone-700 focus:outline-none focus:border-[#C81D77]"
                >
                  <option value="all">Tüm Temsilciler</option>
                  {uniqueReps.map((r) => (
                    <option key={r.username} value={r.username}>
                      {r.fullName}
                    </option>
                  ))}
                </select>

                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm font-medium text-stone-700 focus:outline-none focus:border-[#C81D77]"
                >
                  <option value="today">Sadece Bugün</option>
                  <option value="week">Son 7 Gün</option>
                  <option value="all">Tüm Tarihler</option>
                </select>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <button
                  type="button"
                  onClick={handleExportExcel}
                  disabled={filteredCheckIns.length === 0}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition disabled:opacity-50 cursor-pointer"
                  title="Görüntülenen kayıtları detaylı adresleriyle Excel olarak indir"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Excel Raporu</span>
                  <Download className="w-3 h-3 ml-0.5 opacity-80" />
                </button>

                <button
                  type="button"
                  onClick={loadCheckIns}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Yenile ({filteredCheckIns.length})</span>
                </button>
              </div>
            </div>

            {loading && checkIns.length === 0 ? (
              <div className="py-12 text-center text-sm text-stone-500">
                Konum kayıtları yükleniyor...
              </div>
            ) : filteredCheckIns.length === 0 ? (
              <div className="py-12 text-center">
                <MapPin className="w-8 h-8 text-stone-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-stone-600">
                  Seçilen filtrelere uygun konum kaydı bulunamadı.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-stone-100">
                {filteredCheckIns.map((item, idx) => {
                  const isSelected = selectedId === item.id
                  const fraudInfo = fraudAnalysisMap[item.id] || {}
                  const hasFraud = fraudInfo.isSuspicious
                  const displayAddress = addressMap[item.id] || item.reverse_city || 'Adres belirleniyor...'

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`py-3.5 px-3 -mx-3 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition ${
                        isSelected
                          ? 'bg-[#C81D77]/8 ring-1 ring-[#C81D77]/30'
                          : hasFraud
                          ? 'bg-rose-50/60 hover:bg-rose-50'
                          : 'hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center font-extrabold text-xs shrink-0 ${
                            hasFraud
                              ? 'bg-rose-600 text-white shadow-xs'
                              : idx === 0
                              ? 'bg-[#C81D77] text-white shadow-xs'
                              : 'bg-[#94C11F]/25 text-[#47600a]'
                          }`}
                        >
                          #{filteredCheckIns.length - idx}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-stone-900 text-sm sm:text-base">
                              {item.customer_name}
                            </span>
                            <span className="text-xs font-semibold text-[#C81D77]">
                              &bull; {item.full_name}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-stone-100 text-stone-600">
                              {formatRelativeTime(item.created_at)}
                            </span>

                            {hasFraud && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-600 text-white shadow-xs animate-pulse">
                                <ShieldAlert className="w-3.5 h-3.5" />
                                Sahte GPS / Işınlanma Şüphesi!
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-stone-700 font-medium">
                            <MapPin className="w-3.5 h-3.5 text-[#C81D77] shrink-0" />
                            <span className="truncate">{displayAddress}</span>
                          </div>

                          {hasFraud && fraudInfo.flags && (
                            <div className="p-2 rounded-lg bg-rose-100/80 border border-rose-300 text-rose-900 text-xs font-medium space-y-0.5">
                              {fraudInfo.flags.map((flag, fIdx) => (
                                <p key={fIdx}>⚠️ {flag.message}</p>
                              ))}
                            </div>
                          )}

                          {item.note && (
                            <p className="text-xs sm:text-sm text-stone-600">
                              💬 {item.note}
                            </p>
                          )}

                          <div className="flex items-center gap-3 text-xs text-stone-400 pt-0.5 flex-wrap">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {formatDateTime(item.created_at)}
                            </span>
                            {item.accuracy && (
                              <span className="text-[11px]">±{Math.round(item.accuracy)}m hassasiyet</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <a
                          href={getSmartMapsUrl(item.latitude, item.longitude, item.customer_name)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-100 hover:bg-[#C81D77] text-stone-700 hover:text-white text-xs font-semibold transition"
                        >
                          <span>Haritada Aç</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteCheckIn(item)
                          }}
                          title="Bu bildirimi sil (Test/Hatalı)"
                          className="p-2 rounded-xl bg-stone-100 hover:bg-rose-100 text-stone-400 hover:text-rose-600 transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
