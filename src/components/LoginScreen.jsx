import { useState } from 'react'
import { Lock, User, ArrowRight, AlertCircle, MapPin } from 'lucide-react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!isSupabaseConfigured) {
      setError('Supabase bağlantı ayarları (.env) henüz yapılmamış.')
      return
    }

    if (!username.trim() || !password) {
      setError('Lütfen kullanıcı adı ve şifrenizi girin.')
      return
    }

    setLoading(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('login_user', {
        p_username: username.trim(),
        p_password: password,
      })

      if (rpcError) {
        throw new Error(rpcError.message || 'Giriş yapılamadı.')
      }

      const user = Array.isArray(data) ? data[0] : data
      if (!user) {
        throw new Error('Kullanıcı adı veya şifre hatalı.')
      }

      onLogin(user)
    } catch (err) {
      setError(err.message || 'Giriş sırasında bir hata oluştu.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col justify-center items-center px-4 py-8 bg-[#FAF9F6] relative overflow-hidden">
      {/* Subtle textile-inspired ambient accents */}
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-[#C81D77]/8 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-[#94C11F]/12 blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        {/* Brand Header Card */}
        <div className="bg-white border border-stone-200/90 rounded-3xl shadow-[0_20px_50px_-15px_rgba(24,24,27,0.08)] p-7 sm:p-9">
          <div className="flex flex-col items-center text-center mb-7">
            <div className="mb-4 px-5 py-3 rounded-2xl bg-[#FAF9F6] border border-stone-200/70">
              <img
                src="/logo.png"
                alt="by Fabric"
                className="h-12 w-auto object-contain"
              />
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#94C11F]/15 text-[#5D7B10] text-xs font-semibold tracking-wide mb-2">
              <MapPin className="w-3.5 h-3.5" />
              Saha Satış &amp; Konum Takip
            </div>
            <h1 className="text-xl font-bold text-stone-900 tracking-tight">
              Ekip Girişi
            </h1>
            <p className="text-sm text-stone-500 mt-1">
              Kullanıcı adınız ve şifrenizle oturum açın
            </p>
          </div>

          {!isSupabaseConfigured && (
            <div className="mb-5 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed">
              <strong>Kurulum Gerekli:</strong> <code>VITE_SUPABASE_URL</code> ve{' '}
              <code>VITE_SUPABASE_ANON_KEY</code> ortam değişkenleri tanımlı değil.
            </div>
          )}

          {error && (
            <div className="mb-5 flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5"
              >
                Kullanıcı Adı
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="username"
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ör. ahmet"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-stone-50 border border-stone-200 text-stone-900 placeholder:text-stone-400 text-sm font-medium focus:outline-none focus:bg-white focus:border-[#C81D77] focus:ring-4 focus:ring-[#C81D77]/10 transition"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1.5"
              >
                Şifre
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-stone-50 border border-stone-200 text-stone-900 placeholder:text-stone-400 text-sm font-medium focus:outline-none focus:bg-white focus:border-[#C81D77] focus:ring-4 focus:ring-[#C81D77]/10 transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 px-5 rounded-xl bg-[#C81D77] hover:bg-[#B01767] active:scale-[0.99] text-white font-semibold text-sm shadow-lg shadow-[#C81D77]/25 flex items-center justify-center gap-2 transition disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {loading ? (
                <span>Giriş yapılıyor...</span>
              ) : (
                <>
                  <span>Giriş Yap</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-stone-400 mt-5">
          by Fabric Kurumsal Saha Takip Sistemi
        </p>
      </div>
    </div>
  )
}
