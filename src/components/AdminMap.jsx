import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Maximize2, Minimize2, Eye, EyeOff, FileText } from 'lucide-react'
import { formatDateTime, getSmartMapsUrl } from '../lib/format'

function createNumberedPinIcon(stepNumber, isLatest, repName, customerName, showDetails, hasDocument) {
  const shortRep = repName ? repName.split(' ')[0] : ''
  const safeCustomer = (customerName || '').slice(0, 16)

  return L.divIcon({
    className: 'custom-byfabric-pin',
    html: `
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
        ${
          showDetails
            ? `<div style="margin-bottom:4px;white-space:nowrap;background:rgba(24,24,27,0.92);backdrop-filter:blur(4px);color:#ffffff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:6px;box-shadow:0 3px 10px rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.15);pointer-events:none;transform:translateY(-2px);">
                 <span style="color:#94C11F;">${shortRep}:</span> ${safeCustomer}
                 ${hasDocument ? '<span style="color:#F59E0B;margin-left:4px;">📎</span>' : ''}
               </div>`
            : ''
        }
        <div style="position:relative;width:${isLatest ? 34 : 26}px;height:${isLatest ? 34 : 26}px;display:flex;align-items:center;justify-content:center;">
          ${
            isLatest
              ? `<span style="position:absolute;inset:0;border-radius:9999px;background:#C81D77;opacity:0.4;animation:pulse-ring 2s infinite;"></span>`
              : ''
          }
          <span style="width:${isLatest ? 26 : 22}px;height:${isLatest ? 26 : 22}px;border-radius:9999px;background:${isLatest ? '#C81D77' : '#94C11F'};color:#ffffff;font-size:${isLatest ? 12 : 11}px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 3px 8px rgba(0,0,0,0.3);">
            ${stepNumber}
          </span>
        </div>
      </div>
    `,
    iconSize: [showDetails ? 130 : 34, showDetails ? 56 : 34],
    iconAnchor: [showDetails ? 65 : 17, showDetails ? 48 : 17],
  })
}

