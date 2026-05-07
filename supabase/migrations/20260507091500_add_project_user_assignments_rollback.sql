BEGIN;

DROP POLICY IF EXISTS "project_user_assignments_select" ON project_user_assignments;
DROP POLICY IF EXISTS "project_user_assignments_insert" ON project_user_assignments;
DROP POLICY IF EXISTS "project_user_assignments_update" ON project_user_assignments;
DROP POLICY IF EXISTS "project_user_assignments_delete" ON project_user_assignments;

DROP VIEW IF EXISTS project_user_assignments_view;
DROP TABLE IF EXISTS project_user_assignments;

COMMIT;
