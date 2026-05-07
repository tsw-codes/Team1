BEGIN;

DROP POLICY IF EXISTS "project_closeout_batches_update" ON project_closeout_batches;
DROP POLICY IF EXISTS "project_closeout_batches_insert" ON project_closeout_batches;
DROP POLICY IF EXISTS "project_closeout_batches_select" ON project_closeout_batches;

DROP TRIGGER IF EXISTS inventory_validate_active_project ON inventory_items;
DROP TRIGGER IF EXISTS receipts_validate_active_project ON receipts;
DROP TRIGGER IF EXISTS purchase_orders_validate_active_project ON purchase_orders;
DROP TRIGGER IF EXISTS transfers_validate_active_project ON transfers;
DROP TRIGGER IF EXISTS manifests_validate_active_project ON manifests;
DROP TRIGGER IF EXISTS requests_validate_active_project ON requests;

DROP FUNCTION IF EXISTS reopen_project(TEXT, TEXT);
DROP FUNCTION IF EXISTS close_project(TEXT, TEXT);
DROP FUNCTION IF EXISTS validate_active_project_reference();
DROP FUNCTION IF EXISTS assert_project_is_active(TEXT, TEXT);
DROP FUNCTION IF EXISTS get_current_username();
DROP FUNCTION IF EXISTS generate_project_closeout_batch_id();

DROP VIEW IF EXISTS projects_view;
DROP VIEW IF EXISTS inventory_view;

CREATE VIEW inventory_view WITH (security_invoker = true) AS
SELECT
  id, name, sku, quantity, unit, project,
  location_value,
  location_detail AS location,
  status, category,
  unit_cost, total_cost, updated_at
FROM inventory_items;

CREATE OR REPLACE FUNCTION update_inventory_computed_fields()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  NEW.total_cost = NEW.quantity * NEW.unit_cost;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TABLE IF EXISTS project_closeout_batches;

ALTER TABLE inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_lifecycle_status_check;

ALTER TABLE inventory_items
  DROP COLUMN IF EXISTS project_closed_at,
  DROP COLUMN IF EXISTS closed_project_batch_id,
  DROP COLUMN IF EXISTS lifecycle_status,
  DROP COLUMN IF EXISTS project_value;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_status_value_check;

ALTER TABLE projects
  DROP COLUMN IF EXISTS reopen_reason,
  DROP COLUMN IF EXISTS reopened_by,
  DROP COLUMN IF EXISTS reopened_at,
  DROP COLUMN IF EXISTS close_notes,
  DROP COLUMN IF EXISTS closed_by,
  DROP COLUMN IF EXISTS closed_at,
  DROP COLUMN IF EXISTS status_value;

DROP POLICY IF EXISTS "projects_insert" ON projects;
CREATE POLICY "projects_insert" ON projects
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

DROP POLICY IF EXISTS "projects_update" ON projects;
CREATE POLICY "projects_update" ON projects
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

DROP POLICY IF EXISTS "projects_delete" ON projects;
CREATE POLICY "projects_delete" ON projects
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

COMMIT;
