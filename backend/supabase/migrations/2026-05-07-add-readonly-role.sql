-- ============================================================
-- Migration: add 'readonly' role for demo / observer users
-- Date: 2026-05-07
-- ============================================================
-- Run in: Supabase Dashboard → SQL Editor → paste → Run
--
-- After running this, also create the auth user. Two options:
--
--   Option A (CLI script):
--     SUPABASE_SERVICE_ROLE_KEY=<key> node backend/supabase/create-demo-users.mjs
--   The script is idempotent for existing users; it will create only the
--   new viewer@coolsys.com account.
--
--   Option B (Dashboard):
--     Authentication → Users → Add user → email viewer@coolsys.com,
--     password viewer123, then run the UPDATE at the bottom of this file
--     to set the profile role.
-- ============================================================


-- Drop the old CHECK constraint and recreate it with 'readonly' added
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN (
  'admin', 'projectManager', 'warehouseManager',
  'logisticsAssociate', 'logisticsForeman', 'readonly'
));


-- Optional: if you created the auth user via the dashboard, set the role on
-- the profile row that the handle_new_user trigger inserted. The trigger
-- defaults role to whatever it was given in user_metadata; if metadata was
-- empty, this UPDATE backfills it.
--
-- UPDATE profiles
-- SET role = 'readonly', name = 'Demo Viewer', username = 'viewer'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'viewer@coolsys.com');
