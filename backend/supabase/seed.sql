-- ============================================================
-- MEC2 Inventory Management System — Seed Data
-- ============================================================
-- Run this AFTER schema.sql in the Supabase SQL Editor.
-- Populates the database with demo data matching the frontend
-- mock data files.
--
-- NOTE: Demo auth users must be created separately via the
-- Supabase dashboard or auth API (see bottom of this file).
-- ============================================================


-- ============================================================
-- 1. LOCATIONS
-- ============================================================

INSERT INTO locations (value, label, type) VALUES
  ('WH-A', 'Warehouse A',    'warehouse'),
  ('WH-B', 'Warehouse B',    'warehouse'),
  ('WH-C', 'Warehouse C',    'warehouse'),
  ('SG',   'South Garage',   'site'),
  ('WT',   'West Tower',     'site'),
  ('CO',   'Central Office', 'site'),
  ('NA',   'North Annex',    'site');


-- ============================================================
-- 2. PROJECTS
-- ============================================================

INSERT INTO projects (value, label, location_value) VALUES
  ('WH-A-001', 'Warehouse A - Inventory',        'WH-A'),
  ('WH-B-001', 'Warehouse B - Inventory',        'WH-B'),
  ('WH-C-001', 'Warehouse C - Inventory',        'WH-C'),
  ('SG-001',   'South Garage - Phase 1',         'SG'),
  ('SG-002',   'South Garage - Rough-In',        'SG'),
  ('WT-001',   'West Tower - Core Buildout',     'WT'),
  ('WT-002',   'West Tower - HVAC Upgrade',      'WT'),
  ('CO-001',   'Central Office - Renovation',    'CO'),
  ('NA-001',   'North Annex - Expansion',        'NA');


-- ============================================================
-- 3. INVENTORY ITEMS
-- ============================================================
-- total_cost is auto-computed by trigger (quantity * unit_cost)

INSERT INTO inventory_items (id, name, sku, quantity, unit, project, location_value, location_detail, status, category, unit_cost) VALUES
  (1,  'Copper Pipe 3/4"',       'CP-075',  120, 'ft',    'Warehouse Stock',  'WH-A', 'Warehouse A / Rack 3',         'Available',    'Plumbing',   1.21),
  (2,  'Steel Duct Connector',   'SDC-210',  16, 'pcs',   'Warehouse Stock',  'WH-B', 'Warehouse B / Shelf 2',        'Available',    'HVAC',       8.50),
  (3,  'Electrical Conduit 1 in','EC-100',   48, 'pcs',   'Warehouse Stock',  'WH-A', 'Warehouse A / Rack 1',         'Reserved',     'Electrical', 12.75),
  (4,  'Air Diffuser 24x24',     'AD-2424',  22, 'pcs',   'Warehouse Stock',  'WH-C', 'Warehouse C / Bay 4',          'Available',    'HVAC',      42.00),
  (5,  'Ball Valve 2 in',        'BV-200',    7, 'pcs',   'Warehouse Stock',  'WH-A', 'Warehouse A / Bin 8',          'Low Stock',    'Plumbing',  31.50),
  (6,  'Breaker Panel 200A',     'BP-200A',   9, 'pcs',   'Warehouse Stock',  'WH-C', 'Warehouse C / Secure Cage',    'Available',    'Electrical',185.00),
  (7,  'Flexible Duct 8 in',     'FD-800',    0, 'rolls', 'Warehouse Stock',  'WH-B', 'Warehouse B / Rack 6',         'Out of Stock', 'HVAC',      56.00),
  (8,  'Threaded Rod 1/2 in',    'TR-050',   85, 'pcs',   'Warehouse Stock',  'WH-A', 'Warehouse A / Rack 5',         'Available',    'Hardware',    2.10),
  (9,  'Copper Elbow 3/4 in',    'CE-075',   12, 'pcs',   'South Garage',     'SG',   'South Garage / Storage Container', 'Available', 'Plumbing',   4.25),
  (10, 'Lighting Control Panel', 'LCP-01',    1, 'pcs',   'West Tower',       'WT',   'West Tower / Electrical Room', 'Available',    'Electrical',950.00),
  (11, 'VAV Box',                'VAV-440',   2, 'pcs',   'Central Office',   'CO',   'In Transit',                   'In Transit',   'HVAC',     225.00);

-- Reset the auto-increment sequence to continue after our manual IDs
SELECT setval('inventory_items_id_seq', 11);


