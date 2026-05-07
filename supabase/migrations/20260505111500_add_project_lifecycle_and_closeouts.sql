BEGIN;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS status_value TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by TEXT,
  ADD COLUMN IF NOT EXISTS close_notes TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_by TEXT,
  ADD COLUMN IF NOT EXISTS reopen_reason TEXT NOT NULL DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_status_value_check'
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_status_value_check
      CHECK (status_value IN ('active', 'closed'));
  END IF;
END $$;

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS project_value TEXT REFERENCES projects(value),
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS closed_project_batch_id TEXT,
  ADD COLUMN IF NOT EXISTS project_closed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_items_lifecycle_status_check'
  ) THEN
    ALTER TABLE inventory_items
      ADD CONSTRAINT inventory_items_lifecycle_status_check
      CHECK (lifecycle_status IN ('active', 'closed_project'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS project_closeout_batches (
  id TEXT PRIMARY KEY,
  project_value TEXT NOT NULL REFERENCES projects(value),
  location_value TEXT NOT NULL REFERENCES locations(value),
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by TEXT NOT NULL,
  close_notes TEXT NOT NULL DEFAULT '',
  affected_inventory_count INTEGER NOT NULL DEFAULT 0,
  affected_total_quantity INTEGER NOT NULL DEFAULT 0,
  affected_total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  reopened_at TIMESTAMPTZ,
  reopened_by TEXT,
  reopen_reason TEXT NOT NULL DEFAULT ''
);

UPDATE inventory_items i
SET project_value = p.value
FROM projects p
WHERE i.project_value IS NULL
  AND p.location_value = i.location_value
  AND (
    (i.location_value LIKE 'WH-%' AND p.label ILIKE '%Inventory%')
    OR p.label = i.project
  );

UPDATE inventory_items
SET project_value = CASE
  WHEN location_value = 'SG' THEN 'SG-001'
  WHEN location_value = 'WT' THEN 'WT-001'
  WHEN location_value = 'CO' THEN 'CO-001'
  WHEN location_value = 'NA' THEN 'NA-001'
  ELSE project_value
END
WHERE project_value IS NULL
  AND project IN ('South Garage', 'West Tower', 'Central Office', 'North Annex');

CREATE OR REPLACE FUNCTION update_inventory_computed_fields()
RETURNS TRIGGER AS $$
DECLARE
  v_project_label TEXT;
BEGIN
  IF NEW.project_value IS NOT NULL THEN
    SELECT label INTO v_project_label
    FROM projects
    WHERE value = NEW.project_value;

    IF v_project_label IS NULL THEN
      RAISE EXCEPTION 'Project % does not exist.', NEW.project_value;
    END IF;

    NEW.project = v_project_label;
  END IF;

  NEW.updated_at = now();
  NEW.total_cost = NEW.quantity * NEW.unit_cost;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION generate_project_closeout_batch_id()
RETURNS TEXT AS $$
DECLARE next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SPLIT_PART(id, '-', 2) AS INTEGER)), 1000) + 1
  INTO next_num
  FROM project_closeout_batches
  WHERE id LIKE 'PCB-%';
  RETURN 'PCB-' || next_num;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP VIEW IF EXISTS projects_view;
CREATE VIEW projects_view WITH (security_invoker = true) AS
SELECT
  p.value, p.label, p.location_value, p.status_value,
  p.closed_at, p.closed_by, p.close_notes,
  p.reopened_at, p.reopened_by, p.reopen_reason,
  p.created_at,
  loc.label AS location,
  loc.type AS location_type,
  CASE p.status_value
    WHEN 'active' THEN 'Active'
    WHEN 'closed' THEN 'Closed'
    ELSE p.status_value
  END AS status,
  (
    p.status_value = 'closed'
    AND p.closed_at IS NOT NULL
    AND p.closed_at >= (now() - interval '30 days')
  ) AS reopen_eligible
