export const mockTransfers = [
  {
    id: "TW-1001",
    manifestId: "MW-1001",
    transferType: "warehouse_transfer",
    status: "in_transit",

    createdBy: "warehouse_mgr",
    manifestDate: "2026-03-30",

    shippedDate: "2026-03-31",
    shippedAt: "2026-03-31T09:15:00",
    shippedBy: "warehouse_mgr",

    receivedDate: "",
    receivedAt: "",
    receivedBy: "",

    sourceLocation: "Warehouse A",
    destinationLocation: "Warehouse B",

    notes: "Rebalance stock between warehouse locations.",
    exceptionNotes: "",

    items: [
      {
        id: "TW-1001-1",
        inventoryItemId: 3,
        name: "Electrical Conduit 1 in",
        sku: "EC-100",
        unit: "pcs",
        manifestQuantity: "24",
        shippedQuantity: "24",
        receivedQuantity: "",
        varianceReason: "",
      },
      {
        id: "TW-1001-2",
        inventoryItemId: 5,
        name: "Ball Valve 2 in",
        sku: "BV-200",
        unit: "pcs",
        manifestQuantity: "4",
        shippedQuantity: "4",
        receivedQuantity: "",
        varianceReason: "",
      },
    ],
  },

  {
    id: "TR-1001",
    manifestId: "MR-1001",
    transferType: "return",
    status: "completed",

    createdBy: "warehouse_mgr",
    manifestDate: "2026-03-29",

    shippedDate: "2026-03-29",
    shippedAt: "2026-03-29T14:10:00",
    shippedBy: "warehouse_mgr",

    receivedDate: "2026-03-30",
    receivedAt: "2026-03-30T08:40:00",
    receivedBy: "warehouse_mgr",

    sourceLocation: "South Garage",
    destinationLocation: "Warehouse A",

    notes: "Unused material returned from job site.",
    exceptionNotes: "1 fitting missing from expected return count.",

    items: [
      {
        id: "TR-1001-1",
        inventoryItemId: 9,
        name: "Copper Elbow 3/4 in",
        sku: "CE-075",
        unit: "pcs",
        manifestQuantity: "12",
        shippedQuantity: "12",
        receivedQuantity: "11",
        varianceReason: "1 missing during site pullback.",
      },
      {
        id: "TR-1001-2",
        inventoryItemId: 10,
        name: "Lighting Control Panel",
        sku: "LCP-01",
        unit: "pcs",
        manifestQuantity: "1",
        shippedQuantity: "1",
        receivedQuantity: "1",
        varianceReason: "",
      },
    ],
  },

  {
    id: "TO-1002",
    manifestId: "MO-1002",
    transferType: "outbound",
    status: "exception",

    createdBy: "logistics_assoc",
    manifestDate: "2026-04-01",

    shippedDate: "2026-04-01",
    shippedAt: "2026-04-01T07:55:00",
    shippedBy: "logistics_assoc",

    receivedDate: "2026-04-01",
    receivedAt: "2026-04-01T12:20:00",
    receivedBy: "logistics_assoc",

    sourceLocation: "Warehouse C",
    destinationLocation: "West Tower / Dock 2",

    notes: "Outbound delivery for scheduled install window.",
    exceptionNotes: "Short delivery confirmed at site.",

    items: [
      {
        id: "TO-1002-1",
        inventoryItemId: 4,
        name: "Air Diffuser 24x24",
        sku: "AD-2424",
        unit: "pcs",
        manifestQuantity: "6",
        shippedQuantity: "6",
        receivedQuantity: "5",
        varianceReason: "1 unit missing at delivery.",
      },
      {
        id: "TO-1002-2",
        inventoryItemId: 6,
        name: "Breaker Panel 200A",
        sku: "BP-200A",
        unit: "pcs",
        manifestQuantity: "2",
        shippedQuantity: "2",
        receivedQuantity: "2",
        varianceReason: "",
      },
    ],
  },
]

export function getTransferById(id) {
  return mockTransfers.find((transfer) => transfer.id === id) || null
}

export function getTransfersByStatus(status) {
  return mockTransfers.filter((transfer) => transfer.status === status)
}