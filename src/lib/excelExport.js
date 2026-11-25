import * as XLSX from 'xlsx'
import { formatDateTime, getGoogleMapsUrl } from './format'

/**
 * Filtrelenen check-in kayıtlarını açık sokak/ilçe/şehir adresleriyle kurumsal Excel'e aktarır.
 */
export function exportCheckInsToExcel(checkIns, filterInfo = {}, addressMap = {}) {
  if (!checkIns || checkIns.length === 0) {
    throw new Error('Dışa aktarılacak check-in kaydı bulunamadı.')
  }

  // Kronolojik sıralama
  const sorted = [...checkIns].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  // 1. Ana Detay Tablosu (Tam Açık Adresli)
  const reportRows = sorted.map((item, index) => {
    const address = addressMap[item.id] || item.reverse_city || `${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`
    
    return {
      'Sıra': index + 1,
      'Tarih / Saat': formatDateTime(item.created_at),
      'Satış Temsilcisi': item.full_name,
      'Kullanıcı Adı': `@${item.username}`,
      'Ziyaret Edilen Müşteri': item.customer_name,
      'Ziyaret Notu': item.note || '-',
      'Ziyaret Adresi (Cadde / İlçe / Şehir)': address,
      'Google Haritada Gör': getGoogleMapsUrl(item.latitude, item.longitude),
    }
  })

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(reportRows)

  // Sütun genişlikleri
  ws['!cols'] = [
    { wch: 6 },  // Sıra
    { wch: 18 }, // Tarih/Saat
    { wch: 22 }, // Temsilci
    { wch: 16 }, // Kullanıcı Adı
    { wch: 28 }, // Müşteri
    { wch: 32 }, // Not
    { wch: 45 }, // Açık Adres
    { wch: 45 }, // Harita Linki
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Ziyaret Raporu')

  // 2. Temsilci Bazlı Özet Sayfası
  const repSummary = {}
  sorted.forEach((item) => {
    if (!repSummary[item.username]) {
      repSummary[item.username] = {
        'Satış Temsilcisi': item.full_name,
        'Kullanıcı Adı': `@${item.username}`,
        'Toplam Ziyaret': 0,
        'İlk Ziyaret': item.created_at,
        'Son Ziyaret': item.created_at,
        'Ziyaret Edilen Müşteriler': [],
      }
    }
    const cur = repSummary[item.username]
    cur['Toplam Ziyaret'] += 1
    cur['Son Ziyaret'] = item.created_at
    if (!cur['Ziyaret Edilen Müşteriler'].includes(item.customer_name)) {
      cur['Ziyaret Edilen Müşteriler'].push(item.customer_name)
    }
  })

  const summaryRows = Object.values(repSummary).map((s) => ({
    'Satış Temsilcisi': s['Satış Temsilcisi'],
    'Kullanıcı Adı': s['Kullanıcı Adı'],
    'Toplam Ziyaret Sayısı': s['Toplam Ziyaret'],
    'Farklı Müşteri Sayısı': s['Ziyaret Edilen Müşteriler'].length,
    'İlk Ziyaret Saati': formatDateTime(s['İlk Ziyaret']),
    'Son Ziyaret Saati': formatDateTime(s['Son Ziyaret']),
    'Müşteri Listesi': s['Ziyaret Edilen Müşteriler'].join(', '),
  }))

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
  wsSummary['!cols'] = [
    { wch: 22 },
    { wch: 16 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
    { wch: 55 },
  ]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Temsilci Özeti')

  const dateStr = new Date().toISOString().split('T')[0]
  const repTag = filterInfo.rep && filterInfo.rep !== 'all' ? `_${filterInfo.rep}` : ''
  const filename = `byFabric_Ziyaret_Raporu${repTag}_${dateStr}.xlsx`

  XLSX.writeFile(wb, filename)
}