-- ============================================================
-- 4. REQUESTS
-- ============================================================

INSERT INTO requests (id, status_value, location_value, location_type, project_value, requested_by, created_at, needed_by_date, priority_value, source_warehouse_value, delivery_location_text, notes, approved_by, approved_at, rejected_by, rejected_at, approval_notes) VALUES
  ('RQ-1001', 'pending_approval', 'SG', 'site', 'SG-002', 'logistics_foreman', '2026-03-25T10:15:00', '2026-03-30', 'high',   'WH-A', 'Loading Area',    'Need material for next rough-in phase.', NULL, NULL, NULL, NULL, ''),
  ('RQ-1002', 'approved',         'WT', 'site', 'WT-002', 'logistics_foreman', '2026-03-26T14:30:00', '2026-04-02', 'normal', 'WH-C', 'Dock 2',          'Need before scheduled install window.',  'pm', '2026-03-26T16:05:00', NULL, NULL, 'Approved for scheduled install delivery.'),
  ('RQ-1003', 'rejected',         'CO', 'site', 'CO-001', 'logistics_foreman', '2026-03-27T09:45:00', '2026-04-05', 'urgent', 'WH-A', 'Staging Area 8',  'Send what is available now. Remaining require a new request later.', NULL, NULL, 'pm', '2026-03-27T11:10:00', 'Please split this into separate requests by delivery urgency.'),
  ('RQ-1004', 'approved',         'NA', 'site', 'NA-001', 'logistics_foreman', '2026-03-20T08:10:00', '2026-03-22', 'low',    'WH-B', 'Trailer 1',       '',                                       'pm', '2026-03-20T10:25:00', NULL, NULL, 'Approved for processing.'),
  ('RQ-2001', 'pending_approval', 'SG', 'site', 'SG-001', 'logistics_foreman', '2026-04-06T08:15:00', '2026-04-08', 'urgent', 'WH-A', 'Level 2 Staging', 'Critical materials for install today.',   NULL, NULL, NULL, NULL, ''),
  ('RQ-2002', 'pending_approval', 'WT', 'site', 'WT-001', 'logistics_foreman', '2026-04-05T11:40:00', '2026-04-09', 'high',   'WH-C', 'Dock 1',          'Prep for upcoming mechanical install.',  NULL, NULL, NULL, NULL, ''),
  ('RQ-2003', 'pending_approval', 'CO', 'site', 'CO-001', 'logistics_foreman', '2026-04-04T09:25:00', '2026-04-12', 'normal', 'WH-B', 'Storage Room B',  'General material replenishment.',        NULL, NULL, NULL, NULL, ''),
  ('RQ-2004', 'pending_approval', 'NA', 'site', 'NA-001', 'logistics_foreman', '2026-04-03T14:10:00', '2026-04-07', 'urgent', 'WH-A', 'Trailer 3',       'Install blocked until delivered.',        NULL, NULL, NULL, NULL, ''),
  ('RQ-2005', 'pending_approval', 'SG', 'site', 'SG-002', 'logistics_foreman', '2026-04-02T10:30:00', '2026-04-10', 'high',   'WH-A', 'Loading Area',    '',                                       NULL, NULL, NULL, NULL, ''),
  ('RQ-2006', 'pending_approval', 'WT', 'site', 'WT-002', 'logistics_foreman', '2026-04-01T15:20:00', '2026-04-15', 'low',    'WH-C', 'Mechanical Room',  'Non-urgent restock.',                    NULL, NULL, NULL, NULL, ''),
  ('RQ-2007', 'pending_approval', 'CO', 'site', 'CO-001', 'logistics_foreman', '2026-04-06T07:10:00', '2026-04-08', 'urgent', 'WH-B', 'Floor 3',          'Needed for inspection readiness.',       NULL, NULL, NULL, NULL, ''),
  ('RQ-2008', 'pending_approval', 'NA', 'site', 'NA-001', 'logistics_foreman', '2026-04-05T13:45:00', '2026-04-11', 'normal', 'WH-B', 'Staging Area',     '',                                      NULL, NULL, NULL, NULL, '');


-- ============================================================
-- 5. REQUEST ITEMS
-- ============================================================

-- RQ-1001
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-1001', 1, 80),
  ('RQ-1001', 5, 10),
  ('RQ-1001', 8, 25);

-- RQ-1002
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-1002', 7, 12),
  ('RQ-1002', 4, 6);

-- RQ-1003
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-1003', 6, 4),
  ('RQ-1003', 7, 5);

