-- ============================================================
-- MEC2 Inventory Management System - Purchase Orders + Receipts
-- Rollback Script
-- ============================================================
-- Removes only the additive PO/receipt objects introduced by:
--   20260501130000_add_purchase_orders_and_receipts.sql
-- ============================================================


-- --------------------------------------------------------
-- TRIGGERS
-- --------------------------------------------------------

DROP TRIGGER IF EXISTS receipt_items_apply_to_inventory ON receipt_items;
DROP TRIGGER IF EXISTS receipt_items_sync_receipt_and_po_status_delete ON receipt_items;
DROP TRIGGER IF EXISTS receipt_items_sync_receipt_and_po_status_update ON receipt_items;
DROP TRIGGER IF EXISTS receipt_items_sync_receipt_and_po_status_insert ON receipt_items;
DROP TRIGGER IF EXISTS receipt_items_validate_po_link ON receipt_items;
DROP TRIGGER IF EXISTS receipts_validate_role ON receipts;
DROP TRIGGER IF EXISTS purchase_orders_set_updated_at ON purchase_orders;


-- --------------------------------------------------------
-- VIEWS
-- --------------------------------------------------------

DROP VIEW IF EXISTS receipts_view;
DROP VIEW IF EXISTS purchase_order_items_view;
DROP VIEW IF EXISTS purchase_orders_view;


-- --------------------------------------------------------
-- POLICIES
-- --------------------------------------------------------

DROP POLICY IF EXISTS "receipt_items_insert" ON receipt_items;
DROP POLICY IF EXISTS "receipt_items_select" ON receipt_items;
DROP POLICY IF EXISTS "receipts_insert" ON receipts;
DROP POLICY IF EXISTS "receipts_select" ON receipts;
DROP POLICY IF EXISTS "purchase_order_items_delete" ON purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_update" ON purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_insert" ON purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_select" ON purchase_order_items;
DROP POLICY IF EXISTS "purchase_orders_update" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_insert" ON purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_select" ON purchase_orders;


-- --------------------------------------------------------
-- TABLES
-- --------------------------------------------------------

DROP TABLE IF EXISTS receipt_items;
DROP TABLE IF EXISTS receipts;
DROP TABLE IF EXISTS purchase_order_items;
DROP TABLE IF EXISTS purchase_orders;


-- --------------------------------------------------------
-- FUNCTIONS
-- --------------------------------------------------------

DROP FUNCTION IF EXISTS apply_confirmed_receipt_item_to_inventory();
DROP FUNCTION IF EXISTS sync_receipt_discrepancy_and_po_status();
DROP FUNCTION IF EXISTS recalculate_purchase_order_status(TEXT);
DROP FUNCTION IF EXISTS validate_receipt_role();
DROP FUNCTION IF EXISTS validate_purchase_order_item_link();
DROP FUNCTION IF EXISTS update_purchase_order_updated_at();
DROP FUNCTION IF EXISTS generate_receipt_id();
DROP FUNCTION IF EXISTS generate_purchase_order_id();
