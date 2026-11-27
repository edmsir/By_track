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
  Building2,
  Briefcase,
  Pencil,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function UserManagement({ adminUser }) {
  const [users, setUsers] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // New user form
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('rep')
  const [selectedBranch, setSelectedBranch] = useState(
    adminUser.role === 'mudur' ? adminUser.branch_id || '' : ''
  )
  const [creating, setCreating] = useState(false)

  // Password reset modal state
  const [resetTarget, setResetTarget] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  // Edit user modal state
  const [editTarget, setEditTarget] = useState(null)
  const [editForm, setEditForm] = useState({
    full_name: '',
    username: '',
    password: '',
    role: 'rep',
    branch_id: '',
  })
  const [saving, setSaving] = useState(false)

  const isMudur = adminUser.role === 'mudur'
  const isAdmin = adminUser.role === 'admin'

  const loadBranches = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('get_branches')
      if (data && data.length > 0) {
        setBranches(data)
        if (!isMudur && !selectedBranch) {
          setSelectedBranch(data[0].id)
        }
      }
    } catch (e) {
      console.warn('Şubeler alınamadı:', e)
    }
  }, [isMudur, selectedBranch])

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
    loadBranches()
    loadUsers()
  }, [loadBranches, loadUsers])

  async function handleCreateUser(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (fullName.trim().length < 2 || username.trim().length < 2 || password.length < 4) {
      setError('Ad Soyad (min 2), Kullanıcı Adı (min 2) ve Şifre (min 4 karakter) zorunludur.')
      return
    }

    const targetBranch = isMudur ? adminUser.branch_id : (selectedBranch || null)
    const targetRole = isMudur ? 'rep' : role

    setCreating(true)
    try {
      const { error: rpcError } = await supabase.rpc('admin_create_user', {
        p_admin_id: adminUser.id,
        p_username: username.trim(),
        p_full_name: fullName.trim(),
        p_password: password,
        p_role: targetRole,
        p_branch_id: targetBranch,
      })
      if (rpcError) throw rpcError

      setSuccess(`"${fullName.trim()}" (@${username.trim().toLowerCase()}) başarıyla oluşturuldu.`)
      setFullName('')
      setUsername('')
      setPassword('')
      if (!isMudur) setRole('rep')
      await loadUsers()
      setTimeout(() => setSuccess(''), 4500)
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

      setSuccess(`"${resetTarget.full_name}" kullanıcısının şifresi başarıyla güncellendi.`)
      setResetTarget(null)
      setNewPassword('')
      setTimeout(() => setSuccess(''), 4500)
    } catch (err) {
      setError(err.message || 'Şifre sıfırlanamadı.')
    } finally {
      setResetting(false)
    }
  }

  async function handleDeleteUser(target) {
    const confirmed = window.confirm(
      `"${target.full_name}" (@${target.username}) kullanıcısını ve tüm verilerini kalıcı olarak silmek istediğinize emin misiniz?`
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

  // ── Edit modal ──────────────────────────────────────────────
  function openEditModal(u) {
    setEditTarget(u)
    setEditForm({
      full_name: u.full_name,
      username: u.username,
      password: '',
      role: u.role,
      branch_id: u.branch_id || '',
    })
    setError('')
    setSuccess('')
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    if (!editTarget) return
    if (editForm.full_name.trim().length < 2) {
      setError('Ad Soyad en az 2 karakter olmalıdır.')
      return
    }
    if (editForm.username.trim().length < 2) {
      setError('Kullanıcı adı en az 2 karakter olmalıdır.')
      return
    }
    if (editForm.password && editForm.password.length < 4) {
      setError('Şifre girilecekse en az 4 karakter olmalıdır.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('admin_update_user', {
        p_admin_id: adminUser.id,
        p_target_user_id: editTarget.id,
        p_full_name: editForm.full_name.trim(),
        p_username: editForm.username.trim().toLowerCase(),
        p_role: isAdmin ? editForm.role : 'rep',
        p_branch_id: isAdmin ? (editForm.branch_id || null) : adminUser.branch_id,
        p_password: editForm.password ? editForm.password : null,
        p_is_active: editTarget.is_active,
      })
      if (rpcError) throw rpcError

      setSuccess(`"${editForm.full_name.trim()}" kullanıcısı başarıyla güncellendi.`)
      setEditTarget(null)
      await loadUsers()
      setTimeout(() => setSuccess(''), 4500)
    } catch (err) {
      setError(err.message || 'Kullanıcı güncellenemedi.')
    } finally {
      setSaving(false)
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
                {isMudur ? 'Şubenize Satış Temsilcisi Ekle' : 'Yeni Kullanıcı Oluştur'}
              </h3>
              <p className="text-xs text-stone-500">
                {isMudur
                  ? `${adminUser.branch_name || 'Şubeniz'} için saha personeli tanımlayın`
                  : 'Sistem personeli ve yetki rollerini tanımlayın'}
              </p>
            </div>
          </div>

          {isMudur && (
            <div className="mb-4 p-3 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center gap-2">
              <Building2 className="w-4 h-4 shrink-0 text-blue-600" />
              <span>
                <strong>{adminUser.branch_name || 'Şubeniz'}</strong> Şube Müdürü olarak sadece kendi şubenize satış personeli açabilir ve şifre değiştirebilirsiniz.
              </span>
            </div>
          )}

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
                placeholder="Örn: Mehmet Aksoy"
                className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:bg-white focus:border-[#C81D77]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                Kullanıcı Adı (Giriş için)
              </label>
              <input
                type="text"
                autoCapitalize="none"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ''))}
                placeholder="Örn: mehmet"
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

            {/* Role & Branch Selection */}
            {!isMudur ? (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                    Yetki Rolü
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:bg-white focus:border-[#C81D77]"
                  >
                    <option value="rep">Satış Temsilcisi (Saha Ekibi)</option>
                    <option value="mudur">Şube Müdürü (Kendi Şubesini Yönetir)</option>
                    <option value="yonetim">Genel Yönetim (Tüm Şubeleri İzler / Raporlar)</option>
                    <option value="admin">Sistem Yöneticisi (Admin)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                    Bağlı Olduğu Şube
                  </label>
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:bg-white focus:border-[#C81D77]"
                  >
                    <option value="">Şube Yok / Genel Merkez</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.city || 'Belirtilmemiş'})
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1 text-stone-600">
                <p>
                  <strong>Rol:</strong> Satış Temsilcisi (Saha Ekibi)
                </p>
                <p>
                  <strong>Şube:</strong> {adminUser.branch_name || 'Şubeniz'}
                </p>
              </div>
            )}

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
                {isMudur
                  ? `${adminUser.branch_name || 'Şube'} Satış Ekibi (${users.length})`
                  : `Kayıtlı Kullanıcılar (${users.length})`}
              </h3>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-stone-500">
              Kullanıcılar yükleniyor...
            </div>
          ) : users.length === 0 ? (
            <div className="py-10 text-center text-sm text-stone-500">
              Henüz kayıtlı kullanıcı bulunmuyor.
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
                            : u.role === 'yonetim'
                            ? 'bg-purple-100 text-purple-700'
                            : u.role === 'mudur'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-[#94C11F]/20 text-[#5D7B10]'
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
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#C81D77]/10 text-[#C81D77]">
                              <Shield className="w-3 h-3" />
                              Admin
                            </span>
                          )}

                          {u.role === 'yonetim' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 text-purple-700">
                              <Building2 className="w-3 h-3" />
                              Yönetim
                            </span>
                          )}

                          {u.role === 'mudur' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700">
                              <Briefcase className="w-3 h-3" />
                              Şube Müdürü
                            </span>
                          )}

                          {u.role === 'rep' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#94C11F]/20 text-[#49650b]">
                              Satışçı
                            </span>
                          )}

                          {u.branch_name && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-stone-100 text-stone-600 border border-stone-200">
                              🏢 {u.branch_name}
                            </span>
                          )}

                          {!u.is_active && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-200 text-stone-600">
                              Pasif
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-stone-500 font-mono-tech mt-0.5">
                          @{u.username}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      {/* Düzenle butonu — sadece kendi kendine değil, yönetilebilir kullanıcılara */}
                      {!isSelf && (u.role === 'rep' || isAdmin) && (
                        <button
                          type="button"
                          onClick={() => openEditModal(u)}
                          title="Kullanıcıyı Düzenle"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Düzenle</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setResetTarget(u)
                          setNewPassword('')
                        }}
                        title="Şifre Değiştir"
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
                                <span>Dondur</span>
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>Aktif Et</span>
                              </>
                            )}
                          </button>

                          {/* Sadece Admin Kullanıcı Silebilir; Şube Müdürü Silemez */}
                          {!isMudur && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u)}
                              title="Kullanıcıyı Sil"
                              className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 transition cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
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

      {/* Edit User Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="font-bold text-stone-900 text-base">Kullanıcıyı Düzenle</h4>
                <p className="text-xs text-stone-500 mt-0.5">@{editTarget.username}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditTarget(null)}
                className="p-2 rounded-xl hover:bg-stone-100 text-stone-500 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              {/* Ad Soyad */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                  Ad Soyad
                </label>
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:bg-white focus:border-[#C81D77]"
                />
              </div>

              {/* Kullanıcı Adı */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                  Kullanıcı Adı
                </label>
                <input
                  type="text"
                  autoCapitalize="none"
                  value={editForm.username}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, username: e.target.value.replace(/\s+/g, '') }))
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:bg-white focus:border-[#C81D77]"
                />
              </div>

              {/* Şifre (opsiyonel) */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                  Yeni Şifre{' '}
                  <span className="normal-case font-normal text-stone-400">(boş bırakılırsa değişmez)</span>
                </label>
                <input
                  type="text"
                  value={editForm.password}
                  onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Boş bırakın → mevcut şifre korunur"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:bg-white focus:border-[#C81D77]"
                />
              </div>

              {/* Rol & Şube — sadece admin görebilir */}
              {isAdmin && (
                <>
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                      Yetki Rolü
                    </label>
                    <select
                      value={editForm.role}
                      onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:bg-white focus:border-[#C81D77]"
                    >
                      <option value="rep">Satış Temsilcisi (Saha Ekibi)</option>
                      <option value="mudur">Şube Müdürü</option>
                      <option value="yonetim">Genel Yönetim</option>
                      <option value="admin">Sistem Yöneticisi (Admin)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-stone-500 mb-1">
                      Bağlı Olduğu Şube
                    </label>
                    <select
                      value={editForm.branch_id}
                      onChange={(e) => setEditForm((f) => ({ ...f, branch_id: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200 text-sm focus:outline-none focus:bg-white focus:border-[#C81D77]"
                    >
                      <option value="">Şube Yok / Genel Merkez</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.city || 'Belirtilmemiş'})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-stone-600 hover:bg-stone-100 cursor-pointer"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-[#C81D77] hover:bg-[#B01767] text-white cursor-pointer disabled:opacity-60 flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Kaydediliyor...
                    </>
                  ) : (
                    'Değişiklikleri Kaydet'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
