-- ============================================================
-- MEC2 Inventory Management System - Receipt Serials + Attachments
-- Rollback Script
-- ============================================================
-- Removes only the additive serial/attachment objects introduced by:
--   20260501190000_add_receipt_serials_and_attachments.sql
-- ============================================================

DROP TRIGGER IF EXISTS receipt_item_serials_validate_context ON receipt_item_serials;
DROP TRIGGER IF EXISTS receipt_attachments_validate_receipt_consistency ON receipt_attachments;
DROP TRIGGER IF EXISTS receipt_attachments_validate_scope ON receipt_attachments;

DROP POLICY IF EXISTS "receipt_item_serials_update" ON receipt_item_serials;
DROP POLICY IF EXISTS "receipt_item_serials_insert" ON receipt_item_serials;
DROP POLICY IF EXISTS "receipt_item_serials_select" ON receipt_item_serials;
DROP POLICY IF EXISTS "receipt_attachments_update" ON receipt_attachments;
DROP POLICY IF EXISTS "receipt_attachments_insert" ON receipt_attachments;
DROP POLICY IF EXISTS "receipt_attachments_select" ON receipt_attachments;

DROP FUNCTION IF EXISTS validate_receipt_item_serial_context();
DROP FUNCTION IF EXISTS validate_receipt_attachment_receipt_consistency();
DROP FUNCTION IF EXISTS validate_receipt_attachment_scope();

DROP TABLE IF EXISTS receipt_item_serials;
DROP TABLE IF EXISTS receipt_attachments;
