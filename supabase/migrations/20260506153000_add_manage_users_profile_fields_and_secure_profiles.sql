BEGIN;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

UPDATE profiles p
SET
  first_name = CASE
    WHEN COALESCE(p.first_name, '') <> '' THEN p.first_name
    ELSE split_part(COALESCE(NULLIF(p.name, ''), split_part(au.email, '@', 1)), ' ', 1)
  END,
  last_name = CASE
    WHEN COALESCE(p.last_name, '') <> '' THEN p.last_name
    ELSE COALESCE(
      NULLIF(trim(substr(COALESCE(NULLIF(p.name, ''), split_part(au.email, '@', 1)), length(split_part(COALESCE(NULLIF(p.name, ''), split_part(au.email, '@', 1)), ' ', 1)) + 1)), ''),
      ''
    )
  END,
  name = COALESCE(NULLIF(p.name, ''), split_part(au.email, '@', 1)),
  email = COALESCE(p.email, au.email),
  is_active = COALESCE(p.is_active, true)
FROM auth.users au
WHERE au.id = p.id;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_name TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
BEGIN
  v_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), split_part(NEW.email, '@', 1));
  v_first_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'first_name', ''),
    split_part(v_name, ' ', 1),
    ''
  );
  v_last_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'last_name', ''),
    NULLIF(trim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), ''),
    ''
  );

  INSERT INTO profiles (id, username, first_name, last_name, name, email, role, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    v_first_name,
    v_last_name,
    v_name,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'logisticsAssociate'),
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION is_current_user_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_is_admin BOOLEAN := false;
BEGIN
  SELECT role = 'admin' AND is_active
  INTO v_is_admin
  FROM profiles
  WHERE id = auth.uid();

  RETURN COALESCE(v_is_admin, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_delete" ON profiles;

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR is_current_user_admin()
  );

CREATE POLICY "profiles_admin_update" ON profiles
  FOR UPDATE TO authenticated
  USING (is_current_user_admin())
  WITH CHECK (is_current_user_admin());

CREATE POLICY "profiles_admin_insert" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (is_current_user_admin());

CREATE POLICY "profiles_admin_delete" ON profiles
  FOR DELETE TO authenticated
  USING (is_current_user_admin());

COMMIT;
