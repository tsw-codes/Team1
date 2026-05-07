-- ============================================================
-- MEC2 Inventory Management System — Tables
-- ============================================================
-- Run order: 01 (first)
-- Creates all tables in dependency order.
-- ============================================================


-- Locations: warehouses and job sites
CREATE TABLE locations (
  value  TEXT PRIMARY KEY,                                    -- 'WH-A', 'SG', 'WT', etc.
  label  TEXT NOT NULL,                                       -- 'Warehouse A', 'South Garage'
  type   TEXT NOT NULL CHECK (type IN ('warehouse', 'site')), -- location type
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projects: tied to a location
CREATE TABLE projects (
  value          TEXT PRIMARY KEY,                            -- 'SG-001', 'WH-A-001'
  label          TEXT NOT NULL,                               -- 'South Garage - Phase 1'
  location_value TEXT NOT NULL REFERENCES locations(value),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Profiles: extends Supabase auth.users
-- Auto-created via trigger (see 03_triggers.sql)
CREATE TABLE profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username   TEXT UNIQUE NOT NULL,                            -- 'admin', 'pm', 'wm', etc.
  name       TEXT NOT NULL,                                   -- 'Admin User'
  role       TEXT NOT NULL CHECK (role IN (
    'admin', 'projectManager', 'warehouseManager',
    'logisticsAssociate', 'logisticsForeman', 'readonly'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Inventory items
CREATE TABLE inventory_items (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  sku             TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 0,
  unit            TEXT NOT NULL,                              -- 'ft', 'pcs', 'rolls'
  project         TEXT,                                       -- display name: 'Warehouse Stock', 'South Garage'
  location_value  TEXT REFERENCES locations(value),           -- FK to location
  location_detail TEXT,                                       -- free text: 'Warehouse A / Rack 3'
  status          TEXT NOT NULL DEFAULT 'Available',          -- 'Available', 'Low Stock', 'Out of Stock', 'Reserved', 'In Transit'
  category        TEXT NOT NULL,                              -- 'Plumbing', 'HVAC', 'Electrical', 'Hardware'
  unit_cost       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost      NUMERIC(12,2) NOT NULL DEFAULT 0,  -- auto-computed via trigger (qty * unit_cost)
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Requests: material requests from field crews
CREATE TABLE requests (
  id                       TEXT PRIMARY KEY,                  -- 'RQ-1001'
  status_value             TEXT NOT NULL DEFAULT 'pending_approval',
  location_value           TEXT REFERENCES locations(value),  -- destination site
  location_type            TEXT,                              -- 'site' or 'warehouse'
  project_value            TEXT REFERENCES projects(value),
  requested_by             TEXT NOT NULL,                     -- username
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  needed_by_date           DATE,
  order_date               DATE,                              -- PO fallback (stakeholder request)
  priority_value           TEXT DEFAULT 'normal',             -- 'low', 'normal', 'high', 'urgent'
  source_warehouse_value   TEXT REFERENCES locations(value),  -- which warehouse to pull from
  delivery_location_text   TEXT DEFAULT '',                   -- 'Loading Area', 'Dock 2', etc.
  notes                    TEXT DEFAULT '',
  approved_by              TEXT,                              -- username
  approved_at              TIMESTAMPTZ,
  rejected_by              TEXT,                              -- username
  rejected_at              TIMESTAMPTZ,
  approval_notes           TEXT DEFAULT ''
);

-- Request items: line items in a request
CREATE TABLE request_items (
  id                SERIAL PRIMARY KEY,
  request_id        TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  requested_quantity INTEGER NOT NULL
);

-- Manifests: shipment manifests for inventory movement
CREATE TABLE manifests (
  id                         TEXT PRIMARY KEY,                -- 'MO-1001', 'MR-1001', 'MW-1001'
  manifest_type_value        TEXT NOT NULL,                   -- 'outbound', 'return', 'warehouse_transfer'
  status_value               TEXT NOT NULL DEFAULT 'finalized',
  request_id                 TEXT REFERENCES requests(id),    -- linked request (if outbound)
  requested_by               TEXT DEFAULT '',
  approved_by                TEXT DEFAULT '',
  approved_at                TIMESTAMPTZ,
  created_by                 TEXT NOT NULL,                   -- username
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  manifest_date              DATE,
  location_value             TEXT REFERENCES locations(value),     -- destination
  project_value              TEXT REFERENCES projects(value),
  finalized_by               TEXT DEFAULT '',
  finalized_at               TIMESTAMPTZ,
  source_location_value      TEXT REFERENCES locations(value),
  destination_location_value TEXT REFERENCES locations(value),
  destination_detail         TEXT DEFAULT '',                 -- 'Dock 2', 'Staging Area'
  notes                      TEXT DEFAULT ''
);

-- Manifest items: line items in a manifest
CREATE TABLE manifest_items (
  id                TEXT PRIMARY KEY,                         -- 'MO-1001-1'
  manifest_id       TEXT NOT NULL REFERENCES manifests(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  manifest_quantity INTEGER NOT NULL
);

-- Transfers: actual shipment execution
CREATE TABLE transfers (
  id                         TEXT PRIMARY KEY,                -- 'TO-1001', 'TR-1001', 'TW-1001'
  manifest_id                TEXT REFERENCES manifests(id),
  request_id                 TEXT REFERENCES requests(id),
  requested_by               TEXT DEFAULT '',
  approved_by                TEXT DEFAULT '',
  approved_at                TIMESTAMPTZ,
  transfer_type_value        TEXT NOT NULL,                   -- 'outbound', 'return', 'warehouse_transfer'
  status_value               TEXT NOT NULL DEFAULT 'ready_to_ship',
  created_by                 TEXT NOT NULL,                   -- username
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  manifest_date              DATE,
  shipped_date               DATE,
  shipped_at                 TIMESTAMPTZ,
  shipped_by                 TEXT,
  received_date              DATE,
  received_at                TIMESTAMPTZ,
  received_by                TEXT,
  location_value             TEXT REFERENCES locations(value),
  project_value              TEXT REFERENCES projects(value),
  source_location_value      TEXT REFERENCES locations(value),
  destination_location_value TEXT REFERENCES locations(value),
  destination_detail         TEXT DEFAULT '',
  notes                      TEXT DEFAULT '',
  exception_notes            TEXT DEFAULT ''
);

-- Transfer items: per-item tracking with variance
CREATE TABLE transfer_items (
  id                TEXT PRIMARY KEY,                         -- 'TO-1001-1'
  transfer_id       TEXT NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  manifest_quantity INTEGER NOT NULL,
  shipped_quantity  INTEGER,
  received_quantity INTEGER,
  variance_reason   TEXT DEFAULT ''
);

-- Inventory adjustments: immutable audit log
CREATE TABLE inventory_adjustments (
  id                TEXT PRIMARY KEY,                         -- 'ADJ-1001'
  inventory_item_id INTEGER NOT NULL REFERENCES inventory_items(id),
  adjustment_type   TEXT NOT NULL CHECK (adjustment_type IN (
    'increase', 'decrease', 'set', 'returned'
  )),
  quantity_change   INTEGER NOT NULL,
  previous_quantity INTEGER NOT NULL,
  new_quantity      INTEGER NOT NULL,
  reason            TEXT NOT NULL,
  adjusted_by       TEXT NOT NULL,                            -- username
  adjusted_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Purchase orders: planned inventory that has not physically arrived yet
CREATE TABLE purchase_orders (
  id                     TEXT PRIMARY KEY DEFAULT generate_purchase_order_id(),
  po_number              TEXT NOT NULL,                       -- business-facing PO number
  vendor                 TEXT NOT NULL,
  status_value           TEXT NOT NULL DEFAULT 'entered' CHECK (status_value IN (
    'entered', 'partially_received', 'received',
    'closed_with_discrepancies', 'cancelled'
  )),
  expected_delivery_date DATE,
  entered_by             TEXT NOT NULL,                       -- username
  entered_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  location_value         TEXT REFERENCES locations(value),
  project_value          TEXT REFERENCES projects(value),
  notes                  TEXT NOT NULL DEFAULT '',
  po_document_name       TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Purchase order items: line items on a purchase order
CREATE TABLE purchase_order_items (
  id                SERIAL PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_number       INTEGER NOT NULL,
  material_name     TEXT NOT NULL,
  sku               TEXT NOT NULL,
  category          TEXT NOT NULL,
  ordered_quantity  INTEGER NOT NULL CHECK (ordered_quantity >= 0),
  unit              TEXT NOT NULL,
  unit_cost         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (purchase_order_id, line_number)
);

-- Receipts: one record per receiving event / delivery
CREATE TABLE receipts (
  id                TEXT PRIMARY KEY DEFAULT generate_receipt_id(),
  purchase_order_id TEXT REFERENCES purchase_orders(id),      -- nullable for manual receiving
  vendor            TEXT NOT NULL,
  po_number         TEXT NOT NULL,
  delivery_date     DATE NOT NULL,
  received_by       TEXT NOT NULL,                            -- username
  location_value    TEXT REFERENCES locations(value),
  project_value     TEXT REFERENCES projects(value),
  status_value      TEXT NOT NULL DEFAULT 'confirmed' CHECK (status_value IN ('confirmed')),
  has_discrepancy   BOOLEAN NOT NULL DEFAULT false,
  notes             TEXT NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Receipt items: actual quantities received in a specific delivery
CREATE TABLE receipt_items (
  id                        SERIAL PRIMARY KEY,
  receipt_id                TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  purchase_order_item_id    INTEGER REFERENCES purchase_order_items(id), -- nullable for manual receiving
  material_name             TEXT NOT NULL,
  sku                       TEXT NOT NULL,
  category                  TEXT NOT NULL,
  ordered_quantity_snapshot INTEGER NOT NULL DEFAULT 0 CHECK (ordered_quantity_snapshot >= 0),
  packing_slip_quantity     INTEGER NOT NULL DEFAULT 0 CHECK (packing_slip_quantity >= 0),
  received_quantity         INTEGER NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  unit                      TEXT NOT NULL,
  condition                 TEXT NOT NULL DEFAULT 'Good' CHECK (condition IN ('Good', 'Damaged', 'Partial')),
  variance_reason           TEXT NOT NULL DEFAULT '',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Receipt attachments: shared table for delivery, item, and label photos
CREATE TABLE receipt_attachments (
  id                     SERIAL PRIMARY KEY,
  receipt_id             TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  receipt_item_id        INTEGER REFERENCES receipt_items(id) ON DELETE CASCADE,
  receipt_item_serial_id INTEGER,
  attachment_type        TEXT NOT NULL CHECK (attachment_type IN (
    'delivery_photo', 'item_photo', 'label_photo'
  )),
  file_name              TEXT NOT NULL,
  file_path              TEXT NOT NULL,
  content_type           TEXT NOT NULL DEFAULT '',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Receipt item serials: one row per serialized unit received
CREATE TABLE receipt_item_serials (
  id                        SERIAL PRIMARY KEY,
  receipt_id                TEXT NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  receipt_item_id           INTEGER NOT NULL REFERENCES receipt_items(id) ON DELETE CASCADE,
  purchase_order_item_id    INTEGER REFERENCES purchase_order_items(id),
  project_value             TEXT REFERENCES projects(value),
  location_value            TEXT REFERENCES locations(value),
  serial_number             TEXT NOT NULL CHECK (btrim(serial_number) <> ''),
  label_photo_attachment_id INTEGER,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (receipt_item_id, serial_number)
);

ALTER TABLE receipt_attachments
  ADD CONSTRAINT receipt_attachments_serial_fk
  FOREIGN KEY (receipt_item_serial_id) REFERENCES receipt_item_serials(id) ON DELETE CASCADE;

ALTER TABLE receipt_item_serials
  ADD CONSTRAINT receipt_item_serials_label_attachment_fk
  FOREIGN KEY (label_photo_attachment_id) REFERENCES receipt_attachments(id) ON DELETE SET NULL;
