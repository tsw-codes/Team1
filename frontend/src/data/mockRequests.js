export const mockRequests = [
  {
    id: "RQ-1001",
    statusValue: "pending",
    status: "Pending",

    locationValue: "SG",
    location: "South Garage",
    locationType: "site",

    projectValue: "SG-002",
    project: "South Garage - Rough-In",

    requestedBy: "pm",
    createdAt: "2026-03-25T10:15:00",

    neededByDate: "2026-03-30",

    priorityValue: "high",
    priority: "High",

    sourceWarehouseValue: "WH-A",
    sourceWarehouse: "Warehouse A",

    deliveryLocationText: "Loading Area",
    notes: "Need material for next rough-in phase.",

    fulfilledBy: null,
    fulfilledAt: null,

    items: [
      { id: 1, inventoryItemId: 1, requestedQuantity: 80 },
      { id: 2, inventoryItemId: 5, requestedQuantity: 10 },
      { id: 3, inventoryItemId: 8, requestedQuantity: 25 },
    ],
  },
  {
    id: "RQ-1002",
    statusValue: "pending",
    status: "Pending",

    locationValue: "WT",
    location: "West Tower",
    locationType: "site",

    projectValue: "WT-002",
    project: "West Tower - HVAC Upgrade",

    requestedBy: "pm",
    createdAt: "2026-03-26T14:30:00",

    neededByDate: "2026-04-02",

    priorityValue: "normal",
    priority: "Normal",

    sourceWarehouseValue: "WH-C",
    sourceWarehouse: "Warehouse C",

    deliveryLocationText: "Dock 2",
    notes: "Need before scheduled install window.",

    fulfilledBy: null,
    fulfilledAt: null,

    items: [
      { id: 1, inventoryItemId: 7, requestedQuantity: 12 },
      { id: 2, inventoryItemId: 4, requestedQuantity: 6 },
    ],
  },
  {
    id: "RQ-1003",
    statusValue: "pending",
    status: "Pending",

    locationValue: "CO",
    location: "Central Office",
    locationType: "site",

    projectValue: "CO-001",
    project: "Central Office - Renovation",

    requestedBy: "pm",
    createdAt: "2026-03-27T09:45:00",

    neededByDate: "2026-04-05",

    priorityValue: "urgent",
    priority: "Urgent",

    sourceWarehouseValue: "WH-A",
    sourceWarehouse: "Warehouse A",

    deliveryLocationText: "Staging Area 8",
    notes: "Send what is available now. Remaining require a new request later.",

    fulfilledBy: null,
    fulfilledAt: null,

    items: [
      { id: 1, inventoryItemId: 6, requestedQuantity: 4 },
      { id: 2, inventoryItemId: 7, requestedQuantity: 5 },
    ],
  },
  {
    id: "RQ-1004",
    statusValue: "fulfilled",
    status: "Fulfilled",

    locationValue: "NA",
    location: "North Annex",
    locationType: "site",

    projectValue: "NA-001",
    project: "North Annex - Expansion",

    requestedBy: "pm",
    createdAt: "2026-03-20T08:10:00",

    neededByDate: "2026-03-22",

    priorityValue: "low",
    priority: "Low",

    sourceWarehouseValue: "WH-B",
    sourceWarehouse: "Warehouse B",

    deliveryLocationText: "Trailer 1",
    notes: "",

    fulfilledBy: "warehouse_mgr",
    fulfilledAt: "2026-03-22T15:25:00",

    items: [
      { id: 1, inventoryItemId: 1, requestedQuantity: 20 },
    ],
  },
]

export function getRequestById(requestId) {
  return mockRequests.find((request) => request.id === requestId) || null
}