import * as XLSX from 'xlsx'
import { formatDateTime, getGoogleMapsUrl } from './format'

/**
 * Filtrelenen check-in kayıtlarını 3 sayfalı Excel raporuna aktarır.
 * 3. Sayfa: Power Map (3D Harita) için uyumlu Enlem/Boylam sütunlu tablo.
 * Excel'de Ekle → Harita (3D Harita) → Veri kaynağı olarak "Harita Verisi" sayfasını seçin.
 */
export function exportCheckInsToExcel(checkIns, filterInfo = {}, addressMap = {}) {
  if (!checkIns || checkIns.length === 0) {
    throw new Error('Dışa aktarılacak check-in kaydı bulunamadı.')
  }

  const sorted = [...checkIns].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const wb = XLSX.utils.book_new()

  // ─────────────────────────────────────────────────
  // 1. SAYFA: Ziyaret Raporu (tam detay)
  // ─────────────────────────────────────────────────
  const reportRows = sorted.map((item, index) => {
    const address = addressMap[item.id] || item.reverse_city || `${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`
    return {
      'Sıra': index + 1,
      'Tarih / Saat': formatDateTime(item.created_at),
      'Şube': item.branch_name || 'Genel',
      'Satış Temsilcisi': item.full_name,
      'Kullanıcı Adı': `@${item.username}`,
      'Ziyaret Edilen Müşteri': item.customer_name,
      'Ziyaret Notu': item.note || '-',
      'Ekli Belge Tipi': item.document_type || '-',
      'Ziyaret Adresi': address,
      'Google Haritada Gör': getGoogleMapsUrl(item.latitude, item.longitude),
    }
  })

  const ws = XLSX.utils.json_to_sheet(reportRows)
  ws['!cols'] = [
    { wch: 6 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 16 },
    { wch: 28 }, { wch: 32 }, { wch: 20 }, { wch: 45 }, { wch: 45 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Ziyaret Raporu')

  // ─────────────────────────────────────────────────
  // 2. SAYFA: Temsilci Bazlı Özet
  // ─────────────────────────────────────────────────
  const repSummary = {}
  sorted.forEach((item) => {
    if (!repSummary[item.username]) {
      repSummary[item.username] = {
        'Satış Temsilcisi': item.full_name,
        'Kullanıcı Adı': `@${item.username}`,
        'Şube': item.branch_name || 'Genel',
        'Toplam Ziyaret': 0,
        'Belge Yüklenen': 0,
        'İlk Ziyaret': item.created_at,
        'Son Ziyaret': item.created_at,
        'Ziyaret Edilen Müşteriler': [],
      }
    }
    const cur = repSummary[item.username]
    cur['Toplam Ziyaret'] += 1
    if (item.document_url) cur['Belge Yüklenen'] += 1
    cur['Son Ziyaret'] = item.created_at
    if (!cur['Ziyaret Edilen Müşteriler'].includes(item.customer_name)) {
      cur['Ziyaret Edilen Müşteriler'].push(item.customer_name)
    }
  })

  const summaryRows = Object.values(repSummary).map((s) => ({
    'Satış Temsilcisi': s['Satış Temsilcisi'],
    'Kullanıcı Adı': s['Kullanıcı Adı'],
    'Şube': s['Şube'],
    'Toplam Ziyaret': s['Toplam Ziyaret'],
    'Belge Yüklenen': s['Belge Yüklenen'],
    'Farklı Müşteri Sayısı': s['Ziyaret Edilen Müşteriler'].length,
    'İlk Ziyaret': formatDateTime(s['İlk Ziyaret']),
    'Son Ziyaret': formatDateTime(s['Son Ziyaret']),
    'Müşteri Listesi': s['Ziyaret Edilen Müşteriler'].join(', '),
  }))

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
  wsSummary['!cols'] = [
    { wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 16 },
    { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 55 },
  ]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Temsilci Özeti')

  // ─────────────────────────────────────────────────
  // 3. SAYFA: Power Map / 3D Harita Verisi
  // Excel > Ekle > 3D Harita için enlem/boylam sütunlu tablo
  // ─────────────────────────────────────────────────
  const mapRows = sorted.map((item, index) => {
    const address = addressMap[item.id] || item.reverse_city || ''
    return {
      'Sıra': index + 1,
      'Tarih': formatDateTime(item.created_at),
      'Şube': item.branch_name || 'Genel',
      'Temsilci': item.full_name,
      'Müşteri': item.customer_name,
      'Enlem (Latitude)': item.latitude,
      'Boylam (Longitude)': item.longitude,
      'Adres': address,
      'Belge': item.document_type || '',
    }
  })

  const wsMap = XLSX.utils.json_to_sheet(mapRows)
  wsMap['!cols'] = [
    { wch: 6 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 24 },
    { wch: 18 }, { wch: 20 }, { wch: 40 }, { wch: 20 },
  ]
  XLSX.utils.book_append_sheet(wb, wsMap, 'Harita Verisi (3D)')

  // Dosya adı
  const dateStr = new Date().toISOString().split('T')[0]
  const repTag = filterInfo.rep && filterInfo.rep !== 'all' ? `_${filterInfo.rep}` : ''
  const dateTag = filterInfo.dateFrom && filterInfo.dateTo
    ? `_${filterInfo.dateFrom}_${filterInfo.dateTo}`
    : filterInfo.date && filterInfo.date !== 'all' ? `_${filterInfo.date}` : ''
  const filename = `byFabric_Ziyaret_Raporu${repTag}${dateTag}_${dateStr}.xlsx`

  XLSX.writeFile(wb, filename)
}