FROM projects p
LEFT JOIN locations loc ON p.location_value = loc.value;

DROP VIEW IF EXISTS inventory_view;
CREATE VIEW inventory_view WITH (security_invoker = true) AS
SELECT
  i.id, i.name, i.sku, i.quantity, i.unit,
  COALESCE(proj.label, i.project) AS project,
  i.project_value,
  i.location_value,
  i.location_detail AS location,
  i.status, i.category,
  i.unit_cost, i.total_cost, i.updated_at
FROM inventory_items i
LEFT JOIN projects proj ON i.project_value = proj.value
WHERE i.lifecycle_status = 'active';

CREATE OR REPLACE FUNCTION get_current_username()
RETURNS TEXT AS $$
DECLARE
  v_username TEXT;
BEGIN
  SELECT username INTO v_username
  FROM profiles
  WHERE id = auth.uid();

  IF v_username IS NULL THEN
    RAISE EXCEPTION 'User profile not found. Please contact an administrator.';
  END IF;

  RETURN v_username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION assert_project_is_active(p_project_value TEXT, p_context TEXT)
RETURNS VOID AS $$
DECLARE
  v_status TEXT;
  v_label TEXT;
BEGIN
  IF p_project_value IS NULL OR btrim(p_project_value) = '' THEN
    RETURN;
  END IF;

  SELECT status_value, label
  INTO v_status, v_label
  FROM projects
  WHERE value = p_project_value;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Project % does not exist.', p_project_value;
  END IF;

  IF v_status != 'active' THEN
    RAISE EXCEPTION 'Project "%" is closed and cannot be used for %.', COALESCE(v_label, p_project_value), p_context;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION validate_active_project_reference()
RETURNS TRIGGER AS $$
DECLARE
  v_project_value TEXT;
BEGIN
  IF TG_OP = 'UPDATE'
     AND COALESCE(to_jsonb(NEW)->>TG_ARGV[0], '') = COALESCE(to_jsonb(OLD)->>TG_ARGV[0], '') THEN
    RETURN NEW;
  END IF;

  v_project_value := NULLIF(to_jsonb(NEW)->>TG_ARGV[0], '');
  PERFORM assert_project_is_active(v_project_value, TG_ARGV[1]);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS requests_validate_active_project ON requests;
CREATE TRIGGER requests_validate_active_project
  BEFORE INSERT OR UPDATE ON requests
  FOR EACH ROW EXECUTE FUNCTION validate_active_project_reference('project_value', 'requests');

DROP TRIGGER IF EXISTS manifests_validate_active_project ON manifests;
CREATE TRIGGER manifests_validate_active_project
  BEFORE INSERT OR UPDATE ON manifests
  FOR EACH ROW EXECUTE FUNCTION validate_active_project_reference('project_value', 'manifests');

DROP TRIGGER IF EXISTS transfers_validate_active_project ON transfers;
CREATE TRIGGER transfers_validate_active_project
  BEFORE INSERT OR UPDATE ON transfers
  FOR EACH ROW EXECUTE FUNCTION validate_active_project_reference('project_value', 'transfers');

DROP TRIGGER IF EXISTS purchase_orders_validate_active_project ON purchase_orders;
CREATE TRIGGER purchase_orders_validate_active_project
  BEFORE INSERT OR UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION validate_active_project_reference('project_value', 'purchase orders');

DROP TRIGGER IF EXISTS receipts_validate_active_project ON receipts;
CREATE TRIGGER receipts_validate_active_project
  BEFORE INSERT OR UPDATE ON receipts
  FOR EACH ROW EXECUTE FUNCTION validate_active_project_reference('project_value', 'receipts');

DROP TRIGGER IF EXISTS inventory_validate_active_project ON inventory_items;
CREATE TRIGGER inventory_validate_active_project
  BEFORE INSERT OR UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION validate_active_project_reference('project_value', 'inventory');

