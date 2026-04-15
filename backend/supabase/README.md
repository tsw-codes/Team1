# Supabase SQL Files

Run these in the **Supabase SQL Editor** in numbered order:

| File | What it does |
|---|---|
| `01_tables.sql` | Creates all 11 tables |
| `02_views.sql` | Creates views that join labels for the frontend |
| `03_functions.sql` | Profile auto-creation, computed fields, ID generation, adjustment RPC |
| `04_validation.sql` | Workflow state transitions, role-type checks, inventory auto-adjustment |
| `05_rls.sql` | Row Level Security policies for all tables |
| `seed.sql` | Demo data (locations, inventory, requests, manifests, transfers) |

Run `seed.sql` last, after all schema files.
