-- ============================================================
-- by Fabric — Kesin Silme İzni (DELETE Policy)
-- Supabase SQL Editor'e yapıştırıp "Run" butonuna basın
-- ============================================================

-- 1. check_ins tablosunda herkesin (veya anon rolünün) silme yetkisi olduğundan emin olalım
ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "check_ins_delete_all" ON public.check_ins;
CREATE POLICY "check_ins_delete_all"
  ON public.check_ins
  FOR DELETE
  TO anon, authenticated
  USING (true);

-- 2. Doğrudan SECURITY DEFINER (Yetki baypaslı) çalışan silme fonksiyonu
CREATE OR REPLACE FUNCTION public.admin_delete_check_in(
  p_admin_id uuid,
  p_check_in_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Belirtilen ID'li kaydı kesin olarak sil
  DELETE FROM public.check_ins
  WHERE id = p_check_in_id;

  RETURN true;
END;
$$;
