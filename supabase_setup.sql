-- ============================================================
-- by Fabric — Çok Kademeli Hiyerarşik Rol & Şube Mimarisi (v2.3)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- !! Eski fonksiyon imzalarını tamamen temizle (ambiguous id hatasını önler)
DROP FUNCTION IF EXISTS public.admin_list_users(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_create_user(uuid, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.admin_create_user(uuid, text, text, text, text, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_update_user(uuid, uuid, text, text, text, uuid, text, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.admin_reset_password(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.admin_toggle_user(uuid, uuid, boolean) CASCADE;
DROP FUNCTION IF EXISTS public.admin_delete_user(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_delete_check_in(uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.admin_delete_check_in(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.get_authorized_check_ins(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.create_check_in(uuid, text, text, double precision, double precision, double precision, boolean, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.create_check_in(uuid, text, text, double precision, double precision, double precision, boolean, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.login_user(text, text) CASCADE;
DROP FUNCTION IF EXISTS public.get_branches() CASCADE;
DROP FUNCTION IF EXISTS public.admin_create_branch(uuid, text, text) CASCADE;

-- 1. Şubeler Tablosu
CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  city text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Varsayılan Örnek Şubeler
INSERT INTO public.branches (name, city) VALUES 
  ('Merkez Şube', 'İstanbul'),
  ('Anadolu Şube', 'Kayseri'),
  ('Ege Şube', 'İzmir'),
  ('Marmara Şube', 'Bursa'),
  ('Akdeniz Şube', 'Antalya')
ON CONFLICT (name) DO NOTHING;

-- 2. app_users Tablosu ve Güncellemeler
CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  full_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'rep',
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE public.app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('admin', 'yonetim', 'mudur', 'rep'));

-- 3. check_ins Tablosu ve Güncellemeler (Belge & Evrak alanları dahil)
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
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  is_mock boolean DEFAULT false,
  network_city text,
  reverse_city text,
  document_type text,
  document_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.check_ins ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
ALTER TABLE public.check_ins ADD COLUMN IF NOT EXISTS document_type text;
ALTER TABLE public.check_ins ADD COLUMN IF NOT EXISTS document_url text;

CREATE INDEX IF NOT EXISTS idx_check_ins_branch_id ON public.check_ins (branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_check_ins_user_id ON public.check_ins (user_id, created_at DESC);

-- 4. RLS ve İzinler (DELETE ve SELECT kesin açık)
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "check_ins_select_all" ON public.check_ins;
CREATE POLICY "check_ins_select_all" ON public.check_ins FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "check_ins_delete_all" ON public.check_ins;
CREATE POLICY "check_ins_delete_all" ON public.check_ins FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "branches_select_all" ON public.branches;
CREATE POLICY "branches_select_all" ON public.branches FOR SELECT TO anon, authenticated USING (true);

-- 5. Şube Listeleme
DROP FUNCTION IF EXISTS public.get_branches();
CREATE OR REPLACE FUNCTION public.get_branches()
RETURNS TABLE (
  id uuid,
  name text,
  city text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.id, b.name, b.city FROM public.branches b ORDER BY b.name ASC;
$$;

-- 6. Şube Ekleme (Sadece Admin)
DROP FUNCTION IF EXISTS public.admin_create_branch(uuid, text, text);
CREATE OR REPLACE FUNCTION public.admin_create_branch(
  p_admin_id uuid,
  p_name text,
  p_city text DEFAULT NULL
)
RETURNS public.branches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch public.branches%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_users u WHERE u.id = p_admin_id AND u.role = 'admin' AND u.is_active = true) THEN
    RAISE EXCEPTION 'Bu işlem için admin yetkisi gerekiyor.';
  END IF;

  INSERT INTO public.branches (name, city)
  VALUES (trim(p_name), trim(p_city))
  RETURNING * INTO v_branch;

  RETURN v_branch;
END;
$$;

-- 7. Giriş Fonksiyonu (login_user)
DROP FUNCTION IF EXISTS public.login_user(text, text);
CREATE OR REPLACE FUNCTION public.login_user(
  p_username text,
  p_password text
)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  role text,
  branch_id uuid,
  branch_name text,
  is_active boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user public.app_users%ROWTYPE;
  v_branch_name text;
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

  SELECT b.name INTO v_branch_name FROM public.branches b WHERE b.id = v_user.branch_id;

  RETURN QUERY
  SELECT v_user.id, v_user.username, v_user.full_name, v_user.role, v_user.branch_id, v_branch_name, v_user.is_active, v_user.created_at;
END;
$$;

-- 8. Hiyerarşik Check-in Listeleme (get_authorized_check_ins)
DROP FUNCTION IF EXISTS public.get_authorized_check_ins(uuid);
CREATE OR REPLACE FUNCTION public.get_authorized_check_ins(
  p_requester_id uuid
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  username text,
  full_name text,
  customer_name text,
  note text,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  branch_id uuid,
  branch_name text,
  is_mock boolean,
  network_city text,
  reverse_city text,
  document_type text,
  document_url text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.app_users u WHERE u.id = p_requester_id AND u.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı veya pasif.';
  END IF;

  IF v_req.role IN ('admin', 'yonetim') THEN
    RETURN QUERY
    SELECT c.id, c.user_id, c.username, c.full_name, c.customer_name, c.note,
           c.latitude, c.longitude, c.accuracy, c.branch_id, b.name AS branch_name,
           c.is_mock, c.network_city, c.reverse_city, c.document_type, c.document_url, c.created_at
    FROM public.check_ins c
    LEFT JOIN public.branches b ON b.id = c.branch_id
    ORDER BY c.created_at DESC
    LIMIT 600;

  ELSIF v_req.role = 'mudur' THEN
    RETURN QUERY
    SELECT c.id, c.user_id, c.username, c.full_name, c.customer_name, c.note,
           c.latitude, c.longitude, c.accuracy, c.branch_id, b.name AS branch_name,
           c.is_mock, c.network_city, c.reverse_city, c.document_type, c.document_url, c.created_at
    FROM public.check_ins c
    LEFT JOIN public.branches b ON b.id = c.branch_id
    WHERE c.branch_id = v_req.branch_id
    ORDER BY c.created_at DESC
    LIMIT 600;

  ELSE
    RETURN QUERY
    SELECT c.id, c.user_id, c.username, c.full_name, c.customer_name, c.note,
           c.latitude, c.longitude, c.accuracy, c.branch_id, b.name AS branch_name,
           c.is_mock, c.network_city, c.reverse_city, c.document_type, c.document_url, c.created_at
    FROM public.check_ins c
    LEFT JOIN public.branches b ON b.id = c.branch_id
    WHERE c.user_id = v_req.id
    ORDER BY c.created_at DESC
    LIMIT 150;
  END IF;
END;
$$;

-- 9. Check-in Kaydetme (Belge & Evrak Destekli)
DROP FUNCTION IF EXISTS public.create_check_in(uuid, text, text, double precision, double precision, double precision, boolean, text, text);
DROP FUNCTION IF EXISTS public.create_check_in(uuid, text, text, double precision, double precision, double precision, boolean, text, text, text, text);
CREATE OR REPLACE FUNCTION public.create_check_in(
  p_user_id uuid,
  p_customer_name text,
  p_note text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision DEFAULT NULL,
  p_is_mock boolean DEFAULT false,
  p_network_city text DEFAULT NULL,
  p_reverse_city text DEFAULT NULL,
  p_document_type text DEFAULT NULL,
  p_document_url text DEFAULT NULL
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
  FROM public.app_users u
  WHERE u.id = p_user_id AND u.is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı veya hesabı pasif.';
  END IF;

  IF length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'Lütfen geçerli bir müşteri adı girin.';
  END IF;

  INSERT INTO public.check_ins (
    user_id, username, full_name, customer_name, note, latitude, longitude, accuracy,
    branch_id, is_mock, network_city, reverse_city, document_type, document_url
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
    v_user.branch_id,
    COALESCE(p_is_mock, false),
    p_network_city,
    p_reverse_city,
    NULLIF(trim(COALESCE(p_document_type, '')), ''),
    p_document_url
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- 10. Kullanıcı Listeleme (admin_list_users)
DROP FUNCTION IF EXISTS public.admin_list_users(uuid);
CREATE OR REPLACE FUNCTION public.admin_list_users(p_admin_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  role text,
  branch_id uuid,
  branch_name text,
  is_active boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.app_users u WHERE u.id = p_admin_id AND u.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kullanıcı yetkisi bulunamadı.';
  END IF;

  IF v_req.role = 'admin' THEN
    RETURN QUERY
    SELECT u.id, u.username, u.full_name, u.role, u.branch_id, b.name AS branch_name, u.is_active, u.created_at
    FROM public.app_users u
    LEFT JOIN public.branches b ON b.id = u.branch_id
    ORDER BY u.role ASC, u.created_at DESC;

  ELSIF v_req.role = 'mudur' THEN
    RETURN QUERY
    SELECT u.id, u.username, u.full_name, u.role, u.branch_id, b.name AS branch_name, u.is_active, u.created_at
    FROM public.app_users u
    LEFT JOIN public.branches b ON b.id = u.branch_id
    WHERE u.branch_id = v_req.branch_id AND u.role = 'rep'
    ORDER BY u.created_at DESC;

  ELSE
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;
END;
$$;

-- 11. Kullanıcı Oluşturma (admin_create_user)
DROP FUNCTION IF EXISTS public.admin_create_user(uuid, text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_create_user(uuid, text, text, text, text, uuid);
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_admin_id uuid,
  p_username text,
  p_full_name text,
  p_password text,
  p_role text DEFAULT 'rep',
  p_branch_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  username text,
  full_name text,
  role text,
  branch_id uuid,
  is_active boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_req public.app_users%ROWTYPE;
  v_clean_username text;
  v_assigned_branch uuid;
  v_new public.app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.app_users u WHERE u.id = p_admin_id AND u.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Yetkisiz işlem.';
  END IF;

  v_clean_username := lower(trim(p_username));
  v_assigned_branch := p_branch_id;

  IF v_req.role = 'mudur' THEN
    IF p_role <> 'rep' THEN
      RAISE EXCEPTION 'Şube müdürleri sadece satış temsilcisi ekleyebilir.';
    END IF;
    v_assigned_branch := v_req.branch_id;
  ELSIF v_req.role <> 'admin' THEN
    RAISE EXCEPTION 'Kullanıcı oluşturma yetkiniz yok.';
  END IF;

  IF length(v_clean_username) < 2 THEN
    RAISE EXCEPTION 'Kullanıcı adı en az 2 karakter olmalıdır.';
  END IF;
  IF length(p_password) < 4 THEN
    RAISE EXCEPTION 'Şifre en az 4 karakter olmalıdır.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_users u WHERE u.username = v_clean_username) THEN
    RAISE EXCEPTION 'Bu kullanıcı adı zaten kullanılıyor.';
  END IF;

  INSERT INTO public.app_users (username, full_name, password_hash, role, branch_id)
  VALUES (v_clean_username, trim(p_full_name), crypt(p_password, gen_salt('bf')), p_role, v_assigned_branch)
  RETURNING * INTO v_new;

  RETURN QUERY
  SELECT v_new.id, v_new.username, v_new.full_name, v_new.role, v_new.branch_id, v_new.is_active, v_new.created_at;
END;
$$;

-- 12. Tam Kullanıcı Düzenleme (admin_update_user - Ad, Kullanıcı Adı, Şifre, Rol, Şube, Durum)
DROP FUNCTION IF EXISTS public.admin_update_user(uuid, uuid, text, text, text, uuid, text, boolean);
CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_admin_id uuid,
  p_target_user_id uuid,
  p_full_name text,
  p_username text,
  p_role text,
  p_branch_id uuid,
  p_password text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_req public.app_users%ROWTYPE;
  v_target public.app_users%ROWTYPE;
  v_clean_username text;
  v_role text;
  v_branch uuid;
BEGIN
  SELECT * INTO v_req FROM public.app_users u WHERE u.id = p_admin_id AND u.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Yetkisiz işlem.';
  END IF;

  SELECT * INTO v_target FROM public.app_users u WHERE u.id = p_target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Güncellenecek kullanıcı bulunamadı.';
  END IF;

  v_clean_username := lower(trim(p_username));
  IF length(v_clean_username) < 2 THEN
    RAISE EXCEPTION 'Kullanıcı adı en az 2 karakter olmalıdır.';
  END IF;

  -- Başka birinin kullanıcı adını almasını engelle
  IF v_clean_username <> v_target.username AND EXISTS (SELECT 1 FROM public.app_users u WHERE u.username = v_clean_username) THEN
    RAISE EXCEPTION 'Bu kullanıcı adı başka bir kullanıcı tarafından kullanılıyor.';
  END IF;

  -- Yetki ve Rol ayrımı
  IF v_req.role = 'mudur' THEN
    IF v_target.role <> 'rep' OR v_target.branch_id IS DISTINCT FROM v_req.branch_id THEN
      RAISE EXCEPTION 'Sadece kendi şubenizdeki satış temsilcilerini düzenleyebilirsiniz.';
    END IF;
    v_role := 'rep';
    v_branch := v_req.branch_id;
  ELSIF v_req.role = 'admin' THEN
    v_role := p_role;
    v_branch := p_branch_id;
  ELSE
    RAISE EXCEPTION 'Kullanıcı düzenleme yetkiniz yok.';
  END IF;

  -- Kullanıcı temel bilgilerini güncelle
  UPDATE public.app_users u
  SET full_name = trim(p_full_name),
      username = v_clean_username,
      role = v_role,
      branch_id = v_branch,
      is_active = COALESCE(p_is_active, u.is_active)
  WHERE u.id = p_target_user_id;

  -- Şifre de girilmişse güncelle
  IF p_password IS NOT NULL AND length(trim(p_password)) >= 4 THEN
    UPDATE public.app_users u
    SET password_hash = crypt(trim(p_password), gen_salt('bf'))
    WHERE u.id = p_target_user_id;
  END IF;

  RETURN true;
END;
$$;

-- 13. Şifre Sıfırlama (admin_reset_password)
DROP FUNCTION IF EXISTS public.admin_reset_password(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.admin_reset_password(
  p_admin_id uuid,
  p_target_user_id uuid,
  p_new_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_req public.app_users%ROWTYPE;
  v_target public.app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.app_users u WHERE u.id = p_admin_id AND u.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Yetkisiz işlem.';
  END IF;

  SELECT * INTO v_target FROM public.app_users u WHERE u.id = p_target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı.';
  END IF;

  IF length(p_new_password) < 4 THEN
    RAISE EXCEPTION 'Şifre en az 4 karakter olmalıdır.';
  END IF;

  IF v_req.role = 'mudur' THEN
    IF v_target.role <> 'rep' OR v_target.branch_id IS DISTINCT FROM v_req.branch_id THEN
      RAISE EXCEPTION 'Sadece kendi şubenizdeki satış temsilcilerinin şifresini değiştirebilirsiniz.';
    END IF;
  ELSIF v_req.role <> 'admin' THEN
    RAISE EXCEPTION 'Şifre sıfırlama yetkiniz yok.';
  END IF;

  UPDATE public.app_users u
  SET password_hash = crypt(p_new_password, gen_salt('bf'))
  WHERE u.id = p_target_user_id;

  RETURN true;
END;
$$;

-- 14. Kullanıcı Aktif/Pasif Durumu Değiştirme (admin_toggle_user)
DROP FUNCTION IF EXISTS public.admin_toggle_user(uuid, uuid, boolean);
CREATE OR REPLACE FUNCTION public.admin_toggle_user(
  p_admin_id uuid,
  p_target_user_id uuid,
  p_is_active boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.app_users%ROWTYPE;
  v_target public.app_users%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.app_users u WHERE u.id = p_admin_id AND u.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Yetkisiz işlem.';
  END IF;

  IF p_admin_id = p_target_user_id THEN
    RAISE EXCEPTION 'Kendi hesabınızın durumunu değiştiremezsiniz.';
  END IF;

  SELECT * INTO v_target FROM public.app_users u WHERE u.id = p_target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı.';
  END IF;

  IF v_req.role = 'mudur' THEN
    IF v_target.role <> 'rep' OR v_target.branch_id IS DISTINCT FROM v_req.branch_id THEN
      RAISE EXCEPTION 'Sadece kendi şubenizdeki personeli yönetebilirsiniz.';
    END IF;
  ELSIF v_req.role <> 'admin' THEN
    RAISE EXCEPTION 'Kullanıcı durumu değiştirme yetkiniz yok.';
  END IF;

  UPDATE public.app_users u
  SET is_active = p_is_active
  WHERE u.id = p_target_user_id;

  RETURN true;
END;
$$;

-- 15. Kullanıcı Silme (admin_delete_user - Sadece Admin)
DROP FUNCTION IF EXISTS public.admin_delete_user(uuid, uuid);
CREATE OR REPLACE FUNCTION public.admin_delete_user(
  p_admin_id uuid,
  p_target_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.app_users u WHERE u.id = p_admin_id AND u.role = 'admin' AND u.is_active = true) THEN
    RAISE EXCEPTION 'Kullanıcı silme yetkisi sadece sistem yöneticisindedir.';
  END IF;

  IF p_admin_id = p_target_user_id THEN
    RAISE EXCEPTION 'Kendi hesabınızı silemezsiniz.';
  END IF;

  DELETE FROM public.app_users u WHERE u.id = p_target_user_id;
  RETURN true;
END;
$$;

-- 16. Check-in Silme (admin_delete_check_in)
DROP FUNCTION IF EXISTS public.admin_delete_check_in(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_delete_check_in(uuid);
CREATE OR REPLACE FUNCTION public.admin_delete_check_in(
  p_admin_id uuid,
  p_check_in_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.app_users%ROWTYPE;
  v_ci public.check_ins%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.app_users u WHERE u.id = p_admin_id AND u.is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Yetkisiz işlem.';
  END IF;

  SELECT * INTO v_ci FROM public.check_ins c WHERE c.id = p_check_in_id;
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  IF v_req.role = 'admin' THEN
    DELETE FROM public.check_ins c WHERE c.id = p_check_in_id;
  ELSIF v_req.role = 'mudur' THEN
    IF v_ci.branch_id IS DISTINCT FROM v_req.branch_id THEN
      RAISE EXCEPTION 'Sadece kendi şubenize ait bildirimleri silebilirsiniz.';
    END IF;
    DELETE FROM public.check_ins c WHERE c.id = p_check_in_id;
  ELSE
    RAISE EXCEPTION 'Bildirim silme yetkiniz yok.';
  END IF;

  RETURN true;
END;
$$;

-- 17. Varsayılan Admin Hesabı (admin / 123456)
INSERT INTO public.app_users (username, full_name, password_hash, role)
VALUES ('admin', 'Sistem Yöneticisi', crypt('123456', gen_salt('bf')), 'admin')
ON CONFLICT (username) DO NOTHING;

-- 18. Realtime Yayın
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.check_ins;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
