import { useEffect, useState } from 'react'
import { LogOut, Shield, User as UserIcon } from 'lucide-react'
import LoginScreen from './components/LoginScreen'
import RepDashboard from './components/RepDashboard'
import AdminDashboard from './components/AdminDashboard'

const STORAGE_KEY = 'byfabric_track_user_v1'

export default function App() {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // Storage erişilemiyorsa yoksay
    }
  }, [user])

  if (!user) {
    return <LoginScreen onLogin={setUser} />
  }

  return (
    <div className="min-h-dvh flex flex-col bg-[#FAF9F6]">
      {/* App Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-stone-200/80">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/logo.png"
              alt="by Fabric"
              className="h-9 sm:h-10 w-auto object-contain shrink-0"
            />
            <div className="hidden sm:block h-6 w-px bg-stone-200" />
            <span className="hidden sm:inline-block text-xs font-semibold uppercase tracking-wider text-stone-500">
              Saha Takip
            </span>
          </div>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-100 border border-stone-200/70">
              {user.role === 'admin' ? (
                <Shield className="w-3.5 h-3.5 text-[#C81D77]" />
              ) : (
                <UserIcon className="w-3.5 h-3.5 text-[#5D7B10]" />
              )}
              <span className="text-xs sm:text-sm font-semibold text-stone-800 truncate max-w-[140px]">
                {user.full_name}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setUser(null)}
              title="Çıkış Yap"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Çıkış</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {user.role === 'admin' ? (
          <AdminDashboard user={user} />
        ) : (
          <RepDashboard user={user} />
        )}
      </main>
    </div>
  )
}