CREATE OR REPLACE FUNCTION close_project(p_project_value TEXT, p_close_notes TEXT DEFAULT '')
RETURNS JSON AS $$
DECLARE
  v_role TEXT;
  v_username TEXT;
  v_project_status TEXT;
  v_project_label TEXT;
  v_location_value TEXT;
  v_closeout_batch_id TEXT;
  v_affected_count INTEGER;
  v_total_quantity INTEGER;
  v_total_cost NUMERIC(12,2);
  v_open_request_count INTEGER;
  v_open_manifest_count INTEGER;
  v_open_transfer_count INTEGER;
BEGIN
  v_role := get_current_user_role();

  IF v_role NOT IN ('admin', 'projectManager') THEN
    RAISE EXCEPTION 'Only Admins and Project Managers can close projects.';
  END IF;

  SELECT status_value, label, location_value
  INTO v_project_status, v_project_label, v_location_value
  FROM projects
  WHERE value = p_project_value
  FOR UPDATE;

  IF v_project_status IS NULL THEN
    RAISE EXCEPTION 'Project % does not exist.', p_project_value;
  END IF;

  IF v_project_status = 'closed' THEN
    RAISE EXCEPTION 'Project "%" is already closed.', v_project_label;
  END IF;

  SELECT COUNT(*) INTO v_open_request_count
  FROM requests
  WHERE project_value = p_project_value
    AND status_value NOT IN ('rejected', 'manifested');

  IF v_open_request_count > 0 THEN
    RAISE EXCEPTION 'Project "%" still has open requests and cannot be closed.', v_project_label;
  END IF;

  SELECT COUNT(*) INTO v_open_manifest_count
  FROM manifests
  WHERE project_value = p_project_value
    AND status_value != 'finalized';

  IF v_open_manifest_count > 0 THEN
    RAISE EXCEPTION 'Project "%" still has open manifests and cannot be closed.', v_project_label;
  END IF;

  SELECT COUNT(*) INTO v_open_transfer_count
  FROM transfers
  WHERE project_value = p_project_value
    AND status_value NOT IN ('completed');

  IF v_open_transfer_count > 0 THEN
    RAISE EXCEPTION 'Project "%" still has in-flight transfers and cannot be closed.', v_project_label;
  END IF;

  v_username := get_current_username();
  v_closeout_batch_id := generate_project_closeout_batch_id();

  SELECT
    COUNT(*),
    COALESCE(SUM(quantity), 0),
    COALESCE(SUM(total_cost), 0)
  INTO
    v_affected_count,
    v_total_quantity,
    v_total_cost
  FROM inventory_items
  WHERE project_value = p_project_value
    AND lifecycle_status = 'active';

  INSERT INTO project_closeout_batches (
    id, project_value, location_value, closed_at, closed_by, close_notes,
    affected_inventory_count, affected_total_quantity, affected_total_cost
  ) VALUES (
    v_closeout_batch_id, p_project_value, v_location_value, now(), v_username, COALESCE(p_close_notes, ''),
    COALESCE(v_affected_count, 0), COALESCE(v_total_quantity, 0), COALESCE(v_total_cost, 0)
  );

  UPDATE inventory_items
  SET lifecycle_status = 'closed_project',
      closed_project_batch_id = v_closeout_batch_id,
      project_closed_at = now()
  WHERE project_value = p_project_value
    AND lifecycle_status = 'active';

  UPDATE projects
  SET status_value = 'closed',
      closed_at = now(),
      closed_by = v_username,
      close_notes = COALESCE(p_close_notes, ''),
      reopened_at = NULL,
      reopened_by = NULL,
      reopen_reason = ''
  WHERE value = p_project_value;

  RETURN json_build_object(
    'projectValue', p_project_value,
    'project', v_project_label,
    'closeoutBatchId', v_closeout_batch_id,
    'affectedInventoryCount', COALESCE(v_affected_count, 0),
    'affectedTotalQuantity', COALESCE(v_total_quantity, 0),
    'affectedTotalCost', COALESCE(v_total_cost, 0),
    'closedBy', v_username,
    'closedAt', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION reopen_project(p_project_value TEXT, p_reopen_reason TEXT)
RETURNS JSON AS $$
DECLARE
  v_role TEXT;
  v_username TEXT;
  v_project_status TEXT;
  v_project_label TEXT;
  v_closed_at TIMESTAMPTZ;
  v_closeout_batch_id TEXT;
  v_restored_count INTEGER;
BEGIN
  IF p_reopen_reason IS NULL OR btrim(p_reopen_reason) = '' THEN
    RAISE EXCEPTION 'A reopen reason is required.';
  END IF;

  v_role := get_current_user_role();

  IF v_role NOT IN ('admin', 'projectManager') THEN
    RAISE EXCEPTION 'Only Admins and Project Managers can reopen projects.';
  END IF;

  SELECT status_value, label, closed_at
  INTO v_project_status, v_project_label, v_closed_at
  FROM projects
  WHERE value = p_project_value
  FOR UPDATE;

  IF v_project_status IS NULL THEN
    RAISE EXCEPTION 'Project % does not exist.', p_project_value;
  END IF;

  IF v_project_status != 'closed' THEN
    RAISE EXCEPTION 'Only closed projects can be reopened.';
  END IF;

  IF v_closed_at IS NULL OR v_closed_at < (now() - interval '30 days') THEN
    RAISE EXCEPTION 'Project "%" is outside the 30-day reopen window.', v_project_label;
  END IF;

  SELECT id
  INTO v_closeout_batch_id
  FROM project_closeout_batches
  WHERE project_value = p_project_value
    AND reopened_at IS NULL
  ORDER BY closed_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_closeout_batch_id IS NULL THEN
    RAISE EXCEPTION 'No unreopened closeout batch was found for project "%".', v_project_label;
  END IF;

  v_username := get_current_username();

  UPDATE inventory_items
  SET lifecycle_status = 'active',
      closed_project_batch_id = NULL,
      project_closed_at = NULL
  WHERE closed_project_batch_id = v_closeout_batch_id
    AND lifecycle_status = 'closed_project';

  GET DIAGNOSTICS v_restored_count = ROW_COUNT;

  UPDATE project_closeout_batches
  SET reopened_at = now(),
      reopened_by = v_username,
      reopen_reason = btrim(p_reopen_reason)
  WHERE id = v_closeout_batch_id;

  UPDATE projects
  SET status_value = 'active',
      reopened_at = now(),
      reopened_by = v_username,
      reopen_reason = btrim(p_reopen_reason)
  WHERE value = p_project_value;

  RETURN json_build_object(
    'projectValue', p_project_value,
    'project', v_project_label,
    'closeoutBatchId', v_closeout_batch_id,
    'restoredInventoryCount', COALESCE(v_restored_count, 0),
    'reopenedBy', v_username,
    'reopenedAt', now()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER TABLE project_closeout_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_insert" ON projects;
CREATE POLICY "projects_insert" ON projects
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));

DROP POLICY IF EXISTS "projects_update" ON projects;
CREATE POLICY "projects_update" ON projects
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));

DROP POLICY IF EXISTS "projects_delete" ON projects;
CREATE POLICY "projects_delete" ON projects
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));

DROP POLICY IF EXISTS "project_closeout_batches_select" ON project_closeout_batches;
CREATE POLICY "project_closeout_batches_select" ON project_closeout_batches
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));

DROP POLICY IF EXISTS "project_closeout_batches_insert" ON project_closeout_batches;
CREATE POLICY "project_closeout_batches_insert" ON project_closeout_batches
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));

DROP POLICY IF EXISTS "project_closeout_batches_update" ON project_closeout_batches;
CREATE POLICY "project_closeout_batches_update" ON project_closeout_batches
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'projectManager')
  ));

COMMIT;
