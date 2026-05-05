-- ============================================================
-- MEC2 Inventory Management System — Row Level Security
-- ============================================================
-- Run order: 05 (after everything else)
-- RLS is a safety net — the frontend permissions.js is the
-- primary UI gate. RLS blocks unauthorized operations even if
-- someone bypasses the frontend.
-- ============================================================


-- Enable RLS on all tables
ALTER TABLE locations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects               ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests               ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE manifests              ENABLE ROW LEVEL SECURITY;
ALTER TABLE manifest_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_adjustments  ENABLE ROW LEVEL SECURITY;


-- --------------------------------------------------------
-- LOCATIONS (admin-only writes)
-- --------------------------------------------------------
CREATE POLICY "locations_select" ON locations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "locations_insert" ON locations
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "locations_update" ON locations
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "locations_delete" ON locations
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));


-- --------------------------------------------------------
-- PROJECTS (admin-only writes)
-- --------------------------------------------------------
CREATE POLICY "projects_select" ON projects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "projects_insert" ON projects
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "projects_update" ON projects
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "projects_delete" ON projects
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));


-- --------------------------------------------------------
-- PROFILES (read all, update own, admin manages all)
-- --------------------------------------------------------
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_admin_insert" ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "profiles_admin_delete" ON profiles
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));


-- --------------------------------------------------------
-- INVENTORY ITEMS
-- --------------------------------------------------------
CREATE POLICY "inventory_select" ON inventory_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "inventory_insert" ON inventory_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "inventory_update" ON inventory_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "inventory_delete" ON inventory_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));


-- --------------------------------------------------------
-- REQUESTS
-- --------------------------------------------------------
CREATE POLICY "requests_select" ON requests
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "requests_insert" ON requests
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'logisticsForeman')
  ));

CREATE POLICY "requests_update" ON requests
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid()
    AND (
      p.role IN ('admin', 'projectManager')
      OR (
        p.role = 'logisticsForeman'
        AND requests.requested_by = p.username
        AND requests.status_value = 'pending_approval'
      )
    )
  ));

CREATE POLICY "requests_delete" ON requests
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));


-- --------------------------------------------------------
-- REQUEST ITEMS
-- --------------------------------------------------------
CREATE POLICY "request_items_select" ON request_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "request_items_insert" ON request_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'logisticsForeman')
  ));

CREATE POLICY "request_items_delete" ON request_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'logisticsForeman')
  ));


-- --------------------------------------------------------
-- MANIFESTS
-- --------------------------------------------------------
CREATE POLICY "manifests_select" ON manifests
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "manifests_insert" ON manifests
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "manifests_update" ON manifests
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager')
  ));

CREATE POLICY "manifests_delete" ON manifests
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));


-- --------------------------------------------------------
-- MANIFEST ITEMS
-- --------------------------------------------------------
CREATE POLICY "manifest_items_select" ON manifest_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "manifest_items_insert" ON manifest_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "manifest_items_delete" ON manifest_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));


-- --------------------------------------------------------
-- TRANSFERS
-- --------------------------------------------------------
CREATE POLICY "transfers_select" ON transfers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "transfers_insert" ON transfers
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "transfers_update" ON transfers
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "transfers_delete" ON transfers
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));


-- --------------------------------------------------------
-- TRANSFER ITEMS
-- --------------------------------------------------------
CREATE POLICY "transfer_items_select" ON transfer_items
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "transfer_items_insert" ON transfer_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "transfer_items_update" ON transfer_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

CREATE POLICY "transfer_items_delete" ON transfer_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));


-- --------------------------------------------------------
-- INVENTORY ADJUSTMENTS (immutable audit log)
-- --------------------------------------------------------
CREATE POLICY "adjustments_select" ON inventory_adjustments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "adjustments_insert" ON inventory_adjustments
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid()
    AND role IN ('admin', 'warehouseManager', 'logisticsAssociate', 'logisticsForeman')
  ));

-- No UPDATE or DELETE policies — audit log is immutable
