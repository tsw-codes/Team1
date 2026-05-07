BEGIN;

CREATE TABLE IF NOT EXISTS project_user_assignments (
  id              SERIAL PRIMARY KEY,
  project_value   TEXT NOT NULL REFERENCES projects(value) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assignment_role TEXT NOT NULL CHECK (assignment_role IN ('projectManager', 'logisticsForeman')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_value, user_id, assignment_role)
);

ALTER TABLE project_user_assignments ENABLE ROW LEVEL SECURITY;

DROP VIEW IF EXISTS project_user_assignments_view;

CREATE VIEW project_user_assignments_view WITH (security_invoker = true) AS
SELECT
  pua.id,
  pua.project_value,
  pua.user_id,
  pua.assignment_role,
  pua.created_at,
  prof.username,
  prof.first_name,
  prof.last_name,
  prof.name,
  prof.email,
  prof.role AS user_role,
  prof.is_active
FROM project_user_assignments pua
LEFT JOIN profiles prof ON pua.user_id = prof.id;

DROP POLICY IF EXISTS "project_user_assignments_select" ON project_user_assignments;
DROP POLICY IF EXISTS "project_user_assignments_insert" ON project_user_assignments;
DROP POLICY IF EXISTS "project_user_assignments_update" ON project_user_assignments;
DROP POLICY IF EXISTS "project_user_assignments_delete" ON project_user_assignments;

CREATE POLICY "project_user_assignments_select" ON project_user_assignments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));

CREATE POLICY "project_user_assignments_insert" ON project_user_assignments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));

CREATE POLICY "project_user_assignments_update" ON project_user_assignments
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));

CREATE POLICY "project_user_assignments_delete" ON project_user_assignments
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));

COMMIT;
