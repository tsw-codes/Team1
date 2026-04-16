export const mockRequests = [
  {
    id: "RQ-1001",
    statusValue: "pending_approval",
    status: "Pending Approval",

    locationValue: "SG",
    location: "South Garage",
    locationType: "site",

    projectValue: "SG-002",
    project: "South Garage - Rough-In",

    requestedBy: "logistics_foreman",
    createdAt: "2026-03-25T10:15:00",

    neededByDate: "2026-03-30",

    priorityValue: "high",
    priority: "High",

    sourceWarehouseValue: "WH-A",
    sourceWarehouse: "Warehouse A",

    deliveryLocationText: "Loading Area",
    notes: "Need material for next rough-in phase.",

    approvedBy: null,
    approvedAt: null,

    rejectedBy: null,
    rejectedAt: null,

    approvalNotes: "",

    items: [
      { id: 1, inventoryItemId: 1, requestedQuantity: 80 },
      { id: 2, inventoryItemId: 5, requestedQuantity: 10 },
      { id: 3, inventoryItemId: 8, requestedQuantity: 25 },
    ],
  },
  {
    id: "RQ-1002",
    statusValue: "approved",
    status: "Approved",

    locationValue: "WT",
    location: "West Tower",
    locationType: "site",

    projectValue: "WT-002",
    project: "West Tower - HVAC Upgrade",

    requestedBy: "logistics_foreman",
    createdAt: "2026-03-26T14:30:00",

    neededByDate: "2026-04-02",

    priorityValue: "normal",
    priority: "Normal",

    sourceWarehouseValue: "WH-C",
    sourceWarehouse: "Warehouse C",

    deliveryLocationText: "Dock 2",
    notes: "Need before scheduled install window.",

    approvedBy: "pm",
    approvedAt: "2026-03-26T16:05:00",

    rejectedBy: null,
    rejectedAt: null,

    approvalNotes: "Approved for scheduled install delivery.",

    items: [
      { id: 1, inventoryItemId: 7, requestedQuantity: 12 },
      { id: 2, inventoryItemId: 4, requestedQuantity: 6 },
    ],
  },
  {
    id: "RQ-1003",
    statusValue: "rejected",
    status: "Rejected",

    locationValue: "CO",
    location: "Central Office",
    locationType: "site",

    projectValue: "CO-001",
    project: "Central Office - Renovation",

    requestedBy: "logistics_foreman",
    createdAt: "2026-03-27T09:45:00",

    neededByDate: "2026-04-05",

    priorityValue: "urgent",
    priority: "Urgent",

    sourceWarehouseValue: "WH-A",
    sourceWarehouse: "Warehouse A",

    deliveryLocationText: "Staging Area 8",
    notes: "Send what is available now. Remaining require a new request later.",

    approvedBy: null,
    approvedAt: null,

    rejectedBy: "pm",
    rejectedAt: "2026-03-27T11:10:00",

    approvalNotes: "Please split this into separate requests by delivery urgency.",

    items: [
      { id: 1, inventoryItemId: 6, requestedQuantity: 4 },
      { id: 2, inventoryItemId: 7, requestedQuantity: 5 },
    ],
  },
  {
    id: "RQ-1004",
    statusValue: "approved",
    status: "Approved",

    locationValue: "NA",
    location: "North Annex",
    locationType: "site",

    projectValue: "NA-001",
    project: "North Annex - Expansion",

    requestedBy: "logistics_foreman",
    createdAt: "2026-03-20T08:10:00",

    neededByDate: "2026-03-22",

    priorityValue: "low",
    priority: "Low",

    sourceWarehouseValue: "WH-B",
    sourceWarehouse: "Warehouse B",

    deliveryLocationText: "Trailer 1",
    notes: "",

    approvedBy: "pm",
    approvedAt: "2026-03-20T10:25:00",

    rejectedBy: null,
    rejectedAt: null,

    approvalNotes: "Approved for processing.",

    items: [
      { id: 1, inventoryItemId: 1, requestedQuantity: 20 },
    ],
  },
  {
    id: "RQ-2001",
    statusValue: "pending_approval",
    status: "Pending Approval",

    locationValue: "SG",
    location: "South Garage",
    locationType: "site",

    projectValue: "SG-001",
    project: "South Garage - Phase 1",

    requestedBy: "logistics_foreman",
    createdAt: "2026-04-06T08:15:00",

    neededByDate: "2026-04-08",
    priorityValue: "urgent",
    priority: "Urgent",

    sourceWarehouseValue: "WH-A",
    sourceWarehouse: "Warehouse A",

    deliveryLocationText: "Level 2 Staging",
    notes: "Critical materials for install today.",

    approvedBy: null,
    approvedAt: null,

    rejectedBy: null,
    rejectedAt: null,

    approvalNotes: "",

    items: [
      { id: 1, inventoryItemId: 1, requestedQuantity: 60 },
      { id: 2, inventoryItemId: 5, requestedQuantity: 12 },
    ],
  },
  {
    id: "RQ-2002",
    statusValue: "pending_approval",
    status: "Pending Approval",

    locationValue: "WT",
    location: "West Tower",
    locationType: "site",

    projectValue: "WT-001",
    project: "West Tower - Core Buildout",

    requestedBy: "logistics_foreman",
    createdAt: "2026-04-05T11:40:00",

    neededByDate: "2026-04-09",
    priorityValue: "high",
    priority: "High",

    sourceWarehouseValue: "WH-C",
    sourceWarehouse: "Warehouse C",

    deliveryLocationText: "Dock 1",
    notes: "Prep for upcoming mechanical install.",

    approvedBy: null,
    approvedAt: null,

    rejectedBy: null,
    rejectedAt: null,

    approvalNotes: "",

    items: [
      { id: 1, inventoryItemId: 4, requestedQuantity: 8 },
      { id: 2, inventoryItemId: 6, requestedQuantity: 3 },
    ],
  },
  {
    id: "RQ-2003",
    statusValue: "pending_approval",
    status: "Pending Approval",

    locationValue: "CO",
    location: "Central Office",
    locationType: "site",

    projectValue: "CO-001",
    project: "Central Office - Renovation",

    requestedBy: "logistics_foreman",
    createdAt: "2026-04-04T09:25:00",

    neededByDate: "2026-04-12",
    priorityValue: "normal",
    priority: "Normal",

    sourceWarehouseValue: "WH-B",
    sourceWarehouse: "Warehouse B",

    deliveryLocationText: "Storage Room B",
    notes: "General material replenishment.",

    approvedBy: null,
    approvedAt: null,

    rejectedBy: null,
    rejectedAt: null,

    approvalNotes: "",

    items: [
      { id: 1, inventoryItemId: 7, requestedQuantity: 15 },
    ],
  },
  {
    id: "RQ-2004",
    statusValue: "pending_approval",
    status: "Pending Approval",

    locationValue: "NA",
    location: "North Annex",
    locationType: "site",

    projectValue: "NA-001",
    project: "North Annex - Expansion",

    requestedBy: "logistics_foreman",
    createdAt: "2026-04-03T14:10:00",

    neededByDate: "2026-04-07",
    priorityValue: "urgent",
    priority: "Urgent",

    sourceWarehouseValue: "WH-A",
    sourceWarehouse: "Warehouse A",

    deliveryLocationText: "Trailer 3",
    notes: "Install blocked until delivered.",

    approvedBy: null,
    approvedAt: null,

    rejectedBy: null,
    rejectedAt: null,

    approvalNotes: "",

    items: [
      { id: 1, inventoryItemId: 9, requestedQuantity: 20 },
    ],
  },
  {
    id: "RQ-2005",
    statusValue: "pending_approval",
    status: "Pending Approval",

    locationValue: "SG",
    location: "South Garage",
    locationType: "site",

    projectValue: "SG-002",
    project: "South Garage - Rough-In",

    requestedBy: "logistics_foreman",
    createdAt: "2026-04-02T10:30:00",

    neededByDate: "2026-04-10",
    priorityValue: "high",
    priority: "High",

    sourceWarehouseValue: "WH-A",
    sourceWarehouse: "Warehouse A",

    deliveryLocationText: "Loading Area",
    notes: "",

    approvedBy: null,
    approvedAt: null,

    rejectedBy: null,
    rejectedAt: null,

    approvalNotes: "",

    items: [
      { id: 1, inventoryItemId: 3, requestedQuantity: 30 },
    ],
  },
  {
    id: "RQ-2006",
    statusValue: "pending_approval",
    status: "Pending Approval",

    locationValue: "WT",
    location: "West Tower",
    locationType: "site",

    projectValue: "WT-002",
    project: "West Tower - HVAC Upgrade",

    requestedBy: "logistics_foreman",
    createdAt: "2026-04-01T15:20:00",

    neededByDate: "2026-04-15",
    priorityValue: "low",
    priority: "Low",

    sourceWarehouseValue: "WH-C",
    sourceWarehouse: "Warehouse C",

    deliveryLocationText: "Mechanical Room",
    notes: "Non-urgent restock.",

    approvedBy: null,
    approvedAt: null,

    rejectedBy: null,
    rejectedAt: null,

    approvalNotes: "",

    items: [
      { id: 1, inventoryItemId: 8, requestedQuantity: 10 },
    ],
  },
  {
    id: "RQ-2007",
    statusValue: "pending_approval",
    status: "Pending Approval",

    locationValue: "CO",
    location: "Central Office",
    locationType: "site",

    projectValue: "CO-001",
    project: "Central Office - Renovation",

    requestedBy: "logistics_foreman",
    createdAt: "2026-04-06T07:10:00",

    neededByDate: "2026-04-08",
    priorityValue: "urgent",
    priority: "Urgent",

    sourceWarehouseValue: "WH-B",
    sourceWarehouse: "Warehouse B",

    deliveryLocationText: "Floor 3",
    notes: "Needed for inspection readiness.",

    approvedBy: null,
    approvedAt: null,

    rejectedBy: null,
    rejectedAt: null,

    approvalNotes: "",

    items: [
      { id: 1, inventoryItemId: 10, requestedQuantity: 2 },
    ],
  },
  {
    id: "RQ-2008",
    statusValue: "pending_approval",
    status: "Pending Approval",

    locationValue: "NA",
    location: "North Annex",
    locationType: "site",

    projectValue: "NA-001",
    project: "North Annex - Expansion",

    requestedBy: "logistics_foreman",
    createdAt: "2026-04-05T13:45:00",

    neededByDate: "2026-04-11",
    priorityValue: "normal",
    priority: "Normal",

    sourceWarehouseValue: "WH-B",
    sourceWarehouse: "Warehouse B",

    deliveryLocationText: "Staging Area",
    notes: "",

    approvedBy: null,
    approvedAt: null,

    rejectedBy: null,
    rejectedAt: null,

    approvalNotes: "",

    items: [
      { id: 1, inventoryItemId: 6, requestedQuantity: 4 },
    ],
  },
]