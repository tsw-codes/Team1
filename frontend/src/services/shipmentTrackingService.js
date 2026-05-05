export function getWorkflowTypeLabel(workflowType) {
    if (workflowType === "request") return "Request Workflow"
    if (workflowType === "manual_manifest") return "Manual Manifest"
    return ""
}

export function getShipmentStatusLabel(statusValue) {
    switch (statusValue) {
        case "pending_approval":
            return "Pending"
        case "approved":
            return "Approved"
        case "rejected":
            return "Rejected"
        case "manifested":
            return "Manifested"
        case "in_transit":
            return "In Transit"
        case "completed":
            return "Completed"
        case "exception":
            return "Exception"
        default:
            return ""
    }
}

export function getShipmentStatusClass(statusValue) {
    switch (statusValue) {
        case "pending_approval":
        case "manifested":
            return "status-badge reserved"
        case "rejected":
        case "exception":
            return "status-badge out-of-stock"
        case "in_transit":
            return "status-badge in-transit"
        case "approved":
        case "completed":
            return "status-badge available"
        default:
            return "status-badge"
    }
}

export function getPriorityBadgeClass(priorityValue) {
    switch (priorityValue) {
        case "urgent":
            return "status-badge out-of-stock"
        case "high":
            return "status-badge low-stock"
        case "normal":
            return "status-badge reserved"
        case "low":
            return "status-badge available"
        default:
            return "status-badge"
    }
}

export function getTransferTypeLabel(typeValue) {
    switch (typeValue) {
        case "outbound":
            return "Outbound to Job Site"
        case "return":
            return "Return to Warehouse"
        case "warehouse_transfer":
            return "Warehouse to Warehouse"
        default:
            return ""
    }
}

export function resolveTransferStatusValue(transfer) {
    if (!transfer) return ""
    return transfer.statusValue || transfer.status || "in_transit"
}

export function buildRequestItemsWithCost(request) {
    if (!request) return []

    return request.items.map((item) => {
        const requestedQuantity = Number(item.requestedQuantity || 0)
        const unitCost = Number(item.unitCost || 0)
        const lineTotalCost = requestedQuantity * unitCost

        return {
            ...item,
            name: item.name || `Inventory Item ${item.inventoryItemId}`,
            lineTotalCost,
        }
    })
}

export function buildManifestItemsWithCost(manifest) {
    if (!manifest) return []

    return manifest.items.map((item) => {
        const manifestQuantity = Number(item.manifestQuantity || 0)
        const unitCost = Number(item.unitCost || 0)
        const lineTotalCost = manifestQuantity * unitCost

        return {
            ...item,
            lineTotalCost,
        }
    })
}

export function buildTransferItemsWithCost(transfer) {
    if (!transfer) return []

    return transfer.items.map((item) => {
        const receivedQuantity =
            item.receivedQuantity === null || item.receivedQuantity === undefined || item.receivedQuantity === ""
                ? null
                : Number(item.receivedQuantity)

        const shippedQuantity =
            item.shippedQuantity === null || item.shippedQuantity === undefined || item.shippedQuantity === ""
                ? null
                : Number(item.shippedQuantity)

        const manifestQuantity = Number(item.manifestQuantity || 0)
        const unitCost = Number(item.unitCost || 0)

        const effectiveQuantity =
            receivedQuantity !== null
                ? receivedQuantity
                : shippedQuantity !== null
                    ? shippedQuantity
                    : manifestQuantity

        const lineTotalCost = effectiveQuantity * unitCost

        return {
            ...item,
            effectiveQuantity,
            lineTotalCost,
        }
    })
}

