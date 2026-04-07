export const mockInventoryAdjustments = []

export function getInventoryAdjustmentsById(id) {
    return mockInventoryAdjustments.find((adjustment) => adjustment.id === id) || null
}