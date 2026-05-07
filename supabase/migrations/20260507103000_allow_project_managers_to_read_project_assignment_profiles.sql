CREATE OR REPLACE FUNCTION can_current_user_read_project_assignment_profiles()
RETURNS BOOLEAN AS $$
DECLARE
  v_can_read BOOLEAN := false;
BEGIN
  SELECT role IN ('admin', 'projectManager') AND is_active
  INTO v_can_read
  FROM profiles
  WHERE id = auth.uid();

  RETURN COALESCE(v_can_read, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "profiles_select" ON profiles;

CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR is_current_user_admin()
    OR can_current_user_read_project_assignment_profiles()
  );
