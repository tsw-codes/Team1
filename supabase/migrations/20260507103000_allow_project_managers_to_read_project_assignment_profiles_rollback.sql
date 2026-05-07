DROP POLICY IF EXISTS "profiles_select" ON profiles;

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR is_current_user_admin()
  );

DROP FUNCTION IF EXISTS can_current_user_read_project_assignment_profiles();
