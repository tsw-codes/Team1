import { mockTransfers } from "../data/mockTransfers"

const transferPermissionMap = {
    outbound: "transfer_to_job_site",
    return: "transfer_to_warehouse",
    warehouse_transfer: "transfer_to_warehouse",
}

const ACTIVE_STATUSES = ["ready_to_ship", "in_transit"]

let transferListeners = []

export function subscribeToTransfers(listener) {
    transferListeners.push(listener)

    return () => {
        transferListeners = transferListeners.filter((l) => l !== listener)
    }
}

function notifyTransferChange() {
    transferListeners.forEach((listener) => listener())
}

const transferDataSource = {
    getAll() {
        return mockTransfers
    },

    findById(id) {
        return mockTransfers.find((transfer) => transfer.id === id) || null
    },

    insert(transfer) {
        mockTransfers.unshift(transfer)
        return transfer
    },

    replaceById(id, updatedTransfer) {
        const index = mockTransfers.findIndex((transfer) => transfer.id === id)

        if (index === -1) return null

        mockTransfers[index] = updatedTransfer
        return mockTransfers[index]
    },

    deleteById(id) {
        const index = mockTransfers.findIndex((transfer) => transfer.id === id)

        if (index === -1) return false

        mockTransfers.splice(index, 1)
        return true
    },
}

function getTransferPrefix(transferType) {
    if (transferType === "outbound") return "TO"
    if (transferType === "return") return "TR"
    if (transferType === "warehouse_transfer") return "TW"
    return "T"
}

function generateTransferId(transferType) {
    const prefix = getTransferPrefix(transferType)

    const matchingIds = transferDataSource
        .getAll()
        .filter((transfer) => transfer.id.startsWith(`${prefix}-`))
        .map((transfer) => {
            const numericPart = Number(transfer.id.split("-")[1])
            return Number.isNaN(numericPart) ? 0 : numericPart
        })

    const nextNumber =
        matchingIds.length > 0 ? Math.max(...matchingIds) + 1 : 1001

    return `${prefix}-${nextNumber}`
}

export function getAllTransfers() {
    return transferDataSource.getAll()
}

export function findTransferById(id) {
    return transferDataSource.findById(id)
}

export function getTransfersForPermissions(permissions = []) {
    return transferDataSource.getAll().filter((transfer) => {
        const statusValue = transfer.statusValue || transfer.status
        if (!ACTIVE_STATUSES.includes(statusValue)) return false

        const requiredPermission = transferPermissionMap[transfer.transferType]
        return requiredPermission ? permissions.includes(requiredPermission) : false
    })
}

export function createTransfer(newTransfer) {
    const transferTypeValue = newTransfer.transferTypeValue || newTransfer.transferType

    const transferWithId = {
        ...newTransfer,
        id: generateTransferId(transferTypeValue),
        transferTypeValue,
        transferType: newTransfer.transferType || transferTypeValue,
        statusValue: newTransfer.statusValue || "in_transit",
        status: newTransfer.status || "In Transit",
        completionOutcomeValue: newTransfer.completionOutcomeValue ?? null,
        completionOutcome: newTransfer.completionOutcome ?? null,
    }

    const createdTransfer = transferDataSource.insert(transferWithId)
    notifyTransferChange()
    return createdTransfer
}

export function updateTransfer(id, updates) {
    const existingTransfer = transferDataSource.findById(id)
    if (!existingTransfer) return null

    const updatedTransfer = {
        ...existingTransfer,
        ...updates,
    }

    const result = transferDataSource.replaceById(id, updatedTransfer)
    notifyTransferChange()
    return result
}

export function deleteTransfer(id) {
    const deleted = transferDataSource.deleteById(id)

    if (!deleted) return null

    notifyTransferChange()
    return true
}