-- RQ-1004
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-1004', 1, 20);

-- RQ-2001
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-2001', 1, 60),
  ('RQ-2001', 5, 12);

-- RQ-2002
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-2002', 4, 8),
  ('RQ-2002', 6, 3);

-- RQ-2003
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-2003', 7, 15);

-- RQ-2004
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-2004', 9, 20);

-- RQ-2005
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-2005', 3, 30);

-- RQ-2006
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-2006', 8, 10);

-- RQ-2007
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-2007', 10, 2);

-- RQ-2008
INSERT INTO request_items (request_id, inventory_item_id, requested_quantity) VALUES
  ('RQ-2008', 6, 4);


-- ============================================================
-- 6. MANIFESTS
-- ============================================================

INSERT INTO manifests (id, manifest_type_value, status_value, request_id, requested_by, approved_by, approved_at, created_by, created_at, manifest_date, location_value, project_value, finalized_by, finalized_at, source_location_value, destination_location_value, destination_detail, notes) VALUES
  ('MO-1001', 'outbound',           'finalized', 'RQ-1002', 'logistics_foreman', 'pm', '2026-03-26T16:05:00', 'warehouse_mgr', '2026-03-30T07:50:00', '2026-03-31', 'WT',  'WT-002', 'warehouse_mgr', '2026-03-30T08:20:00', 'WH-C', 'WT',   'Dock 2', 'Approved request prepared for scheduled install delivery.'),
  ('MO-1002', 'outbound',           'finalized', 'RQ-1004', 'logistics_foreman', 'pm', '2026-03-20T10:25:00', 'warehouse_mgr', '2026-03-20T14:00:00', '2026-03-21', 'NA',  'NA-001', 'warehouse_mgr', '2026-03-20T14:30:00', 'WH-B', 'NA',   'Trailer 1', 'Outbound delivery for North Annex expansion.'),
  ('MW-1001', 'warehouse_transfer', 'finalized', NULL,       '',                  '',   NULL,                  'warehouse_mgr', '2026-03-29T10:05:00', '2026-03-30', NULL,  NULL,     'warehouse_mgr', '2026-03-29T10:30:00', 'WH-A', 'WH-B', '',       'Rebalancing inventory across warehouse locations.'),
  ('MR-1001', 'return',             'finalized', NULL,       '',                  '',   NULL,                  'pm',            '2026-03-28T13:10:00', '2026-03-29', 'SG',  'SG-001', 'warehouse_mgr', '2026-03-28T13:45:00', 'SG',   'WH-A', '',       'Return of unused materials after install phase.');


-- ============================================================
-- 7. MANIFEST ITEMS
-- ============================================================

-- MO-1001
INSERT INTO manifest_items (id, manifest_id, inventory_item_id, manifest_quantity) VALUES
  ('MO-1001-1', 'MO-1001', 7, 12),
  ('MO-1001-2', 'MO-1001', 4, 6);

-- MO-1002 (missing from frontend mock data, referenced by transfer TO-1003)
INSERT INTO manifest_items (id, manifest_id, inventory_item_id, manifest_quantity) VALUES
  ('MO-1002-1', 'MO-1002', 1, 20);

-- MW-1001
INSERT INTO manifest_items (id, manifest_id, inventory_item_id, manifest_quantity) VALUES
  ('MW-1001-1', 'MW-1001', 3, 24),
  ('MW-1001-2', 'MW-1001', 5, 4);

-- MR-1001
INSERT INTO manifest_items (id, manifest_id, inventory_item_id, manifest_quantity) VALUES
  ('MR-1001-1', 'MR-1001', 9, 12),
  ('MR-1001-2', 'MR-1001', 10, 1);


-- ============================================================
-- 8. TRANSFERS
-- ============================================================

