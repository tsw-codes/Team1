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
  i.id, i.name, i.sku, i.quantity, i.reserved_quantity,
  GREATEST(i.quantity - i.reserved_quantity, 0) AS available_quantity,
  i.unit,
  COALESCE(proj.label, i.project) AS project,
  i.project_value,
  i.location_value,
  i.location_detail AS location,
  i.status, i.category,
  i.unit_cost, i.total_cost, i.updated_at
FROM inventory_items i
LEFT JOIN projects proj ON i.project_value = proj.value
WHERE i.lifecycle_status = 'active';

-- Projects view: joins location labels and exposes lifecycle state
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

-- Project user assignments view: joins profile identity fields for admin UIs
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

-- Purchase orders view: joins labels and summarizes line-level receiving progress
CREATE VIEW purchase_orders_view WITH (security_invoker = true) AS
SELECT
  po.id, po.po_number, po.vendor, po.status_value,
  po.expected_delivery_date, po.entered_by, po.entered_at,
  po.location_value, po.project_value, po.notes, po.po_document_name,
  po.created_at, po.updated_at,
  loc.label AS location,
  proj.label AS project,
  CASE po.status_value
    WHEN 'entered' THEN 'Entered'
    WHEN 'partially_received' THEN 'Partially Received'
    WHEN 'received' THEN 'Received'
    WHEN 'closed_with_discrepancies' THEN 'Closed with Discrepancies'
    WHEN 'cancelled' THEN 'Cancelled'
    ELSE po.status_value
  END AS status,
  COALESCE(item_totals.line_count, 0) AS line_count,
  COALESCE(item_totals.total_ordered_quantity, 0) AS total_ordered_quantity,
  COALESCE(item_totals.total_received_quantity, 0) AS total_received_quantity,
  COALESCE(item_totals.open_item_count, 0) AS open_item_count
FROM purchase_orders po
LEFT JOIN locations loc ON po.location_value = loc.value
LEFT JOIN projects proj ON po.project_value = proj.value
LEFT JOIN (
  SELECT
    poi.purchase_order_id,
    COUNT(*) AS line_count,
    COALESCE(SUM(poi.ordered_quantity), 0) AS total_ordered_quantity,
    COALESCE(SUM(COALESCE(receipt_totals.received_quantity_total, 0)), 0) AS total_received_quantity,
    COUNT(*) FILTER (
      WHERE COALESCE(receipt_totals.received_quantity_total, 0) < poi.ordered_quantity
    ) AS open_item_count
  FROM purchase_order_items poi
  LEFT JOIN (
    SELECT
      purchase_order_item_id,
      COALESCE(SUM(received_quantity), 0) AS received_quantity_total
    FROM receipt_items
    WHERE purchase_order_item_id IS NOT NULL
    GROUP BY purchase_order_item_id
  ) receipt_totals ON receipt_totals.purchase_order_item_id = poi.id
  GROUP BY poi.purchase_order_id
) item_totals ON item_totals.purchase_order_id = po.id;

-- Purchase order items view: line items with derived receiving totals
CREATE VIEW purchase_order_items_view WITH (security_invoker = true) AS
SELECT
  poi.id, poi.purchase_order_id, poi.line_number,
  poi.material_name, poi.sku, poi.category, poi.ordered_quantity,
  poi.unit, poi.unit_cost, poi.created_at,
  COALESCE(receipt_totals.received_quantity_total, 0) AS received_quantity_total,
  GREATEST(poi.ordered_quantity - COALESCE(receipt_totals.received_quantity_total, 0), 0) AS remaining_quantity,
  GREATEST(COALESCE(receipt_totals.received_quantity_total, 0) - poi.ordered_quantity, 0) AS over_received_quantity,
  (COALESCE(receipt_totals.received_quantity_total, 0) >= poi.ordered_quantity) AS is_fully_received
FROM purchase_order_items poi
LEFT JOIN (
  SELECT
    purchase_order_item_id,
    COALESCE(SUM(received_quantity), 0) AS received_quantity_total
  FROM receipt_items
  WHERE purchase_order_item_id IS NOT NULL
  GROUP BY purchase_order_item_id
) receipt_totals ON receipt_totals.purchase_order_item_id = poi.id;

-- Receipts view: joins labels for frontend-friendly receipt reads
CREATE VIEW receipts_view WITH (security_invoker = true) AS
SELECT
  r.id, r.purchase_order_id, r.vendor, r.po_number,
  r.delivery_date, r.received_by, r.location_value, r.project_value,
  r.status_value, r.has_discrepancy, r.notes, r.created_at,
  loc.label AS location,
  proj.label AS project,
  CASE r.status_value
    WHEN 'confirmed' THEN 'Confirmed'
    ELSE r.status_value
  END AS status
FROM receipts r
LEFT JOIN locations loc ON r.location_value = loc.value
LEFT JOIN projects proj ON r.project_value = proj.value;
