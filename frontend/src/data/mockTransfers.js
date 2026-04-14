export const mockTransfers = [
  {
    id: "TW-1001",
    manifestId: "MW-1001",

    requestId: "",
    requestedBy: "",
    approvedBy: "",
    approvedAt: null,

    transferTypeValue: "warehouse_transfer",
    transferType: "warehouse_transfer",

    statusValue: "in_transit",
    status: "In Transit",

    createdBy: "warehouse_mgr",
    createdAt: "2026-03-31T09:15:00",
    manifestDate: "2026-03-30",

    shippedDate: "2026-03-31",
    shippedAt: "2026-03-31T09:15:00",
    shippedBy: "warehouse_mgr",

    receivedDate: null,
    receivedAt: null,
    receivedBy: null,

    locationValue: null,
    location: "",
    projectValue: null,
    project: "",

    sourceLocationValue: "WH-A",
    sourceLocation: "Warehouse A",

    destinationLocationValue: "WH-B",
    destinationLocation: "Warehouse B",
    destinationDetail: "",

    notes: "Rebalance stock between warehouse locations.",
    exceptionNotes: "",

    items: [
      {
        id: "TW-1001-1",
        inventoryItemId: 3,
        name: "Electrical Conduit 1 in",
        sku: "EC-100",
        unit: "pcs",
        manifestQuantity: 24,
        shippedQuantity: 24,
        receivedQuantity: null,
        varianceReason: "",
      },
      {
        id: "TW-1001-2",
        inventoryItemId: 5,
        name: "Ball Valve 2 in",
        sku: "BV-200",
        unit: "pcs",
        manifestQuantity: 4,
        shippedQuantity: 4,
        receivedQuantity: null,
        varianceReason: "",
      },
    ],
  },
  {
    id: "TR-1001",
    manifestId: "MR-1001",

    requestId: "",
    requestedBy: "",
    approvedBy: "",
    approvedAt: null,

    transferTypeValue: "return",
    transferType: "return",

    statusValue: "completed",
    status: "Completed",

    createdBy: "warehouse_mgr",
    createdAt: "2026-03-29T14:10:00",
    manifestDate: "2026-03-29",

    shippedDate: "2026-03-29",
    shippedAt: "2026-03-29T14:10:00",
    shippedBy: "warehouse_mgr",

    receivedDate: "2026-03-30",
    receivedAt: "2026-03-30T08:40:00",
    receivedBy: "warehouse_mgr",

    locationValue: "SG",
    location: "South Garage",
    projectValue: "SG-001",
    project: "South Garage - Phase 1",

    sourceLocationValue: "SG",
    sourceLocation: "South Garage",

    destinationLocationValue: "WH-A",
    destinationLocation: "Warehouse A",
    destinationDetail: "",

    notes: "Unused material returned from job site.",
    exceptionNotes: "1 fitting missing from expected return count.",

    items: [
      {
        id: "TR-1001-1",
        inventoryItemId: 9,
        name: "Copper Elbow 3/4 in",
        sku: "CE-075",
        unit: "pcs",
        manifestQuantity: 12,
        shippedQuantity: 12,
        receivedQuantity: 11,
        varianceReason: "1 missing during site pullback.",
      },
      {
        id: "TR-1001-2",
        inventoryItemId: 10,
        name: "Lighting Control Panel",
        sku: "LCP-01",
        unit: "pcs",
        manifestQuantity: 1,
        shippedQuantity: 1,
        receivedQuantity: 1,
        varianceReason: "",
      },
    ],
  },
  {
    id: "TO-1002",
    manifestId: "MO-1001",

    requestId: "RQ-1002",
    requestedBy: "logistics_foreman",
    approvedBy: "pm",
    approvedAt: "2026-03-26T16:05:00",

    transferTypeValue: "outbound",
    transferType: "outbound",

    statusValue: "exception",
    status: "Exception",

    createdBy: "logistics_assoc",
    createdAt: "2026-04-01T07:55:00",
    manifestDate: "2026-04-01",

    shippedDate: "2026-04-01",
    shippedAt: "2026-04-01T07:55:00",
    shippedBy: "logistics_assoc",

    receivedDate: "2026-04-01",
    receivedAt: "2026-04-01T12:20:00",
    receivedBy: "logistics_assoc",

    locationValue: "WT",
    location: "West Tower",
    projectValue: "WT-002",
    project: "West Tower - HVAC Upgrade",

    sourceLocationValue: "WH-C",
    sourceLocation: "Warehouse C",

    destinationLocationValue: "WT",
    destinationLocation: "West Tower",
    destinationDetail: "Dock 2",

    notes: "Outbound delivery for scheduled install window.",
    exceptionNotes: "Short delivery confirmed at site.",

    items: [
      {
        id: "TO-1002-1",
        inventoryItemId: 4,
        name: "Air Diffuser 24x24",
        sku: "AD-2424",
        unit: "pcs",
        manifestQuantity: 6,
        shippedQuantity: 6,
        receivedQuantity: 5,
        varianceReason: "1 unit missing at delivery.",
      },
      {
        id: "TO-1002-2",
        inventoryItemId: 6,
        name: "Breaker Panel 200A",
        sku: "BP-200A",
        unit: "pcs",
        manifestQuantity: 2,
        shippedQuantity: 2,
        receivedQuantity: 2,
        varianceReason: "",
      },
    ],
  },
  {
    id: "TO-1003",
    manifestId: "MO-1002",

    requestId: "RQ-1004",
    requestedBy: "logistics_foreman",
    approvedBy: "pm",
    approvedAt: "2026-03-20T10:25:00",

    transferTypeValue: "outbound",
    transferType: "outbound",

    statusValue: "completed",
    status: "Completed",

    createdBy: "logistics_assoc",
    createdAt: "2026-03-21T10:05:00",
    manifestDate: "2026-03-21",

    shippedDate: "2026-03-21",
    shippedAt: "2026-03-21T10:05:00",
    shippedBy: "logistics_assoc",

    receivedDate: "2026-03-21",
    receivedAt: "2026-03-21T13:20:00",
    receivedBy: "logistics_assoc",

    locationValue: "NA",
    location: "North Annex",
    projectValue: "NA-001",
    project: "North Annex - Expansion",

    sourceLocationValue: "WH-B",
    sourceLocation: "Warehouse B",

    destinationLocationValue: "NA",
    destinationLocation: "North Annex",
    destinationDetail: "Trailer 1",

    notes: "Delivered and received in full.",
    exceptionNotes: "",

    items: [
      {
        id: "TO-1003-1",
        inventoryItemId: 1,
        name: 'Copper Pipe 3/4"',
        sku: "CP-075",
        unit: "ft",
        manifestQuantity: 20,
        shippedQuantity: 20,
        receivedQuantity: 20,
        varianceReason: "",
      },
    ],
  },
]

export function getTransferById(id) {
  return mockTransfers.find((transfer) => transfer.id === id) || null
}

export function getTransfersByStatus(status) {
  return mockTransfers.filter((transfer) => (transfer.statusValue || transfer.status) === status)
}