INSERT INTO transfers (id, manifest_id, request_id, requested_by, approved_by, approved_at, transfer_type_value, status_value, created_by, created_at, manifest_date, shipped_date, shipped_at, shipped_by, received_date, received_at, received_by, location_value, project_value, source_location_value, destination_location_value, destination_detail, notes, exception_notes) VALUES
  ('TW-1001', 'MW-1001', NULL,      '',                  '',   NULL,                  'warehouse_transfer', 'in_transit', 'warehouse_mgr',  '2026-03-31T09:15:00', '2026-03-30', '2026-03-31', '2026-03-31T09:15:00', 'warehouse_mgr',  NULL,         NULL,                  NULL,  NULL,    NULL,    'WH-A', 'WH-B', '',          'Rebalance stock between warehouse locations.', ''),
  ('TR-1001', 'MR-1001', NULL,      '',                  '',   NULL,                  'return',             'completed',  'warehouse_mgr',  '2026-03-29T14:10:00', '2026-03-29', '2026-03-29', '2026-03-29T14:10:00', 'warehouse_mgr',  '2026-03-30', '2026-03-30T08:40:00', 'warehouse_mgr', 'SG', 'SG-001', 'SG',   'WH-A', '',          'Unused material returned from job site.', '1 fitting missing from expected return count.'),
  ('TO-1002', 'MO-1001', 'RQ-1002', 'logistics_foreman', 'pm', '2026-03-26T16:05:00', 'outbound',           'exception',  'logistics_assoc', '2026-04-01T07:55:00', '2026-04-01', '2026-04-01', '2026-04-01T07:55:00', 'logistics_assoc', '2026-04-01', '2026-04-01T12:20:00', 'logistics_assoc', 'WT', 'WT-002', 'WH-C', 'WT',   'Dock 2',    'Outbound delivery for scheduled install window.', 'Short delivery confirmed at site.'),
  ('TO-1003', 'MO-1002', 'RQ-1004', 'logistics_foreman', 'pm', '2026-03-20T10:25:00', 'outbound',           'completed',  'logistics_assoc', '2026-03-21T10:05:00', '2026-03-21', '2026-03-21', '2026-03-21T10:05:00', 'logistics_assoc', '2026-03-21', '2026-03-21T13:20:00', 'logistics_assoc', 'NA', 'NA-001', 'WH-B', 'NA',   'Trailer 1', 'Delivered and received in full.', '');


-- ============================================================
-- 9. TRANSFER ITEMS
-- ============================================================

-- TW-1001
INSERT INTO transfer_items (id, transfer_id, inventory_item_id, manifest_quantity, shipped_quantity, received_quantity, variance_reason) VALUES
  ('TW-1001-1', 'TW-1001', 3, 24, 24, NULL, ''),
  ('TW-1001-2', 'TW-1001', 5,  4,  4, NULL, '');

-- TR-1001
INSERT INTO transfer_items (id, transfer_id, inventory_item_id, manifest_quantity, shipped_quantity, received_quantity, variance_reason) VALUES
  ('TR-1001-1', 'TR-1001', 9,  12, 12, 11, '1 missing during site pullback.'),
  ('TR-1001-2', 'TR-1001', 10,  1,  1,  1, '');

-- TO-1002
INSERT INTO transfer_items (id, transfer_id, inventory_item_id, manifest_quantity, shipped_quantity, received_quantity, variance_reason) VALUES
  ('TO-1002-1', 'TO-1002', 4, 6, 6, 5, '1 unit missing at delivery.'),
  ('TO-1002-2', 'TO-1002', 6, 2, 2, 2, '');

-- TO-1003
INSERT INTO transfer_items (id, transfer_id, inventory_item_id, manifest_quantity, shipped_quantity, received_quantity, variance_reason) VALUES
  ('TO-1003-1', 'TO-1003', 1, 20, 20, 20, '');


-- ============================================================
-- 10. DEMO USER SETUP
-- ============================================================
-- Auth users can't be created via SQL INSERT (Supabase manages
-- auth.users internally). Create these via the Supabase dashboard
-- or use the auth admin API.
--
-- After creating each user, the handle_new_user() trigger will
-- auto-create their profile row. Pass metadata when creating:
--
--   Email                    | Password | Metadata
--   -------------------------|----------|---------------------------
--   admin@coolsys.com        | admin    | username: admin, name: Admin User, role: admin
--   pm@coolsys.com           | pm       | username: pm, name: Project Manager, role: projectManager
--   wm@coolsys.com           | wm       | username: wm, name: Warehouse Manager, role: warehouseManager
--   la@coolsys.com           | la       | username: la, name: Logistics Associate, role: logisticsAssociate
--   lf@coolsys.com           | lf       | username: lf, name: Logistics Foreman, role: logisticsForeman
--
-- Example using Supabase JS admin client:
--
--   const { data } = await supabase.auth.admin.createUser({
--     email: 'admin@coolsys.com',
--     password: 'admin',
--     email_confirm: true,
--     user_metadata: {
--       username: 'admin',
--       name: 'Admin User',
--       role: 'admin'
--     }
--   })
