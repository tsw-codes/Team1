import { mockInventoryAdjustments } from "../data/mockInventoryAdjustments"

const adjustmentDataSource = {
    getAll() {
        return mockInventoryAdjustments
    },

    findById(id) {
        return mockInventoryAdjustments.find(
            (adjustment) => adjustment.id === id
        ) || null
    },

    insert(adjustment) {
        mockInventoryAdjustments.unshift(adjustment)
        return adjustment
    },

    replaceById(id, updatedAdjustment) {
        const index = mockInventoryAdjustments.findIndex(
            (adjustment) => adjustment.id === id
        )

        if (index === -1) return null

        mockInventoryAdjustments[index] = updatedAdjustment
        return mockInventoryAdjustments[index]
    },
}

function generateAdjustmentId() {
    const prefix = "ADJ"

    const matchingIds = adjustmentDataSource
        .getAll()
        .map((a) => {
            const numericPart = Number(String(a.id || "").split("-")[1])
            return Number.isNaN(numericPart) ? 0 : numericPart
        })

    const nextNumber =
        matchingIds.length > 0 ? Math.max(...matchingIds) + 1 : 1001

    return `${prefix}-${nextNumber}`
}

export function getAllInventoryAdjustments() {
    return adjustmentDataSource.getAll()
}

export function findInventoryAdjustmentById(id) {
    return adjustmentDataSource.findById(id)
}

export function createInventoryAdjustment(newAdjustment) {
    const adjustmentWithId = {
        ...newAdjustment,
        id: generateAdjustmentId(),
    }

    return adjustmentDataSource.insert(adjustmentWithId)
}

export function updateInventoryAdjustment(id, updates) {
    const existing = adjustmentDataSource.findById(id)
    if (!existing) return null

    const updated = {
        ...existing,
        ...updates,
    }

    return adjustmentDataSource.replaceById(id, updated)
}