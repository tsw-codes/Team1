# `admin-manage-users` Edge Function

Secure admin-only backend for MEC2 user management.

## Purpose

This function is intended to back the frontend `Manage Users` page for:

- listing users with last-login data
- creating auth users + profile sync
- updating names / email / role
- setting passwords
- deactivating users immediately
- reactivating users

## Required secrets

This function expects the standard Supabase function environment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Deploy

From the repo root:

```powershell
supabase functions deploy admin-manage-users
```

If you need to set secrets locally first:

```powershell
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Notes

- Caller must be an active `admin`.
- The frontend currently has a read fallback against `profiles` if this function is not deployed yet.
- Create / update / deactivate / reactivate actions require this function to be deployed.
