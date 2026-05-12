# Known Gaps

Tracked items the team knows about and has chosen not to fix yet. Each entry should say what the gap is, why it exists, and what closing it would take so future work can pick it up cleanly.

---

## Manifest-vs-requested variance is silent

**What's missing.** When a Warehouse Manager manifests less than was originally requested, the system records both numbers (`request_items.quantity` and `manifest_items.manifest_quantity`) but does not flag or surface the discrepancy anywhere in the UI. A foreman who requested 20 and received 12 has no in-app way to see why the gap exists.

**Where this shows up in code.**

- `frontend/src/components/ManifestInventoryPage.jsx:38-41` — when building a manifest from a request, `manifestQuantity` auto-fills to `MIN(requestedQuantity, availableInventory)`. Short-manifesting is the default behavior when stock is low.
- `frontend/src/components/ManifestInventoryPage.jsx:544-545` — validation only blocks the *upper* bound (manifest cannot exceed requested). There is no lower-bound check and no required reason for short-manifesting.
- `frontend/src/components/ShipmentTrackingPage.jsx` — detail panel shows either requested OR manifest quantity depending on which record type is open, never side by side.

**Current variance coverage by stage.**

| Stage | Possible variance | Tracked in DB | Flagged in UI |
|---|---|---|---|
| Request → Manifest | Manifested < requested | Implicit (both stored, no link surfaced) | No |
| Manifest → Ship | Shipped not equal to manifested | Schema supports it, UI hard-codes shipped = manifest at `TransferInventoryPage.jsx:480` | No |
| Ship → Receive | Received not equal to shipped | Yes, with `variance_reason` | Yes, amber-highlighted on Shipment Tracking detail and in the Audit Log |

So the receipt step is the only place a human-entered "actual" number can disagree with the planned number today.

**What closing it would take.**

1. Render manifest-vs-requested side by side on the Pending Requests and Shipment Tracking detail panels for any record that has both a request and a manifest. Amber-highlight when they differ. Pattern already exists for receipt variance on `ShipmentTrackingPage.jsx`.
2. Optionally, require the Warehouse Manager to enter a `manifest_shortage_reason` when manifesting less than requested. Same data-model shape as `variance_reason`, applied one step earlier in the pipeline.
3. Surface manifest-shortage events in the Audit Log feed (`auditService` on `main`) so they live in the same place as receipt variances.

Estimated effort: small. The data is already there in both tables; this is a render-and-validate change, not a schema change.
