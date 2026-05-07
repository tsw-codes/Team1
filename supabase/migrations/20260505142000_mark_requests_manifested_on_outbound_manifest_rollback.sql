BEGIN;

DROP TRIGGER IF EXISTS manifests_mark_request_manifested ON manifests;
DROP FUNCTION IF EXISTS mark_request_manifested_on_manifest_create();

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
      RAISE EXCEPTION 'This request has already been approved. Approved requests cannot be changed.';
    WHEN 'rejected' THEN
      RAISE EXCEPTION 'This request has been rejected. Rejected requests cannot be changed.';
    ELSE
      RAISE EXCEPTION 'Unknown request status: "%".', OLD.status_value;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

COMMIT;
