import { mockReceipts } from "../data/mockReceipts"

const receiptDataSource = {
    getAll() {
        return mockReceipts
    },

    findById(id) {
        return (
            mockReceipts.find((receipt) => String(receipt.id) === String(id)) || null
        )
    },

    insert(receipt) {
        mockReceipts.unshift(receipt)
        return receipt
    },
}

function generateReceiptId() {
    const prefix = "RC"

    const matchingIds = receiptDataSource
        .getAll()
        .filter((receipt) => receipt.id?.startsWith(`${prefix}-`))
        .map((receipt) => {
            const numericPart = Number(receipt.id.split("-")[1])
            return Number.isNaN(numericPart) ? 0 : numericPart
        })

    const nextNumber =
        matchingIds.length > 0 ? Math.max(...matchingIds) + 1 : 1001

    return `${prefix}-${nextNumber}`
}

export function getAllReceipts() {
    return receiptDataSource.getAll()
}

export function findReceiptById(id) {
    return receiptDataSource.findById(id)
}

export function buildReceiptPayload({
    deliveryForm,
    receivedItems,
    selectedLocationLabel = "",
    selectedProjectLabel = "",
    hasDiscrepancy = false,
}) {
    return {
        purchaseOrderId: deliveryForm.selectedPurchaseOrderId || "",
        vendor: deliveryForm.vendor,
        poNumber: deliveryForm.poNumber,
        deliveryDate: deliveryForm.deliveryDate,
        receivedBy: deliveryForm.receivedBy,

        locationValue: deliveryForm.locationValue,
        location: selectedLocationLabel,

        projectValue: deliveryForm.projectValue,
        project: selectedProjectLabel,

        hasDiscrepancy,
        notes: deliveryForm.notes,

        items: receivedItems.map((item, index) => ({
            id: index + 1,
            materialName: item.materialName,
            sku: item.sku,
            category: item.category || "",
            orderedQuantity: Number(item.orderedQuantity || 0),
            packingSlipQuantity: Number(item.packingSlipQuantity || 0),
            receivedQuantity: Number(item.receivedQuantity || 0),
            unit: item.unit,
            condition: item.condition,
            source: item.source,
        })),
    }
}

export function createReceipt(receiptData) {
    const newReceipt = {
        id: generateReceiptId(),
        statusValue: "confirmed",
        status: "Confirmed",
        ...receiptData,
    }

    return receiptDataSource.insert(newReceipt)
}