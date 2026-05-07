BEGIN;

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
  FROM manifests m
  WHERE m.project_value = p_project_value
    AND NOT EXISTS (
      SELECT 1
      FROM transfers t
      WHERE t.manifest_id = m.id
        AND t.status_value IN ('completed', 'exception')
    );

  IF v_open_manifest_count > 0 THEN
    RAISE EXCEPTION 'Project "%" still has manifested inventory awaiting transfer and cannot be closed.', v_project_label;
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

COMMIT;
