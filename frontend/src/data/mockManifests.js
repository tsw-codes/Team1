export const mockManifests = [
  {
    id: "MO-1001",
    manifestTypeValue: "outbound",
    manifestType: "outbound",
    statusValue: "finalized",
    status: "Finalized",

    requestId: "RQ-1002",
    requestedBy: "logistics_foreman",
    approvedBy: "pm",
    approvedAt: "2026-03-26T16:05:00",

    createdBy: "warehouse_mgr",
    createdAt: "2026-03-30T07:50:00",

    manifestDate: "2026-03-31",

    locationValue: "WT",
    location: "West Tower",
    projectValue: "WT-002",
    project: "West Tower - HVAC Upgrade",

    finalizedBy: "warehouse_mgr",
    finalizedAt: "2026-03-30T08:20:00",

    sourceLocationValue: "WH-C",
    sourceLocation: "Warehouse C",

    destinationLocationValue: "WT",
    destinationLocation: "West Tower",
    destinationDetail: "Dock 2",

    notes: "Approved request prepared for scheduled install delivery.",

    items: [
      {
        id: "MO-1001-1",
        inventoryItemId: 7,
        name: "Flexible Duct 10 in",
        sku: "FD-10",
        unit: "ft",
        manifestQuantity: 12,
      },
      {
        id: "MO-1001-2",
        inventoryItemId: 4,
        name: "Air Diffuser 24x24",
        sku: "AD-2424",
        unit: "pcs",
        manifestQuantity: 6,
      },
    ],
  },
  {
    id: "MW-1001",
    manifestTypeValue: "warehouse_transfer",
    manifestType: "warehouse_transfer",
    statusValue: "finalized",
    status: "Finalized",

    requestId: "",
    requestedBy: "",
    approvedBy: "",
    approvedAt: null,

    createdBy: "warehouse_mgr",
    createdAt: "2026-03-29T10:05:00",

    manifestDate: "2026-03-30",

    locationValue: "",
    location: "",
    projectValue: "",
    project: "",

    finalizedBy: "warehouse_mgr",
    finalizedAt: "2026-03-29T10:30:00",

    sourceLocationValue: "WH-A",
    sourceLocation: "Warehouse A",

    destinationLocationValue: "WH-B",
    destinationLocation: "Warehouse B",
    destinationDetail: "",

    notes: "Rebalancing inventory across warehouse locations.",

    items: [
      {
        id: "MW-1001-1",
        inventoryItemId: 3,
        name: "Electrical Conduit 1 in",
        sku: "EC-100",
        unit: "pcs",
        manifestQuantity: 24,
      },
      {
        id: "MW-1001-2",
        inventoryItemId: 5,
        name: "Ball Valve 2 in",
        sku: "BV-200",
        unit: "pcs",
        manifestQuantity: 4,
      },
    ],
  },
  {
    id: "MR-1001",
    manifestTypeValue: "return",
    manifestType: "return",
    statusValue: "finalized",
    status: "Finalized",

    requestId: "",
    requestedBy: "",
    approvedBy: "",
    approvedAt: null,

    createdBy: "pm",
    createdAt: "2026-03-28T13:10:00",

    manifestDate: "2026-03-29",

    locationValue: "SG",
    location: "South Garage",
    projectValue: "SG-001",
    project: "South Garage - Phase 1",

    finalizedBy: "warehouse_mgr",
    finalizedAt: "2026-03-28T13:45:00",

    sourceLocationValue: "SG",
    sourceLocation: "South Garage",

    destinationLocationValue: "WH-A",
    destinationLocation: "Warehouse A",
    destinationDetail: "",

    notes: "Return of unused materials after install phase.",

    items: [
      {
        id: "MR-1001-1",
        inventoryItemId: 9,
        name: "Copper Elbow 3/4 in",
        sku: "CE-075",
        unit: "pcs",
        manifestQuantity: 12,
      },
      {
        id: "MR-1001-2",
        inventoryItemId: 10,
        name: "Lighting Control Panel",
        sku: "LCP-01",
        unit: "pcs",
        manifestQuantity: 1,
      },
    ],
  },
]

export function getManifestById(id) {
  return mockManifests.find((manifest) => manifest.id === id) || null
}