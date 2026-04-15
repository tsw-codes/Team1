# Stakeholder Meeting Notes

Chronological notes from meetings with William Tikiob (MEC2).

---

## 2024-02-24 — App Design, Logistics Structure, Inventory Tracking

### Summary

- William prefers an iOS app but accepts a web app due to Apple marketplace restrictions
- System should store: **material, size, qty, and location**
- **Pricing visibility**: visible to Project Managers and Admin only — NOT to Logistics Associates
- **Order flow**: PM places order → delivered to warehouse (WM receives) or job site (LA confirms delivery)
- **Warehouse → Site transfers**: inventory can move from warehouse to site, but no tracking or manifest currently exists (this is a gap they need solved)
- **Site → Warehouse restocking**: excess site inventory needs to be returned to a warehouse
- **Warehouse bins**: warehouses don't currently use bins/areas, but William likes the idea for the future
- **Login**: employees should log in with company email (`first_name.last_name@coolsys.com`)
- **Alerts**: PMs should receive an alert/email when material arrives at a project site

### New Feature Requests

- Login with company email
- Manifest inventory moves with confirmation between warehouse/site
- Restrict logistics team from viewing pricing

### Plan (from team)

- Design database with warehouse bins in mind (start with 1 bin per warehouse, allow expansion)
- Design database queries specific to permissions
- Dynamic UI based on permissions
- Track inventory movements in a log, red-flag discrepancies

---

## 2026-03-03 — Tomisin's Notes

### Key Takeaways

- **Photo batch entry**: An intern was able to take batch pictures of items and put the info into a spreadsheet (validates the photo/OCR approach)
- **Wrong inventory use case**: If packing slip is correct but actual inventory received is wrong:
  - Should be able to **delete the inventory** from the system
  - Add a **note** that the inventory was wrong and was sent back
- **Order date as backup**: Add order date as a fallback if PO number is not available
