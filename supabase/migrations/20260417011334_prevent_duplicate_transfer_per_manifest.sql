-- Prevent shipping the same manifest twice.
--
-- Without this, a manifest could be selected from the Ready-to-Ship list
-- repeatedly and produce multiple transfers — each one deducting source
-- inventory again on ship. Verified during end-to-end testing:
-- MO-1006 produced TO-1006 AND TO-1009 (both drained WH-A).
--
-- We use a trigger rather than a UNIQUE index so existing duplicate data
-- from pre-fix tests is not a migration blocker.

CREATE OR REPLACE FUNCTION prevent_duplicate_transfer_for_manifest()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.manifest_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM transfers
      WHERE manifest_id = NEW.manifest_id
        AND id <> NEW.id
    ) THEN
      RAISE EXCEPTION 'Manifest % has already been shipped. A manifest can only produce one transfer.', NEW.manifest_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER transfers_prevent_duplicate
  BEFORE INSERT ON transfers
  FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_transfer_for_manifest();
