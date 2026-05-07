-- Fix profiles RLS without relying on user-editable metadata.
-- The original hotfix switched to auth.jwt()->user_metadata.role, which
-- removes recursion but creates a privilege-escalation risk because
-- user_metadata is editable by end users.
--
-- Final approach:
-- - use a SECURITY DEFINER helper (is_current_user_admin)
-- - allow users to read only their own profile
-- - allow only admins to insert/update/delete profiles directly

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
    OR can_current_user_read_project_assignment_profiles()
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
