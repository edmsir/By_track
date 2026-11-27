/**
 * Saha ekibinin çektiği fotoğrafları mobil kotayı ve veritabanını yormayacak şekilde
 * tarayıcı üzerinde (canvas) sıkıştırıp Base64 Data URL formatına dönüştürür (~50-80 KB).
 */
export function compressImageFile(file, maxWidth = 1024, maxHeight = 1024, quality = 0.65) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) {
      reject(new Error('Lütfen geçerli bir resim dosyası seçin.'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Dosya okunamadı.'))
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = () => reject(new Error('Resim işlenemedi.'))
      img.onload = () => {
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width)
            width = maxWidth
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height)
            height = maxHeight
          }
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
        resolve(compressedDataUrl)
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}
