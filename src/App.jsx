import { useEffect, useState } from 'react'
import { LogOut, Shield, User as UserIcon, Building2, Briefcase } from 'lucide-react'
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

  const roleMeta = (() => {
    if (user.role === 'admin') {
      return {
        label: 'Sistem Yöneticisi',
        Icon: Shield,
        badgeStyle: 'text-[#C81D77] bg-[#C81D77]/10 border-[#C81D77]/20',
      }
    }
    if (user.role === 'yonetim') {
      return {
        label: 'Genel Yönetim',
        Icon: Building2,
        badgeStyle: 'text-purple-700 bg-purple-50 border-purple-200',
      }
    }
    if (user.role === 'mudur') {
      return {
        label: user.branch_name ? `${user.branch_name} Müdürü` : 'Şube Müdürü',
        Icon: Briefcase,
        badgeStyle: 'text-blue-700 bg-blue-50 border-blue-200',
      }
    }
    return {
      label: user.branch_name ? `${user.branch_name} Satış` : 'Satış Temsilcisi',
      Icon: UserIcon,
      badgeStyle: 'text-[#4e6a0d] bg-[#94C11F]/20 border-[#94C11F]/30',
    }
  })()

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

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-stone-100 border border-stone-200/70">
              <roleMeta.Icon className="w-3.5 h-3.5 text-[#C81D77]" />
              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                <span className="text-xs sm:text-sm font-bold text-stone-800 truncate max-w-[130px] sm:max-w-[180px]">
                  {user.full_name}
                </span>
                <span
                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold border ${roleMeta.badgeStyle}`}
                >
                  {roleMeta.label}
                </span>
              </div>
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
        {user.role === 'rep' ? (
          <RepDashboard user={user} />
        ) : (
          <AdminDashboard user={user} />
        )}
      </main>
    </div>
  )
}
