export function formatDateTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatRelativeTime(isoString) {
  if (!isoString) return ''
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Az önce'
  if (diffMin < 60) return `${diffMin} dk önce`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours} sa önce`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'Dün'
  return `${diffDays} gün önce`
}

/**
 * Cihaz Apple (iPhone, iPad, Mac) ise doğrudan yerel 'Apple Haritalar' (Apple Maps) uygulamasını açar.
 * Android veya Windows ise 'Google Haritalar' açar.
 */
export function getSmartMapsUrl(lat, lng, label = '') {
  if (typeof navigator === 'undefined') {
    return `https://www.google.com/maps?q=${lat},${lng}`
  }

  const isApple =
    /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  if (isApple) {
    // maps.apple.com linki iOS'ta doğrudan Apple Haritalar uygulamasını fırlatır
    const query = label ? encodeURIComponent(label) : `${lat},${lng}`
    return `https://maps.apple.com/?q=${query}&ll=${lat},${lng}`
  }

  return `https://www.google.com/maps?q=${lat},${lng}`
}

export function getGoogleMapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`
}

export function isToday(isoString) {
  if (!isoString) return false
  const d = new Date(isoString)
  const now = new Date()
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  )
}

export function isThisWeek(isoString) {
  if (!isoString) return false
  const d = new Date(isoString)
  const diffDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)
  return diffDays <= 7
}

/**
 * İki tarih arasında olup olmadığını kontrol eder (saat sınırı yok, tam gün kapsayıcı)
 */
export function isInDateRange(isoString, startDate, endDate) {
  if (!isoString) return false
  const d = new Date(isoString)
  if (startDate) {
    const start = new Date(startDate)
    start.setHours(0, 0, 0, 0)
    if (d < start) return false
  }
  if (endDate) {
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)
    if (d > end) return false
  }
  return true
}

/**
 * Bugünün tarihini YYYY-MM-DD formatında döndürür (input[type=date] için)
 */
export function todayDateStr() {
  const now = new Date()
  return now.toISOString().split('T')[0]
}

/**
 * N gün önceyi YYYY-MM-DD formatında döndürür
 */
export function daysAgoDateStr(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}
