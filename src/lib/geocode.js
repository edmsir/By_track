const addressCache = new Map()

/**
 * Enlem ve Boylamı OpenStreetMap Nominatim ile sokak, mahalle, ilçe, il şeklinde açık adrese çevirir.
 */
export async function getReverseGeocodeAddress(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
  if (addressCache.has(key)) {
    return addressCache.get(key)
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'byFabricSahaTakip/1.0 (info@byfabric.com)',
        },
      }
    )
    if (!res.ok) throw new Error('Adres servisi yanıt vermedi')
    const data = await res.json()
    const addr = data.address || {}

    // Türkçe adres formatı: [Mahalle/Sokak], [İlçe], [Şehir]
    const street = addr.road || addr.street || addr.pedestrian || ''
    const suburb = addr.suburb || addr.neighbourhood || addr.quarter || ''
    const district = addr.county || addr.town || addr.city_district || addr.municipality || ''
    const city = addr.province || addr.city || addr.state || ''

    const parts = []
    if (suburb) parts.push(suburb.includes('Mah') ? suburb : `${suburb} Mah.`)
    if (street) parts.push(street.includes('Cad') || street.includes('Sok') ? street : `${street} Sok.`)
    if (district) parts.push(district)
    if (city && city !== district) parts.push(city)

    const fullText = parts.length > 0 ? parts.join(', ') : (data.display_name?.split(',').slice(0, 3).join(',') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`)

    addressCache.set(key, fullText)
    return fullText
  } catch (err) {
    console.warn('Adres çözülemedi:', err)
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
  }
}
