export const mockManifests = [
  {
    id: "MO-1001",
    manifestTypeValue: "outbound",
    manifestType: "outbound",
    statusValue: "finalized",
    status: "Finalized",

    requestId: "RQ-1001",

    createdBy: "warehouse_mgr",
    createdAt: "2026-03-30T07:50:00",

    manifestDate: "2026-03-31",

    locationValue: "SG",
    location: "South Garage",
    projectValue: "SG-002",
    project: "South Garage - Rough-In",

    finalizedBy: "warehouse_mgr",
    finalizedAt: "2026-03-30T08:20:00",

    sourceLocationValue: "WH-A",
    sourceLocation: "Warehouse A",

    destinationLocationValue: "SG",
    destinationLocation: "South Garage",
    destinationDetail: "Loading Area",

    notes: "Partial fulfillment due to stock availability.",

    items: [
      { id: "MO-1001-1", inventoryItemId: 1, name: 'Copper Pipe 3/4"', sku: "CP-075", unit: "ft", manifestQuantity: 80 },
      { id: "MO-1001-2", inventoryItemId: 5, name: "Ball Valve 2 in", sku: "BV-200", unit: "pcs", manifestQuantity: 7 },
      { id: "MO-1001-3", inventoryItemId: 8, name: "Threaded Rod 1/2 in", sku: "TR-050", unit: "pcs", manifestQuantity: 25 },
    ],
  },
  {
    id: "MW-1001",
    manifestTypeValue: "warehouse_transfer",
    manifestType: "warehouse_transfer",
    statusValue: "finalized",
    status: "Finalized",

    requestId: "",

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
      { id: "MW-1001-1", inventoryItemId: 3, name: "Electrical Conduit 1 in", sku: "EC-100", unit: "pcs", manifestQuantity: 24 },
      { id: "MW-1001-2", inventoryItemId: 5, name: "Ball Valve 2 in", sku: "BV-200", unit: "pcs", manifestQuantity: 4 },
    ],
  },
  {
    id: "MR-1001",
    manifestTypeValue: "return",
    manifestType: "return",
    statusValue: "finalized",
    status: "Finalized",

    requestId: "",

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
      { id: "MR-1001-1", inventoryItemId: 9, name: "Copper Elbow 3/4 in", sku: "CE-075", unit: "pcs", manifestQuantity: 12 },
      { id: "MR-1001-2", inventoryItemId: 10, name: "Lighting Control Panel", sku: "LCP-01", unit: "pcs", manifestQuantity: 1 },
    ],
  },
]

export function getManifestById(id) {
  return mockManifests.find((manifest) => manifest.id === id) || null
}