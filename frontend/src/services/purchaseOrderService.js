import { mockPurchaseOrders } from "../data/mockPurchaseOrders"

const purchaseOrderDataSource = {
    getAll() {
        return mockPurchaseOrders
    },

    getOpen() {
        return mockPurchaseOrders.filter(
            (purchaseOrder) => purchaseOrder.statusValue === "entered"
        )
    },

    findById(id) {
        return (
            mockPurchaseOrders.find(
                (purchaseOrder) => String(purchaseOrder.id) === String(id)
            ) || null
        )
    },

    insert(purchaseOrder) {
        mockPurchaseOrders.unshift(purchaseOrder)
        return purchaseOrder
    },

    replaceById(id, updatedPurchaseOrder) {
        const index = mockPurchaseOrders.findIndex(
            (purchaseOrder) => String(purchaseOrder.id) === String(id)
        )

        if (index === -1) return null

        mockPurchaseOrders[index] = updatedPurchaseOrder
        return mockPurchaseOrders[index]
    },
}

let purchaseOrderListeners = []

export function subscribeToPurchaseOrders(listener) {
    purchaseOrderListeners.push(listener)

    return () => {
        purchaseOrderListeners = purchaseOrderListeners.filter((l) => l !== listener)
    }
}

function notifyPurchaseOrderChange() {
    purchaseOrderListeners.forEach((listener) => listener())
}

function generatePurchaseOrderId() {
    const prefix = "PO"

    const matchingIds = purchaseOrderDataSource
        .getAll()
        .filter((purchaseOrder) => purchaseOrder.id?.startsWith(`${prefix}-`))
        .map((purchaseOrder) => {
            const numericPart = Number(purchaseOrder.id.split("-")[1])
            return Number.isNaN(numericPart) ? 0 : numericPart
        })

    const nextNumber =
        matchingIds.length > 0 ? Math.max(...matchingIds) + 1 : 1001

    return `${prefix}-${nextNumber}`
}

export function getAllPurchaseOrders() {
    return purchaseOrderDataSource.getAll()
}

export function getOpenPurchaseOrders() {
    return purchaseOrderDataSource.getOpen()
}

export function findPurchaseOrderById(id) {
    return purchaseOrderDataSource.findById(id)
}

export function buildPurchaseOrderPayload({
    poForm,
    poPreview,
    poItems,
    selectedLocationLabel = "",
    selectedProjectLabel = "",
}) {
    return {
        poNumber: poForm.poNumber.trim(),
        vendor: poForm.vendor.trim(),
        expectedDeliveryDate: poForm.expectedDeliveryDate,
        enteredBy: poForm.enteredBy,
        enteredAt: poForm.enteredAt,

        locationValue: poForm.locationValue,
        location: selectedLocationLabel,

        projectValue: poForm.projectValue,
        project: selectedProjectLabel,

        poDocumentName: poPreview?.filename || "",
        notes: poForm.notes.trim(),

        items: poItems.map((item, index) => ({
            id: index + 1,
            materialName: item.materialName.trim(),
            sku: item.sku.trim(),
            category: item.category?.trim() || "",
            orderedQuantity: Number(item.orderedQuantity || 0),
            unit: item.unit.trim(),
            unitCost: Number(item.unitCost || 0),
            source: item.source,
        })),
    }
}

export function createPurchaseOrder(purchaseOrderData) {
    const newPurchaseOrder = {
        id: generatePurchaseOrderId(),
        statusValue: "entered",
        status: "Entered",
        ...purchaseOrderData,
    }

    const createdPurchaseOrder = purchaseOrderDataSource.insert(newPurchaseOrder)
    notifyPurchaseOrderChange()
    return createdPurchaseOrder
}

export function completePurchaseOrder(purchaseOrderId, hasDiscrepancies = false) {
    const purchaseOrder = purchaseOrderDataSource.findById(purchaseOrderId)
    if (!purchaseOrder) return null

    const statusValue = hasDiscrepancies
        ? "complete_with_discrepancies"
        : "complete"

    const status = hasDiscrepancies
        ? "Complete with Discrepancies"
        : "Complete"

    const updatedPurchaseOrder = {
        ...purchaseOrder,
        statusValue,
        status,
    }

    const completedPurchaseOrder = purchaseOrderDataSource.replaceById(
        purchaseOrderId,
        updatedPurchaseOrder
    )

    notifyPurchaseOrderChange()
    return completedPurchaseOrder
}