export function buildShipmentTrackingRecords(requests, manifests, transfers) {
    const records = []

    const manifestsByRequestId = new Map()
    manifests.forEach((manifest) => {
        if (manifest.requestId) {
            manifestsByRequestId.set(manifest.requestId, manifest)
        }
    })

    const transfersByManifestId = new Map()
    transfers.forEach((transfer) => {
        if (transfer.manifestId) {
            transfersByManifestId.set(transfer.manifestId, transfer)
        }
    })

    for (const request of requests) {
        const manifest = manifestsByRequestId.get(request.id) || null
        const transfer = manifest ? transfersByManifestId.get(manifest.id) || null : null

        let currentStatusValue = request.statusValue || request.status || "pending_approval"
        let lastUpdatedAt = request.rejectedAt || request.approvedAt || request.createdAt || null

        if (manifest && !transfer) {
            currentStatusValue = "manifested"
            lastUpdatedAt = manifest.finalizedAt || manifest.createdAt || lastUpdatedAt
        }

        if (transfer) {
            currentStatusValue = resolveTransferStatusValue(transfer)
            lastUpdatedAt =
                transfer.receivedAt ||
                transfer.shippedAt ||
                transfer.createdAt ||
                lastUpdatedAt
        }

        const requestItems = buildRequestItemsWithCost(request)
        const manifestItems = manifest ? buildManifestItemsWithCost(manifest) : []
        const transferItems = transfer ? buildTransferItemsWithCost(transfer) : []

        const activeCostItems = transfer
            ? transferItems
            : manifest
                ? manifestItems
                : requestItems

        const totalCost = activeCostItems.reduce(
            (sum, item) => sum + Number(item.lineTotalCost || 0),
            0
        )

        records.push({
            trackingId: `REQ-${request.id}`,
            workflowType: "request",

            requestId: request.id,
            manifestId: manifest?.id || "",
            transferId: transfer?.id || "",

            title: request.project || request.location || request.id,
            subtitle: request.location || "",

            project: request.project || "",
            location: request.location || "",

            requestStatusValue: request.statusValue || request.status || "",
            currentStatusValue,
            currentStatusLabel: getShipmentStatusLabel(currentStatusValue),

            priorityValue: request.priorityValue || "",
            priority: request.priority || "",

            requestedBy: request.requestedBy || "",
            approvedBy: request.approvedBy || "",
            approvedAt: request.approvedAt || null,

            createdAt: request.createdAt || null,
            rejectedAt: request.rejectedAt || null,
            lastUpdatedAt,

            neededByDate: request.neededByDate || "",

            sourceWarehouse: request.sourceWarehouse || "",
            sourceWarehouseValue: request.sourceWarehouseValue || "",
            deliveryLocationText: request.deliveryLocationText || "",

            sourceLocation: manifest?.sourceLocation || transfer?.sourceLocation || request.sourceLocation || "",
            destinationLocation: manifest?.destinationLocation || transfer?.destinationLocation || request.location || "",
            destinationDetail: manifest?.destinationDetail || transfer?.destinationDetail || request.deliveryLocationText || "",

            itemCount: request.items.length,
            requestItems,
            manifestItems,
            transferItems,

            request,
            manifest,
            transfer,

            totalCost,
        })
    }

    const manualManifests = manifests.filter((manifest) => !manifest.requestId)
    for (const manifest of manualManifests) {
            const transfer = transfersByManifestId.get(manifest.id) || null

            let currentStatusValue = "manifested"
            let lastUpdatedAt = manifest.finalizedAt || manifest.createdAt || null

            if (transfer) {
                currentStatusValue = resolveTransferStatusValue(transfer)
                lastUpdatedAt =
                    transfer.receivedAt ||
                    transfer.shippedAt ||
                    transfer.createdAt ||
                    lastUpdatedAt
            }

            const manifestItems = buildManifestItemsWithCost(manifest)
            const transferItems = transfer ? buildTransferItemsWithCost(transfer) : []

            const activeCostItems = transfer ? transferItems : manifestItems

            const totalCost = activeCostItems.reduce(
                (sum, item) => sum + Number(item.lineTotalCost || 0),
                0
            )

            records.push({
                trackingId: `MAN-${manifest.id}`,
                workflowType: "manual_manifest",

                requestId: "",
                manifestId: manifest?.id || "",
                transferId: transfer?.id || "",

                title: getTransferTypeLabel(manifest.manifestTypeValue || manifest.manifestType) || manifest.id,
                subtitle:
                    [manifest.sourceLocation, manifest.destinationLocation]
                        .filter(Boolean)
                        .join(" → ") || manifest.id,

                project: manifest.project || "",
                location: manifest.location || "",

                requestStatusValue: "",
                currentStatusValue,
                currentStatusLabel: getShipmentStatusLabel(currentStatusValue),

                priorityValue: "",
                priority: "",

                requestedBy: "",
                approvedBy: "",
                approvedAt: null,

                createdAt: manifest.createdAt || null,
                rejectedAt: null,
                lastUpdatedAt,

                neededByDate: "",

                sourceWarehouse: "",
                sourceWarehouseValue: "",
                deliveryLocationText: "",

                sourceLocation: manifest.sourceLocation || transfer?.sourceLocation || "",
                destinationLocation: manifest.destinationLocation || transfer?.destinationLocation || "",
                destinationDetail: manifest.destinationDetail || transfer?.destinationDetail || "",

                itemCount: manifest.items.length,
                requestItems: [],
                manifestItems,
                transferItems,

                request: null,
                manifest,
                transfer,

                totalCost,
            })
    }

    return records
}