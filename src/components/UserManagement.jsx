import { useEffect, useState, useCallback } from 'react'
import {
  UserPlus,
  Users,
  Shield,
  UserCheck,
  UserX,
  KeyRound,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function UserManagement({ adminUser }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // New user form
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('rep')
  const [creating, setCreating] = useState(false)

  // Password reset modal state
  const [resetTarget, setResetTarget] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_list_users', {
        p_admin_id: adminUser.id,
      })
      if (rpcError) throw rpcError
      setUsers(data || [])
    } catch (err) {
      setError(err.message || 'Kullanıcılar yüklenemedi.')
    } finally {
      setLoading(false)
    }
  }, [adminUser.id])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  async function handleCreateUser(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (fullName.trim().length < 2 || username.trim().length < 2 || password.length < 4) {
      setError('Ad Soyad (min 2), Kullanıcı Adı (min 2) ve Şifre (min 4 karakter) zorunludur.')
      return
    }

    setCreating(true)
    try {
      const { error: rpcError } = await supabase.rpc('admin_create_user', {
        p_admin_id: adminUser.id,
        p_username: username.trim(),
        p_full_name: fullName.trim(),
        p_password: password,
        p_role: role,
      })
      if (rpcError) throw rpcError

      setSuccess(`"${fullName.trim()}" (${username.trim().toLowerCase()}) oluşturuldu.`)
      setFullName('')
      setUsername('')
      setPassword('')
      setRole('rep')
      await loadUsers()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      setError(err.message || 'Kullanıcı oluşturulamadı.')
    } finally {
      setCreating(false)
    }
  }

  async function handleToggleActive(target) {
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('admin_toggle_user', {
        p_admin_id: adminUser.id,
        p_target_user_id: target.id,
        p_is_active: !target.is_active,
      })
      if (rpcError) throw rpcError
      await loadUsers()
    } catch (err) {
      setError(err.message || 'Durum güncellenemedi.')
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault()
    if (!resetTarget || newPassword.length < 4) {
      setError('Yeni şifre en az 4 karakter olmalıdır.')
      return
    }
    setResetting(true)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('admin_reset_password', {
        p_admin_id: adminUser.id,
        p_target_user_id: resetTarget.id,
        p_new_password: newPassword,
      })
      if (rpcError) throw rpcError

      setSuccess(`"${resetTarget.full_name}" şifresi güncellendi.`)
      setResetTarget(null)
      setNewPassword('')
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      setError(err.message || 'Şifre sıfırlanamadı.')
    } finally {
      setResetting(false)
    }
  }

  async function handleDeleteUser(target) {
    const confirmed = window.confirm(
      `"${target.full_name}" (@${target.username}) kullanıcısını ve tüm check-in kayıtlarını silmek istediğinize emin misiniz?`
    )
    if (!confirmed) return

    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('admin_delete_user', {
        p_admin_id: adminUser.id,
        p_target_user_id: target.id,
      })
      if (rpcError) throw rpcError
      setSuccess(`"${target.full_name}" silindi.`)
      await loadUsers()
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      setError(err.message || 'Kullanıcı silinemedi.')
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Create User Form */}
      <div className="lg:col-span-5">
        <div className="bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="h-10 w-10 rounded-2xl bg-[#C81D77]/10 text-[#C81D77] flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-stone-900 text-base">
                Yeni Satış Temsilcisi Ekle
              </h3>
              <p className="text-xs text-stone-500">
                E-posta gerekmez, sadece kullanıcı adı ve şifre belirleyin
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleCreateUser} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                Ad Soyad
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Örn: Ahmet Yılmaz"
                className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:bg-white focus:border-[#C81D77]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                Kullanıcı Adı
              </label>
              <input
                type="text"
                autoCapitalize="none"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ''))}
                placeholder="Örn: ahmet"
                className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:bg-white focus:border-[#C81D77]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                Şifre
              </label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="En az 4 karakter"
                className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:bg-white focus:border-[#C81D77]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                Yetki Rolü
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:bg-white focus:border-[#C81D77]"
              >
                <option value="rep">Satış Temsilcisi (Konum Paylaşır)</option>
                <option value="admin">Yönetici (Admin)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full py-3 rounded-xl bg-[#C81D77] hover:bg-[#B01767] text-white font-semibold text-sm shadow-md shadow-[#C81D77]/20 flex items-center justify-center gap-2 transition disabled:opacity-60 cursor-pointer"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Oluşturuluyor...</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Kullanıcıyı Oluştur</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* User List */}
      <div className="lg:col-span-7">
        <div className="bg-white rounded-3xl border border-stone-200/90 p-5 sm:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-stone-600" />
              <h3 className="font-bold text-stone-900 text-base">
                Kayıtlı Kullanıcılar ({users.length})
              </h3>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-stone-500">
              Kullanıcılar yükleniyor...
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {users.map((u) => {
                const isSelf = u.id === adminUser.id
                return (
                  <div
                    key={u.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`h-10 w-10 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0 ${
                          u.role === 'admin'
                            ? 'bg-[#C81D77]/12 text-[#C81D77]'
                            : 'bg-[#94C11F]/18 text-[#5D7B10]'
                        }`}
                      >
                        {u.full_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-stone-900 truncate">
                            {u.full_name}
                          </span>
                          {u.role === 'admin' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#C81D77]/10 text-[#C81D77]">
                              <Shield className="w-3 h-3" />
                              Admin
                            </span>
                          )}
                          {!u.is_active && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-stone-200 text-stone-600">
                              Pasif
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-500 font-mono-tech">
                          @{u.username}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setResetTarget(u)
                          setNewPassword('')
                        }}
                        title="Şifre Sıfırla"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold transition cursor-pointer"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Şifre</span>
                      </button>

                      {!isSelf && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(u)}
                            title={u.is_active ? 'Pasife Al' : 'Aktifleştir'}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                              u.is_active
                                ? 'bg-amber-50 hover:bg-amber-100 text-amber-800'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {u.is_active ? (
                              <>
                                <UserX className="w-3.5 h-3.5" />
                                <span>Pasife Al</span>
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>Aktifleştir</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteUser(u)}
                            title="Kullanıcıyı Sil"
                            className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Password Reset Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl w-full max-w-sm p-6">
            <h4 className="font-bold text-stone-900 text-base">
              Şifre Güncelle: {resetTarget.full_name}
            </h4>
            <p className="text-xs text-stone-500 mt-1 mb-4">
              @{resetTarget.username} için yeni şifre belirleyin.
            </p>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <input
                type="text"
                autoFocus
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Yeni şifre (en az 4 karakter)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:bg-white focus:border-[#C81D77]"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={resetting}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#C81D77] hover:bg-[#B01767] text-white cursor-pointer disabled:opacity-60"
                >
                  {resetting ? 'Kaydediliyor...' : 'Şifreyi Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
