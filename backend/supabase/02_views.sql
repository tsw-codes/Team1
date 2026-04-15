-- ============================================================
-- MEC2 Inventory Management System — Views
-- ============================================================
-- Run order: 02 (after tables)
-- Denormalized views that JOIN labels for the frontend.
-- Services query these views instead of the raw tables.
-- ============================================================


-- Inventory view: maps location_detail to frontend's 'location' field
CREATE VIEW inventory_view WITH (security_invoker = true) AS
SELECT
  id, name, sku, quantity, unit, project,
  location_value,
  location_detail AS location,
  status, category,
  unit_cost, total_cost, updated_at
FROM inventory_items;

-- Requests view: joins location/project labels and formats display values
CREATE VIEW requests_view WITH (security_invoker = true) AS
SELECT
  r.id, r.status_value, r.location_value, r.location_type,
  r.project_value, r.requested_by, r.created_at,
  r.needed_by_date, r.order_date, r.priority_value,
  r.source_warehouse_value, r.delivery_location_text,
  r.notes, r.approved_by, r.approved_at,
  r.rejected_by, r.rejected_at, r.approval_notes,
  -- Joined labels
  loc.label  AS location,
  proj.label AS project,
  sw.label   AS source_warehouse,
  -- Display values
  CASE r.status_value
    WHEN 'pending_approval' THEN 'Pending Approval'
    WHEN 'approved'         THEN 'Approved'
    WHEN 'rejected'         THEN 'Rejected'
    WHEN 'manifested'       THEN 'Manifested'
    ELSE r.status_value
  END AS status,
  INITCAP(r.priority_value) AS priority
FROM requests r
LEFT JOIN locations loc  ON r.location_value = loc.value
LEFT JOIN projects  proj ON r.project_value  = proj.value
LEFT JOIN locations sw   ON r.source_warehouse_value = sw.value;

-- Manifests view: joins source/destination location and project labels
CREATE VIEW manifests_view WITH (security_invoker = true) AS
SELECT
  m.id, m.manifest_type_value, m.status_value,
  m.request_id, m.requested_by, m.approved_by, m.approved_at,
  m.created_by, m.created_at, m.manifest_date,
  m.location_value, m.project_value,
  m.finalized_by, m.finalized_at,
  m.source_location_value, m.destination_location_value,
  m.destination_detail, m.notes,
  -- Joined labels
  loc.label    AS location,
  proj.label   AS project,
  src.label    AS source_location,
  dst.label    AS destination_location,
  -- Display values
  m.manifest_type_value AS manifest_type,
  CASE m.status_value
    WHEN 'draft'     THEN 'Draft'
    WHEN 'finalized' THEN 'Finalized'
    ELSE m.status_value
  END AS status
FROM manifests m
LEFT JOIN locations loc  ON m.location_value = loc.value
LEFT JOIN projects  proj ON m.project_value  = proj.value
LEFT JOIN locations src  ON m.source_location_value = src.value
LEFT JOIN locations dst  ON m.destination_location_value = dst.value;

-- Transfers view: joins all location/project labels
CREATE VIEW transfers_view WITH (security_invoker = true) AS
SELECT
  t.id, t.manifest_id, t.request_id,
  t.requested_by, t.approved_by, t.approved_at,
  t.transfer_type_value, t.status_value,
  t.created_by, t.created_at, t.manifest_date,
  t.shipped_date, t.shipped_at, t.shipped_by,
  t.received_date, t.received_at, t.received_by,
  t.location_value, t.project_value,
  t.source_location_value, t.destination_location_value,
  t.destination_detail, t.notes, t.exception_notes,
  -- Joined labels
  loc.label  AS location,
  proj.label AS project,
  src.label  AS source_location,
  dst.label  AS destination_location,
  -- Display values
  t.transfer_type_value AS transfer_type,
  CASE t.status_value
    WHEN 'ready_to_ship' THEN 'Ready to Ship'
    WHEN 'in_transit'     THEN 'In Transit'
    WHEN 'completed'      THEN 'Completed'
    WHEN 'exception'      THEN 'Exception'
    ELSE t.status_value
  END AS status
FROM transfers t
LEFT JOIN locations loc  ON t.location_value = loc.value
LEFT JOIN projects  proj ON t.project_value  = proj.value
LEFT JOIN locations src  ON t.source_location_value = src.value
LEFT JOIN locations dst  ON t.destination_location_value = dst.value;
