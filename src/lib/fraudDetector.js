// İki GPS koordinatı arasındaki mesafeyi (km cinsinden) Haversine formülüyle hesaplar
export function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371 // Dünya yarıçapı (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

/**
 * Bir temsilcinin önceki check-in'i ile yeni check-in'i arasındaki hızı (km/s) inceler.
 * İnsanüstü hız (örneğin 140 km/saatten hızlı veya dakikalar içinde 1000 km ışınlanma)
 * varsa bunu doğrudan "SAHTE GPS / IŞINLANMA ŞÜPHESİ" olarak işaretler.
 */
export function analyzeCheckInFraud(currentCheckIn, previousCheckIn) {
  const flags = []

  // 1. IP / Şehir eşleşmeme kontrolü
  if (currentCheckIn.client_city && currentCheckIn.reverse_city) {
    const ipCity = currentCheckIn.client_city.toLowerCase().trim()
    const gpsCity = currentCheckIn.reverse_city.toLowerCase().trim()
    if (!ipCity.includes(gpsCity) && !gpsCity.includes(ipCity)) {
      flags.push({
        type: 'IP_MISMATCH',
        message: `İnternet Şehri (${currentCheckIn.client_city}) ile GPS Şehri (${currentCheckIn.reverse_city}) uyuşmuyor!`,
      })
    }
  }

  // 2. İki check-in arası ışınlanma (İmkansız Hız) kontrolü
  if (previousCheckIn) {
    const distKm = calculateDistanceKm(
      previousCheckIn.latitude,
      previousCheckIn.longitude,
      currentCheckIn.latitude,
      currentCheckIn.longitude
    )
    const diffHours =
      (new Date(currentCheckIn.created_at).getTime() -
        new Date(previousCheckIn.created_at).getTime()) /
      (1000 * 60 * 60)

    if (diffHours > 0) {
      const speedKmh = Math.round(distKm / diffHours)
      // Karayolu veya uçakla bile ulaşılamayacak ani sıçrama
      if (distKm > 15 && speedKmh > 160) {
        flags.push({
          type: 'IMPOSSIBLE_SPEED',
          speedKmh,
          distKm: Math.round(distKm),
          diffMinutes: Math.round(diffHours * 60),
          message: `${Math.round(diffHours * 60)} dk içinde ${Math.round(distKm)} km yer değiştirdi (${speedKmh} km/s imkansız hız - Sahte GPS şüphesi)!`,
        })
      }
    }
  }

  return {
    isSuspicious: flags.length > 0,
    flags,
  }
}
