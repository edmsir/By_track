import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { formatDateTime, getGoogleMapsUrl } from '../lib/format'

function createNumberedPinIcon(stepNumber, isLatest) {
  return L.divIcon({
    className: 'custom-byfabric-pin',
    html: isLatest
      ? `<div style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;">
           <span style="position:absolute;inset:0;border-radius:9999px;background:#C81D77;opacity:0.4;animation:pulse-ring 2s infinite;"></span>
           <span style="width:26px;height:26px;border-radius:9999px;background:#C81D77;color:#ffffff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2.5px solid #ffffff;box-shadow:0 4px 12px rgba(200,29,119,0.5);">
             ${stepNumber}
           </span>
         </div>`
      : `<div style="width:24px;height:24px;border-radius:9999px;background:#94C11F;color:#ffffff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 2px 8px rgba(0,0,0,0.25);">
           ${stepNumber}
         </div>`,
    iconSize: isLatest ? [34, 34] : [24, 24],
    iconAnchor: isLatest ? [17, 17] : [12, 12],
  })
}

export default function AdminMap({ checkIns, selectedId, onSelect, showRoute = true }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersLayerRef = useRef(null)
  const routeLayerRef = useRef(null)
  const markerByIdRef = useRef({})

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: [41.0082, 28.9784],
      zoom: 12,
      zoomControl: true,
    })

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

    // Kronolojik sıralama (Günün 1. ziyaretinden son ziyaretine)
    const chronological = [...checkIns].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )

    // Temsilci bazında yolları ve ziyaret sırasını ayır
    const repGroups = {}
    chronological.forEach((item) => {
      if (!repGroups[item.username]) {
        repGroups[item.username] = []
      }
      repGroups[item.username].push(item)
    })

    const bounds = []

    // 1. Rota Çizgileri (Polyline)
    if (showRoute) {
      Object.entries(repGroups).forEach(([, items]) => {
        if (items.length > 1) {
          const latlngs = items.map((i) => [i.latitude, i.longitude])
          
          // Gölge / Vurgu çizgisi
          L.polyline(latlngs, {
            color: '#C81D77',
            weight: 5,
            opacity: 0.75,
            dashArray: '8, 8',
            lineJoin: 'round',
          }).addTo(routeLayer)

          // İnce kılavuz çizgi
          L.polyline(latlngs, {
            color: '#94C11F',
            weight: 2,
            opacity: 0.9,
          }).addTo(routeLayer)
        }
      })
    }

    // 2. Numaralandırılmış Ziyaret Noktaları
    Object.entries(repGroups).forEach(([, items]) => {
      const totalInRep = items.length
      items.forEach((item, index) => {
        const stepNum = index + 1
        const isLatest = index === totalInRep - 1
        const marker = L.marker([item.latitude, item.longitude], {
          icon: createNumberedPinIcon(stepNum, isLatest),
        })

        const escapedCustomer = item.customer_name
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
        const escapedRep = item.full_name
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
        const escapedNote = item.note
          ? item.note.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          : ''

        marker.bindPopup(`
          <div style="min-width:210px;font-family:'Plus Jakarta Sans',sans-serif;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <span style="font-size:11px;font-weight:800;color:#C81D77;text-transform:uppercase;letter-spacing:0.04em;">${escapedRep}</span>
              <span style="background:#C81D77;color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:9999px;">Ziyaret #${stepNum}</span>
            </div>
            <div style="font-size:15px;font-weight:700;color:#1c1917;margin-top:4px;">${escapedCustomer}</div>
            ${escapedNote ? `<div style="font-size:12px;color:#57534e;margin-top:4px;background:#f5f5f4;padding:6px;border-radius:8px;">${escapedNote}</div>` : ''}
            <div style="font-size:11px;color:#78716c;margin-top:6px;">🕒 ${formatDateTime(item.created_at)}</div>
            <div style="margin-top:8px;padding-top:6px;border-top:1px solid #e7e5e4;display:flex;align-items:center;justify-content:space-between;">
              <a href="${getGoogleMapsUrl(item.latitude, item.longitude)}" target="_blank" rel="noopener noreferrer"
                 style="font-size:12px;font-weight:700;color:#C81D77;text-decoration:none;">
                Google Maps &rarr;
              </a>
              ${isLatest ? '<span style="font-size:10px;color:#94C11F;font-weight:700;">● Son Konum</span>' : ''}
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
  }, [checkIns, onSelect, showRoute])

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

  return (
    <div className="relative w-full h-[380px] sm:h-[460px] rounded-3xl overflow-hidden border border-stone-200/90 bg-stone-100 shadow-sm">
      <div ref={containerRef} className="w-full h-full z-0" />
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
