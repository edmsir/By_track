// Web Audio API ile telefonda ve masaüstünde çalışan sesli bildirim
let sharedAudioCtx = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return null
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx()
  }
  return sharedAudioCtx
}

/**
 * Kullanıcı sayfaya girdiğinde veya butona bastığında AudioContext kilidini açar.
 */
export async function unlockAudio() {
  const ctx = getAudioContext()
  if (!ctx) return false
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.02)
    return true
  } catch (err) {
    console.warn('Audio kilidi açılamadı:', err)
    return false
  }
}

/**
 * Yedek HTML5 Audio ile zil çalma (AudioContext engellense bile çalışır)
 */
function playFallbackBeep() {
  try {
    // 880Hz kısa bip sesi için minik WAV data URL
    const snd = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YV4GAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/DCkU8LMGey7+enZw4kba7v765vEydus+7usWsSK2618O+3cRMpbrTw77ZtFilstPDusG0VLG2z8O2wbRUsbLLw7LBsFS1ssO/tsWsW')
    snd.volume = 1.0
    snd.play().catch(() => {})
  } catch {}
}

/**
 * Yeni check-in geldiğinde çalınan melodik bildirim sesi
 */
export async function playCheckInAlert() {
  // 1. Titreşim (Destekleyen telefonlarda)
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([250, 100, 250, 100, 400])
    }
  } catch {}

  const ctx = getAudioContext()
  if (!ctx) {
    playFallbackBeep()
    return false
  }

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    const now = ctx.currentTime
    // Dikkat çekici kurumsal zil melodisi: C5 -> E5 -> G5 -> C6
    const notes = [
      { freq: 523.25, start: 0, duration: 0.12, volume: 0.4 },
      { freq: 659.25, start: 0.10, duration: 0.12, volume: 0.45 },
      { freq: 783.99, start: 0.20, duration: 0.15, volume: 0.5 },
      { freq: 1046.50, start: 0.32, duration: 0.45, volume: 0.55 },
    ]

    for (const note of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(note.freq, now + note.start)

      gain.gain.setValueAtTime(0.001, now + note.start)
      gain.gain.exponentialRampToValueAtTime(note.volume, now + note.start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + note.start + note.duration)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now + note.start)
      osc.stop(now + note.start + note.duration + 0.03)
    }

    return true
  } catch (e) {
    console.warn('Web Audio hatası, yedek sese geçiliyor:', e)
    playFallbackBeep()
    return false
  }
}

/**
 * Tarayıcı Bildirim İzni İste (Popup)
 */
export async function requestBrowserNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    return await Notification.requestPermission()
  } catch {
    return 'default'
  }
}

/**
 * Tarayıcı Masaüstü / Telefon Banner Bildirimi Göster
 */
export function showBrowserNotification(title, body) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    const notif = new Notification(title, {
      body,
      icon: '/logo.png',
      badge: '/logo.png',
      tag: 'byfabric-' + Date.now(),
      renotify: true,
      requireInteraction: false,
    })
    notif.onclick = () => {
      window.focus()
      notif.close()
    }
  } catch (err) {
    console.warn('Tarayıcı bildirim gönderimi engellendi:', err)
  }
}
