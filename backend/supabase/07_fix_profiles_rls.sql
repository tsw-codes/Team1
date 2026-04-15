-- Fix infinite recursion on profiles RLS policy
-- The old "profiles_admin_all" policy queried profiles to check role,
-- which caused recursion since the policy is ON profiles itself.
-- Fix: use auth.jwt() to read role from token metadata instead.

DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;

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
