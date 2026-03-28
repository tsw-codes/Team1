export const mockRequests = [
    {
        id: "REQ-1001",
        status: "Pending",
        project: "South Garage",
        requestedBy: "pm",
        neededByDate: "2026-03-30",
        priority: "High",
        deliveryLocation: "South Garage / Loading Area",
        notes: "Need material for next rough-in phase.",
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
        id: "REQ-1002",
        status: "Pending",
        project: "West Tower",
        requestedBy: "pm",
        neededByDate: "2026-04-02",
        priority: "Normal",
        deliveryLocation: "West Tower / Dock 2",
        notes: "Need before scheduled install window.",
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
        id: "REQ-1003",
        status: "Pending",
        project: "Central Office",
        requestedBy: "pm",
        neededByDate: "2026-04-05",
        priority: "Urgent",
        deliveryLocation: "Central Office / Staging Area 8",
        notes: "Send what is available now.  Remaining require a new request later.",
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
        id: "REQ-1004",
        status: "Fulfilled",
        project: "North Annex",
        requestedBy: "pm",
        neededByDate: "2026-03-22",
        priority: "Low",
        deliveryLocation: "North Annex / Trailer 1",
        notes: "",
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