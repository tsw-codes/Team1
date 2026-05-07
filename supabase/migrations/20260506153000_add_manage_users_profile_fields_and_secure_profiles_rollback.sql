BEGIN;

DROP POLICY IF EXISTS "profiles_select" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_update" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_insert" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_delete" ON profiles;

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_admin_insert" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt()->'user_metadata'->>'role')::text = 'admin'
  );

CREATE POLICY "profiles_admin_delete" ON profiles
  FOR DELETE TO authenticated
  USING (
    (auth.jwt()->'user_metadata'->>'role')::text = 'admin'
  );

DROP FUNCTION IF EXISTS is_current_user_admin();

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, username, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), 'Unknown'),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'logisticsAssociate')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER TABLE profiles
  DROP COLUMN IF EXISTS first_name,
  DROP COLUMN IF EXISTS last_name,
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS is_active;

COMMIT;
