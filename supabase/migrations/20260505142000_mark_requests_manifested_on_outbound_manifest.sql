BEGIN;

CREATE OR REPLACE FUNCTION validate_request_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status_value = NEW.status_value THEN
    RETURN NEW;
  END IF;

  CASE OLD.status_value
    WHEN 'pending_approval' THEN
      IF NEW.status_value NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION 'Pending requests can only be approved or rejected, not "%".', NEW.status_value;
      END IF;
    WHEN 'approved' THEN
      IF NEW.status_value NOT IN ('manifested') THEN
        RAISE EXCEPTION 'Approved requests can only move to "manifested", not "%".', NEW.status_value;
      END IF;
    WHEN 'rejected' THEN
      RAISE EXCEPTION 'This request has been rejected. Rejected requests cannot be changed.';
    WHEN 'manifested' THEN
      RAISE EXCEPTION 'This request has already been manifested. Manifested requests cannot be changed.';
    ELSE
      RAISE EXCEPTION 'Unknown request status: "%".', OLD.status_value;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION mark_request_manifested_on_manifest_create()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.request_id IS NOT NULL AND NEW.manifest_type_value = 'outbound' THEN
    UPDATE requests
    SET status_value = 'manifested'
    WHERE id = NEW.request_id
      AND status_value = 'approved';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS manifests_mark_request_manifested ON manifests;

CREATE TRIGGER manifests_mark_request_manifested
  AFTER INSERT ON manifests
  FOR EACH ROW EXECUTE FUNCTION mark_request_manifested_on_manifest_create();

COMMIT;
