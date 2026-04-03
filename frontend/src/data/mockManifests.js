export const mockManifests = [
  {
    id: "MO-1001",
    manifestType: "outbound",
    status: "finalized",

    requestId: "RQ-1001",

    createdBy: "warehouse_mgr",
    createdAt: "2026-03-30T07:50:00",

    manifestDate: "2026-03-31",

    finalizedBy: "warehouse_mgr",
    finalizedAt: "2026-03-30T08:20:00",

    sourceLocation: "Warehouse A",
    destinationLocation: "South Garage / Loading Area",

    notes: "Partial fulfillment due to stock availability.",

    items: [
      {
        id: "MO-1001-1",
        inventoryItemId: 1,
        name: 'Copper Pipe 3/4"',
        sku: "CP-075",
        unit: "ft",
        manifestQuantity: "80",
      },
      {
        id: "MO-1001-2",
        inventoryItemId: 5,
        name: "Ball Valve 2 in",
        sku: "BV-200",
        unit: "pcs",
        manifestQuantity: "7",
      },
      {
        id: "MO-1001-3",
        inventoryItemId: 8,
        name: "Threaded Rod 1/2 in",
        sku: "TR-050",
        unit: "pcs",
        manifestQuantity: "25",
      },
    ],
  },

  {
    id: "MW-1001",
    manifestType: "warehouse_transfer",
    status: "finalized",

    requestId: "",

    createdBy: "warehouse_mgr",
    createdAt: "2026-03-29T10:05:00",

    manifestDate: "2026-03-30",

    finalizedBy: "warehouse_mgr",
    finalizedAt: "2026-03-29T10:30:00",

    sourceLocation: "Warehouse A",
    destinationLocation: "Warehouse B",

    notes: "Rebalancing inventory across warehouse locations.",

    items: [
      {
        id: "MW-1001-1",
        inventoryItemId: 3,
        name: "Electrical Conduit 1 in",
        sku: "EC-100",
        unit: "pcs",
        manifestQuantity: "24",
      },
      {
        id: "MW-1001-2",
        inventoryItemId: 5,
        name: "Ball Valve 2 in",
        sku: "BV-200",
        unit: "pcs",
        manifestQuantity: "4",
      },
    ],
  },

  {
    id: "MR-1001",
    manifestType: "return",
    status: "finalized",

    requestId: "",

    createdBy: "pm",
    createdAt: "2026-03-28T13:10:00",

    manifestDate: "2026-03-29",

    finalizedBy: "warehouse_mgr",
    finalizedAt: "2026-03-28T13:45:00",

    sourceLocation: "South Garage",
    destinationLocation: "Warehouse A",

    notes: "Return of unused materials after install phase.",

    items: [
      {
        id: "MR-1001-1",
        inventoryItemId: 9,
        name: "Copper Elbow 3/4 in",
        sku: "CE-075",
        unit: "pcs",
        manifestQuantity: "12",
      },
      {
        id: "MR-1001-2",
        inventoryItemId: 10,
        name: "Lighting Control Panel",
        sku: "LCP-01",
        unit: "pcs",
        manifestQuantity: "1",
      },
    ],
  },
]

export const finalizedManifests = mockManifests.filter(
  (manifest) => manifest.status === "finalized"
)

export function getManifestById(id) {
  return mockManifests.find((manifest) => manifest.id === id) || null
}