export default function AdminMap({
  checkIns,
  selectedId,
  onSelect,
  showRoute = true,
  addressMap = {},
  onViewDocument,
}) {
  const wrapperRef = useRef(null)
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersLayerRef = useRef(null)
  const routeLayerRef = useRef(null)
  const markerByIdRef = useRef({})

  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showPinDetails, setShowPinDetails] = useState(false)

  // Native Fullscreen API desteği (sağa kayma ve overflow hatasını %100 çözer)
  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const el = wrapperRef.current
        if (el?.requestFullscreen) {
          await el.requestFullscreen()
        } else if (el?.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen()
        } else {
          setIsFullscreen((prev) => !prev)
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen()
        }
      }
    } catch {
      setIsFullscreen((prev) => !prev)
    }
  }

  useEffect(() => {
    const handleFsChange = () => {
      const active = Boolean(document.fullscreenElement || document.webkitFullscreenElement)
      setIsFullscreen(active)
      setTimeout(() => {
        mapRef.current?.invalidateSize()
      }, 150)
    }

    document.addEventListener('fullscreenchange', handleFsChange)
    document.addEventListener('webkitfullscreenchange', handleFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange)
      document.removeEventListener('webkitfullscreenchange', handleFsChange)
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [41.0082, 28.9784],
      zoom: 12,
      zoomControl: false,
    })

    L.control.zoom({ position: 'topright' }).addTo(map)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)

    routeLayerRef.current = L.layerGroup().addTo(map)
    markersLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      markersLayerRef.current = null
      routeLayerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const markersLayer = markersLayerRef.current
    const routeLayer = routeLayerRef.current
    if (!map || !markersLayer || !routeLayer) return

    markersLayer.clearLayers()
    routeLayer.clearLayers()
    markerByIdRef.current = {}

    if (checkIns.length === 0) return

    const chronological = [...checkIns].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    const repGroups = {}
    chronological.forEach((item) => {
      if (!repGroups[item.username]) {
        repGroups[item.username] = []
      }
      repGroups[item.username].push(item)
    })

    const bounds = []

    if (showRoute) {
      Object.entries(repGroups).forEach(([, items]) => {
        if (items.length > 1) {
          const latlngs = items.map((i) => [i.latitude, i.longitude])
          L.polyline(latlngs, {
            color: '#C81D77',
            weight: 5,
            opacity: 0.75,
            dashArray: '8, 8',
            lineJoin: 'round',
          }).addTo(routeLayer)

          L.polyline(latlngs, {
            color: '#94C11F',
            weight: 2,
            opacity: 0.9,
          }).addTo(routeLayer)
        }
      })
    }

    Object.entries(repGroups).forEach(([, items]) => {
      const totalInRep = items.length
      items.forEach((item, index) => {
        const stepNum = index + 1
        const isLatest = index === totalInRep - 1
        const hasDoc = Boolean(item.document_url || item.document_type)

        const marker = L.marker([item.latitude, item.longitude], {
          icon: createNumberedPinIcon(
            stepNum,
            isLatest,
            item.full_name,
            item.customer_name,
            showPinDetails,
            hasDoc
          ),
        })

        const displayAddress =
          addressMap[item.id] || item.reverse_city || 'Adres yükleniyor...'

        marker.bindPopup(`
          <div style="min-width:230px;font-family:'Plus Jakarta Sans',sans-serif;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <span style="font-size:11px;font-weight:800;color:#C81D77;text-transform:uppercase;">${item.full_name}</span>
              <span style="background:#C81D77;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:9999px;">Ziyaret #${stepNum}</span>
            </div>
            ${item.branch_name ? `<div style="font-size:10px;font-weight:700;color:#0284c7;margin-top:2px;">🏢 ${item.branch_name}</div>` : ''}
            <div style="font-size:15px;font-weight:700;color:#1c1917;margin-top:4px;">${item.customer_name}</div>
            
            ${
              hasDoc
                ? `<div style="margin-top:6px;padding:4px 8px;border-radius:6px;background:#fef3c7;border:1px solid #fde68a;font-size:11px;font-weight:700;color:#92400e;display:flex;align-items:center;gap:4px;">
                     <span>📎 Ekli Belge:</span> <strong>${item.document_type || 'Belge'}</strong>
                   </div>`
                : ''
            }

            <div style="font-size:11px;color:#44403c;margin-top:6px;background:#f5f5f4;padding:6px;border-radius:8px;line-height:1.4;">
              📍 <strong>Adres:</strong> ${displayAddress}
            </div>
            ${item.note ? `<div style="font-size:11px;color:#78716c;margin-top:4px;">💬 ${item.note}</div>` : ''}
            <div style="font-size:11px;color:#78716c;margin-top:6px;">🕒 ${formatDateTime(item.created_at)}</div>
            <div style="margin-top:8px;padding-top:6px;border-top:1px solid #e7e5e4;display:flex;align-items:center;justify-content:space-between;">
              <a href="${getSmartMapsUrl(item.latitude, item.longitude, item.customer_name)}" target="_blank" rel="noopener noreferrer"
                 style="font-size:12px;font-weight:700;color:#C81D77;text-decoration:none;">
                Haritada Aç &rarr;
              </a>
              ${isLatest ? '<span style="font-size:10px;color:#94C11F;font-weight:700;">● Son Nokta</span>' : ''}
            </div>
          </div>
        `)

        marker.on('click', () => {
          onSelect?.(item.id)
        })

        marker.addTo(markersLayer)
        markerByIdRef.current[item.id] = marker
        bounds.push([item.latitude, item.longitude])
      })
    })

    if (bounds.length === 1) {
      map.setView(bounds[0], 15)
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 })
    }
  }, [checkIns, onSelect, showRoute, showPinDetails, addressMap])

  useEffect(() => {
    if (!selectedId || !mapRef.current) return
    const marker = markerByIdRef.current[selectedId]
    if (marker) {
      const latLng = marker.getLatLng()
      mapRef.current.setView(latLng, Math.max(mapRef.current.getZoom(), 15), {
        animate: true,
      })
      marker.openPopup()
    }
  }, [selectedId])

  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => {
        mapRef.current?.invalidateSize()
      }, 250)
    }
  }, [isFullscreen])

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full overflow-hidden bg-stone-100 shadow-sm transition-all duration-200 ${
        isFullscreen
          ? 'fixed inset-0 z-[9999] w-full h-full rounded-none border-none'
          : 'h-[400px] sm:h-[480px] rounded-3xl border border-stone-200/90'
      }`}
    >
      <div ref={containerRef} className="w-full h-full z-0" />

      {/* Harita Üstü Butonlar */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setShowPinDetails(!showPinDetails)}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold shadow-md backdrop-blur-md transition cursor-pointer ${
            showPinDetails
              ? 'bg-[#C81D77] text-white shadow-[#C81D77]/25'
              : 'bg-white/95 hover:bg-white text-stone-700'
          }`}
          title="Tüm temsilci ve müşteri adlarını harita üzerinde doğrudan göster"
        >
          {showPinDetails ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          <span>{showPinDetails ? 'Nokta Detayları Açık' : 'Nokta Detaylarını Göster'}</span>
        </button>

        <button
          type="button"
          onClick={toggleFullscreen}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/95 hover:bg-white text-stone-800 text-xs font-bold shadow-md backdrop-blur-md transition cursor-pointer"
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="w-4 h-4 text-stone-600" />
              <span>Normal Boyut</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-4 h-4 text-[#C81D77]" />
              <span>Tam Ekran Harita</span>
            </>
          )}
        </button>
      </div>

      {checkIns.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-[2px] z-10">
          <p className="text-sm font-medium text-stone-500">
            Haritada gösterilecek konum kaydı yok
          </p>
        </div>
      )}
    </div>
  )
}
