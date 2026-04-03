export const mockRequests = [
    {
        id: "RQ-1001",
        status: "Pending",
        project: "South Garage",
        requestedBy: "pm",
        createdAt: "2026-03-25T10:15:00",

        neededByDate: "2026-03-30",
        priority: "High",
        deliveryLocation: "South Garage / Loading Area",
        notes: "Need material for next rough-in phase.",

        fulfilledBy: "",
        fulfilledAt: "",

        items: [
            {
                id: 1,
                inventoryItemId: 1,
                requestedQuantity: 80,
            },
            {
                id: 2,
                inventoryItemId: 5,
                requestedQuantity: 10,
            },
            {
                id: 3,
                inventoryItemId: 8,
                requestedQuantity: 25,
            },
        ],
    },
    {
        id: "RQ-1002",
        status: "Pending",
        project: "West Tower",
        requestedBy: "pm",
        createdAt: "2026-03-26T14:30:00",

        neededByDate: "2026-04-02",
        priority: "Normal",
        deliveryLocation: "West Tower / Dock 2",
        notes: "Need before scheduled install window.",

        fulfilledBy: "",
        fulfilledAt: "",

        items: [
            {
                id: 1,
                inventoryItemId: 7,
                requestedQuantity: 12,
            },
            {
                id: 2,
                inventoryItemId: 4,
                requestedQuantity: 6,
            },
        ],
    },
    {
        id: "RQ-1003",
        status: "Pending",
        project: "Central Office",
        requestedBy: "pm",
        createdAt: "2026-03-27T09:45:00",

        neededByDate: "2026-04-05",
        priority: "Urgent",
        deliveryLocation: "Central Office / Staging Area 8",
        notes: "Send what is available now. Remaining require a new request later.",

        fulfilledBy: "",
        fulfilledAt: "",

        items: [
            {
                id: 1,
                inventoryItemId: 6,
                requestedQuantity: 4,
            },
            {
                id: 2,
                inventoryItemId: 7,
                requestedQuantity: 5,
            },
        ],
    },
    {
        id: "RQ-1004",
        status: "Fulfilled",
        project: "North Annex",
        requestedBy: "pm",
        createdAt: "2026-03-20T08:10:00",

        neededByDate: "2026-03-22",
        priority: "Low",
        deliveryLocation: "North Annex / Trailer 1",
        notes: "",

        fulfilledBy: "warehouse_mgr",
        fulfilledAt: "2026-03-22T15:25:00",

        items: [
            {
                id: 1,
                inventoryItemId: 1,
                requestedQuantity: 20,
            },
        ],
    },
]

export const pendingRequests = mockRequests.filter(
    (request) => request.status === "Pending"
)

export function getRequestById(requestId) {
    return mockRequests.find((request) => request.id === requestId) || null
}