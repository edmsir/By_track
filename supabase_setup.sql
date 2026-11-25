-- ============================================================
-- by Fabric — Saha Takip & Check-in Veritabanı Kurulumu
-- Bu dosyayı Supabase Dashboard -> SQL Editor bölümüne yapıştırıp
-- "Run" butonuna basarak çalıştırın.
-- ============================================================

-- 1. Şifreleme eklentisi (bcrypt için)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Kullanıcılar tablosu (E-posta zorunluluğu yok, kullanıcı adı + şifre)
CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  full_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'rep' CHECK (role IN ('admin', 'rep')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Check-in (Konum Paylaşımı) tablosu
CREATE TABLE IF NOT EXISTS public.check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  username text NOT NULL,
  full_name text NOT NULL,
  customer_name text NOT NULL,
  note text,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  accuracy double precision,
  is_mock boolean DEFAULT false,
  network_city text,
  reverse_city text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Kolonların mevcut tablolarda da olmasını sağla
ALTER TABLE public.check_ins ADD COLUMN IF NOT EXISTS is_mock boolean DEFAULT false;
ALTER TABLE public.check_ins ADD COLUMN IF NOT EXISTS network_city text;
ALTER TABLE public.check_ins ADD COLUMN IF NOT EXISTS reverse_city text;

CREATE INDEX IF NOT EXISTS idx_check_ins_created_at ON public.check_ins (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_check_ins_user_id ON public.check_ins (user_id, created_at DESC);

-- 4. RLS (Row Level Security)
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "check_ins_select_all" ON public.check_ins;
CREATE POLICY "check_ins_select_all"
  ON public.check_ins
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "check_ins_delete_all" ON public.check_ins;
CREATE POLICY "check_ins_delete_all"
  ON public.check_ins
  FOR DELETE
  TO anon, authenticated
  USING (true);

-- 5. Giriş Fonksiyonu (Kullanıcı adı + Şifre)
CREATE OR REPLACE FUNCTION public.login_user(
  p_username text,
  p_password text
)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  role text,
  is_active boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user public.app_users%ROWTYPE;
  v_clean_username text;
BEGIN
  v_clean_username := lower(trim(p_username));

  SELECT * INTO v_user
  FROM public.app_users u
  WHERE u.username = v_clean_username;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kullanıcı adı veya şifre hatalı.';
  END IF;

  IF v_user.password_hash <> crypt(p_password, v_user.password_hash) THEN
    RAISE EXCEPTION 'Kullanıcı adı veya şifre hatalı.';
  END IF;

  IF NOT v_user.is_active THEN
    RAISE EXCEPTION 'Hesabınız pasif durumda. Yöneticinizle iletişime geçin.';
  END IF;

  RETURN QUERY
  SELECT v_user.id, v_user.username, v_user.full_name, v_user.role, v_user.is_active, v_user.created_at;
END;
$$;

-- 6. Admin Yetki Kontrol Yardımcısı
CREATE OR REPLACE FUNCTION public._assert_admin(p_admin_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE id = p_admin_id AND role = 'admin' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Bu işlem için yönetici yetkisi gerekiyor.';
  END IF;
END;
$$;

-- 7. Kullanıcı Listeleme (Sadece Admin)
CREATE OR REPLACE FUNCTION public.admin_list_users(p_admin_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  role text,
  is_active boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_admin(p_admin_id);

  RETURN QUERY
  SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.created_at
  FROM public.app_users u
  ORDER BY u.role ASC, u.created_at DESC;
END;
$$;

-- 8. Yeni Kullanıcı Oluşturma (Sadece Admin)
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_admin_id uuid,
  p_username text,
  p_full_name text,
  p_password text,
  p_role text DEFAULT 'rep'
)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  role text,
  is_active boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_clean_username text;
  v_new public.app_users%ROWTYPE;
BEGIN
  PERFORM public._assert_admin(p_admin_id);

  v_clean_username := lower(trim(p_username));

  IF length(v_clean_username) < 2 THEN
    RAISE EXCEPTION 'Kullanıcı adı en az 2 karakter olmalıdır.';
  END IF;

  IF length(trim(p_full_name)) < 2 THEN
    RAISE EXCEPTION 'Ad Soyad en az 2 karakter olmalıdır.';
  END IF;

  IF length(p_password) < 4 THEN
    RAISE EXCEPTION 'Şifre en az 4 karakter olmalıdır.';
  END IF;

  IF p_role NOT IN ('admin', 'rep') THEN
    RAISE EXCEPTION 'Geçersiz rol.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.app_users u WHERE u.username = v_clean_username) THEN
    RAISE EXCEPTION 'Bu kullanıcı adı zaten kullanılıyor.';
  END IF;

  INSERT INTO public.app_users (username, full_name, password_hash, role)
  VALUES (v_clean_username, trim(p_full_name), crypt(p_password, gen_salt('bf')), p_role)
  RETURNING * INTO v_new;

  RETURN QUERY
  SELECT v_new.id, v_new.username, v_new.full_name, v_new.role, v_new.is_active, v_new.created_at;
END;
$$;

-- 9. Kullanıcı Aktif / Pasif Yapma (Sadece Admin)
CREATE OR REPLACE FUNCTION public.admin_toggle_user(
  p_admin_id uuid,
  p_target_user_id uuid,
  p_is_active boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_admin(p_admin_id);

  IF p_admin_id = p_target_user_id AND NOT p_is_active THEN
    RAISE EXCEPTION 'Kendi yönetici hesabınızı pasife alamazsınız.';
  END IF;

  UPDATE public.app_users
  SET is_active = p_is_active
  WHERE id = p_target_user_id;
END;
$$;

-- 10. Kullanıcı Şifre Sıfırlama (Sadece Admin)
CREATE OR REPLACE FUNCTION public.admin_reset_password(
  p_admin_id uuid,
  p_target_user_id uuid,
  p_new_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public._assert_admin(p_admin_id);

  IF length(p_new_password) < 4 THEN
    RAISE EXCEPTION 'Yeni şifre en az 4 karakter olmalıdır.';
  END IF;

  UPDATE public.app_users
  SET password_hash = crypt(p_new_password, gen_salt('bf'))
  WHERE id = p_target_user_id;
END;
$$;

-- 11. Kullanıcı Silme (Sadece Admin)
CREATE OR REPLACE FUNCTION public.admin_delete_user(
  p_admin_id uuid,
  p_target_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_admin(p_admin_id);

  IF p_admin_id = p_target_user_id THEN
    RAISE EXCEPTION 'Kendi yönetici hesabınızı silemezsiniz.';
  END IF;

  DELETE FROM public.app_users
  WHERE id = p_target_user_id;
END;
$$;

-- 12. Check-in Kaydı Oluşturma (Fake GPS & IP verisi ile)
CREATE OR REPLACE FUNCTION public.create_check_in(
  p_user_id uuid,
  p_customer_name text,
  p_note text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision DEFAULT NULL,
  p_is_mock boolean DEFAULT false,
  p_network_city text DEFAULT NULL,
  p_reverse_city text DEFAULT NULL
)
RETURNS public.check_ins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.app_users%ROWTYPE;
  v_row public.check_ins%ROWTYPE;
BEGIN
  SELECT * INTO v_user
  FROM public.app_users
  WHERE id = p_user_id AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı veya hesabı pasif.';
  END IF;

  IF length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'Lütfen geçerli bir müşteri adı girin.';
  END IF;

  INSERT INTO public.check_ins (
    user_id, username, full_name, customer_name, note, latitude, longitude, accuracy,
    is_mock, network_city, reverse_city
  )
  VALUES (
    v_user.id,
    v_user.username,
    v_user.full_name,
    trim(p_customer_name),
    NULLIF(trim(COALESCE(p_note, '')), ''),
    p_latitude,
    p_longitude,
    p_accuracy,
    COALESCE(p_is_mock, false),
    p_network_city,
    p_reverse_city
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- 13. Admin: Tekil Check-in Bildirimi Silme (Hatalı / Test kayıtları için)
CREATE OR REPLACE FUNCTION public.admin_delete_check_in(
  p_admin_id uuid,
  p_check_in_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_admin(p_admin_id);

  DELETE FROM public.check_ins
  WHERE id = p_check_in_id;
END;
$$;

-- 14. Admin: Toplu Bildirim Temizleme (Örn. tüm testleri veya bir temsilcinin kayıtlarını silme)
CREATE OR REPLACE FUNCTION public.admin_bulk_delete_check_ins(
  p_admin_id uuid,
  p_target_username text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM public._assert_admin(p_admin_id);

  IF p_target_username IS NOT NULL AND p_target_username <> 'all' THEN
    DELETE FROM public.check_ins WHERE username = p_target_username;
  ELSE
    DELETE FROM public.check_ins;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 15. Varsayılan Admin Kullanıcısı (Kullanıcı adı: admin | Şifre: 123456)
INSERT INTO public.app_users (username, full_name, password_hash, role)
VALUES ('admin', 'Sistem Yöneticisi', crypt('123456', gen_salt('bf')), 'admin')
ON CONFLICT (username) DO NOTHING;

-- 16. Anlık Sesli Bildirim için Realtime Yayınını Aç
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.check_ins;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
