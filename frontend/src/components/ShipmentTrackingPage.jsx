import { useEffect, useMemo, useState } from "react"
import { hasPermission } from "../auth/permissions"
import { formatCurrency } from "../utils/formatters"
import { formatAuditTimestamp, formatDate } from "../utils/dateUtils"
import { getAllRequests } from "../services/requestService"
import { getAllManifests } from "../services/manifestService"
import { getAllTransfers } from "../services/transferService"
import { findInventoryItemById } from "../services/inventoryService"
import { useAsyncData } from "../hooks/useAsyncData"
import FilterHeader from "./FilterHeader"

function getWorkflowTypeLabel(workflowType) {
    if (workflowType === "request") return "Request Workflow"
    if (workflowType === "manual_manifest") return "Manual Manifest"
    return ""
}

function getShipmentStatusLabel(statusValue) {
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

function getShipmentStatusClass(statusValue) {
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

function getPriorityBadgeClass(priorityValue) {
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

function getTransferTypeLabel(typeValue) {
    switch(typeValue) {
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

async function buildRequestItemsWithCost(request) {
    if (!request) return []

    return Promise.all(request.items.map(async (item) => {
        const inventoryItem = await findInventoryItemById(item.inventoryItemId)

        const requestedQuantity = Number(item.requestedQuantity || 0)
        const unitCost = Number(inventoryItem?.unitCost || 0)
        const lineTotalCost = requestedQuantity * unitCost

        return {
            ...item,
            name: inventoryItem?.name || `Inventory Item ${item.inventoryItemId}`,
            sku: inventoryItem?.sku || "",
            unit: inventoryItem?.unit || "",
            category: inventoryItem?.category || "",
            unitCost,
            lineTotalCost,
        }
    }))
}

async function buildManifestItemsWithCost(manifest) {
    if (!manifest) return []

    return Promise.all(manifest.items.map(async (item) => {
        const inventoryItem = await findInventoryItemById(item.inventoryItemId)

        const manifestQuantity = Number(item.manifestQuantity || 0)
        const unitCost = Number(inventoryItem?.unitCost || 0)
        const lineTotalCost = manifestQuantity * unitCost

        return {
            ...item,
            unitCost,
            lineTotalCost,
        }
    }))
}

async function buildTransferItemsWithCost(transfer) {
    if (!transfer) return []

    return Promise.all(transfer.items.map(async (item) => {
        const inventoryItem = await findInventoryItemById(item.inventoryItemId)

        const receivedQuantity = 
            item.receivedQuantity === null || item.receivedQuantity === undefined || item.receivedQuantity === ""
                ? null
                : Number(item.receivedQuantity)

        const shippedQuantity = 
            item.shippedQuantity === null || item.shippedQuantity === undefined || item.shippedQuantity === ""
                ? null
                : Number(item.shippedQuantity)
        
        const manifestQuantity = Number(item.manifestQuantity || 0)
        const unitCost = Number(inventoryItem?.unitCost || 0)

        const effectiveQuantity = 
            receivedQuantity !== null
                ? receivedQuantity
                : shippedQuantity !== null
                    ? shippedQuantity
                    : manifestQuantity

        const lineTotalCost = effectiveQuantity * unitCost
        
        return {
            ...item,
            unitCost,
            effectiveQuantity,
            lineTotalCost,
        }
    }))
}

async function buildShipmentTrackingRecords(requests, manifests, transfers) {
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
            const transferStatus = transfer.statusValue || transfer.status || "in_transit"
            const completionOutcome = transfer.completionOutcomeValue || ""

            if (transferStatus === "completed" && completionOutcome === "exception") {
                currentStatusValue = "exception"
            } else {
                currentStatusValue = transferStatus
            }

            lastUpdatedAt =
                transfer.receivedAt ||
                transfer.shippedAt ||
                transfer.createdAt ||
                lastUpdatedAt
        }

        const requestItems = await buildRequestItemsWithCost(request)
        const manifestItems = manifest ? await buildManifestItemsWithCost(manifest) : []
        const transferItems = transfer ? await buildTransferItemsWithCost(transfer) : []

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

    for (const manifest of manifests.filter((manifest) => !manifest.requestId)) {
            const transfer = transfersByManifestId.get(manifest.id) || null

            let currentStatusValue = "manifested"
            let lastUpdatedAt = manifest.finalizedAt || manifest.createdAt || null

            if (transfer) {
                const transferStatus = transfer.statusValue || transfer.status || "in_transit"
                const completionOutcome = transfer.completionOutcomeValue || ""

                if (transferStatus === "completed" && completionOutcome === "exception") {
                    currentStatusValue = "exception"
                } else {
                    currentStatusValue = transferStatus
                }

                lastUpdatedAt =
                    transfer.receivedAt ||
                    transfer.shippedAt ||
                    transfer.createdAt ||
                    lastUpdatedAt
            }

            const manifestItems = await buildManifestItemsWithCost(manifest)
            const transferItems = transfer ? await buildTransferItemsWithCost(transfer) : []

            const activeCostItems = transfer ? transferItems : manifestItems

            const totalCost = activeCostItems.reduce(
                (sum, item) => sum + Number(item.lineTotalCost || 0),
                0
            )

            records.push({
                trackingId: `MAN-${manifest.id}`,
                workflowType: "manual_manifest",

                requestId: "",
                manifestId: manifest?.id,
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

function ShipmentTrackingDetailContent({
    record,
    onClose,
    showClose = false,
    canViewMaterialCost,
}) {
    if (!record) return null

    const detailItems = record.transfer
        ? record.transferItems
        : record.manifest
            ? record.manifestItems
            : record.requestItems

    return (
        <>
            <div className="section-heading-row">
                <h2 className="section-title">Shipment Details</h2>
                {showClose && (
                    <button className="text-button" onClick={onClose}>
                        Close
                    </button>
                )}
            </div>

            <h3 className="inventory-item-title">{record.title}</h3>
            <p className="inventory-item-subtext">{getWorkflowTypeLabel(record.workflowType)}</p>
            <span className={getShipmentStatusClass(record.currentStatusValue)}>
                {record.currentStatusLabel}
            </span>

            <div className="inventory-card-details detail-panel-grid">
                <div>
                    <span className="detail-label">Workflow Type: </span>
                    <span className="detail-value">{getWorkflowTypeLabel(record.workflowType)}</span>
                </div>

                {record.requestId ? (
                    <div>
                        <span className="detail-label">Request ID: </span>
                        <span className="detail-value">{record.requestId}</span>
                    </div>
                ) : null}

                {record.manifestId ? (
                    <div>
                        <span className="detail-label">Manifest ID: </span>
                        <span className="detail-value">{record.manifestId}</span>
                    </div>
                ) : null}

                {record.transferId ? (
                    <div>
                        <span className="detail-label">Transfer ID: </span>
                        <span className="detail-value">{record.transferId}</span>
                    </div>
                ) : null}

                {record.project ? (
                    <div>
                        <span className="detail-label">Project: </span>
                        <span className="detail-value">{record.project}</span>
                    </div>
                ) : null}

                {record.location ? (
                    <div>
                        <span className="detail-label">Location: </span>
                        <span className="detail-value">{record.location}</span>
                    </div>
                ) : null}

                {record.priority ? (
                    <div>
                        <span className="detail-label">Priority: </span>
                        <span className={getPriorityBadgeClass(record.priorityValue)}>
                            {record.priority}
                        </span>
                    </div>
                ) : null}

                {record.neededByDate ? (
                    <div>
                        <span className="detail-label">Needed By: </span>
                        <span className="detail-value">{formatDate(record.neededByDate)}</span>
                    </div>
                ) : null}

                {record.requestedBy ? (
                    <div>
                        <span className="detail-label">Requested By: </span>
                        <span className="detail-value">{record.requestedBy}</span>
                    </div>
                ) : null}

                {record.approvedBy ? (
                    <div>
                        <span className="detail-label">Approved By: </span>
                        <span className="detail-value">{record.approvedBy}</span>
                    </div>
                ) : null}

                {record.approvedAt ? (
                    <div>
                        <span className="detail-label">Approved At: </span>
                        <span className="detail-value">{formatAuditTimestamp(record.approvedAt)}</span>
                    </div>
                ) : null}

                {record.createdAt ? (
                    <div>
                        <span className="detail-label">Created At: </span>
                        <span className="detail-value">{formatAuditTimestamp(record.createdAt)}</span>
                    </div>
                ) : null}

                {record.lastUpdatedAt ? (
                    <div>
                        <span className="detail-label">Last Updated: </span>
                        <span className="detail-value">{formatAuditTimestamp(record.lastUpdatedAt)}</span>
                    </div>
                ) : null}

                {record.sourceLocation ? (
                    <div>
                        <span className="detail-label">Source: </span>
                        <span className="detail-value">{record.sourceLocation}</span>
                    </div>
                ) : null}

                {record.destinationLocation ? (
                    <div>
                        <span className="detail-label">Destination: </span>
                        <span className="detail-value">{record.destinationLocation}</span>
                    </div>
                ) : null}

                {record.destinationDetail ? (
                    <div>
                        <span className="detail-label">Destination Detail: </span>
                        <span className="detail-value">{record.destinationDetail}</span>
                    </div>
                ) : null}

                <div>
                    <span className="detail-label">Item Count: </span>
                    <span className="detail-value">{record.itemCount}</span>
                </div>

                {canViewMaterialCost ? (
                    <div>
                        <span className="detail-label">Total Cost: </span>
                        <span className="detail-value">{formatCurrency(record.totalCost)}</span>
                    </div>
                ) : null}

                {record.request ? (
                    <div className="page-section request-form-section">
                        <div className="section-heading-row">
                            <h2 className="section-title">Request Stage</h2>
                        </div>

                        <div className="inventory-card-details detail-panel-grid">
                            <div>
                                <span className="detail-label">Request Status: </span>
                                <span className="detail-value">
                                    {getShipmentStatusLabel(
                                        record.transfer.statusValue === "completed" &&
                                        record.transfer.completionOutcomeValue === "exception"
                                            ? "exception"
                                            : record.transfer.statusValue || record.transfer.status
                                    )}
                                </span>
                            </div>

                            {record.request.sourceWarehouse ? (
                                <div>
                                    <span className="detail-label">Source Warehouse: </span>
                                    <span className="detail-value">{record.request.sourceWarehouse}</span>
                                </div>
                            ) : null}

                            {record.request.deliveryLocationText ? (
                                <div>
                                    <span className="detail-label">Requested Delivery: </span>
                                    <span className="detail-value">{record.request.deliveryLocationText}</span>
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                {record.manifest ? (
                    <div className="page-section request-form-section">
                        <div className="section-heading-row">
                            <h2 className="section-title">Manifest Stage</h2>
                        </div>

                        <div className="inventory-card-details detail-panel-grid">
                            <div>
                                <span className="detail-label">Manifest Date: </span>
                                <span className="detail-value">{formatDate(record.manifest.manifestDate)}</span>
                            </div>

                            <div>
                                <span className="detail-label">Finalized By: </span>
                                <span className="detail-value">{record.manifest.finalizedBy || "-"}</span>
                            </div>

                            <div>
                                <span className="detail-label">Finalized At: </span>
                                <span className="detail-value">{formatAuditTimestamp(record.manifest.finalizedAt)}</span>
                            </div>

                            <div>
                                <span className="detail-label">Manifest Type: </span>
                                <span className="detail-value">{getTransferTypeLabel(record.manifest.manifestTypeValue || record.manifest.manifestType)}</span>
                            </div>
                        </div>
                    </div>
                ) : null}

                {record.transfer ? (
                    <div className="page-section request-form-section">
                        <div className="section-heading-row">
                            <h2 className="section-title">Transfer Stage</h2>
                        </div>

                        <div className="inventory-card-details detail-panel-grid">
                            <div>
                                <span className="detail-label">Transfer Status: </span>
                                <span className="detail-value">
                                    {getShipmentStatusLabel(
                                        record.transfer.statusValue === "completed" &&
                                        record.transfer.completionOutcomeValue === "exception"
                                            ? "exception"
                                            : record.transfer.statusValue || record.transfer.status
                                    )}
                                </span>
                            </div>

                            <div>
                                <span className="detail-label">Shipped Date: </span>
                                <span className="detail-value">{formatDate(record.transfer.shippedDate)}</span>
                            </div>

                            <div>
                                <span className="detail-label">Shipped By: </span>
                                <span className="detail-value">{record.transfer.shippedBy || "-"}</span>
                            </div>

                            <div>
                                <span className="detail-label">Shipped At: </span>
                                <span className="detail-value">{formatAuditTimestamp(record.transfer.shippedAt)}</span>
                            </div>

                            <div>
                                <span className="detail-label">Received Date: </span>
                                <span className="detail-value">{formatDate(record.transfer.receivedDate) || "-"}</span>
                            </div>

                            <div>
                                <span className="detail-label">Received By: </span>
                                <span className="detail-value">{record.transfer.receivedBy || "-"}</span>
                            </div>

                            <div>
                                <span className="detail-label">Received At: </span>
                                <span className="detail-value">{formatAuditTimestamp(record.transfer.receivedAt)}</span>
                            </div>
                        </div>
                    </div>
                ) : null}

                <div className="page-section request-form-section">
                    <div className="section-heading-row">
                        <h2 className="section-title">Items</h2>
                    </div>

                    <div className="received-items-list">
                        {detailItems.map((item, index) => (
                            <div className="received-item-card" key={item.id}>
                                <div className="section-heading-row">
                                    <h3 className="received-item-title">Item {index + 1}</h3>
                                </div>

                                <div className="receive-form-grid">
                                    <label className="form-group receive-form-span-2">
                                        <span className="form-label">Material</span>
                                        <input 
                                            className="form-input read-only-input"
                                            type="text"
                                            value={item.name || ""}
                                            readOnly
                                        />
                                    </label>

                                    <label className="form-group receive-form-span-2">
                                        <span className="form-label">SKU</span>
                                        <input 
                                            className="form-input read-only-input"
                                            type="text"
                                            value={item.sku || ""}
                                            readOnly
                                        />
                                    </label>

                                    <label className="form-group receive-form-span-2">
                                        <span className="form-label">Unit</span>
                                        <input 
                                            className="form-input read-only-input"
                                            type="text"
                                            value={item.unit || ""}
                                            readOnly
                                        />
                                    </label>

                                    {record.transfer ? (
                                        <label className="form-group">
                                            <span className="form-label">Current Quantity</span>
                                            <input 
                                                className="form-input read-only-input"
                                                type="text"
                                                value={item.effectiveQuantity ?? ""}
                                                readOnly
                                            />
                                        </label>
                                    ) : record.manifest ? (
                                        <label className="form-group">
                                            <span className="form-label">Manifest Quantity</span>
                                            <input 
                                                className="form-input read-only-input"
                                                type="text"
                                                value={item.manifestQuantity ?? ""}
                                                readOnly
                                            />
                                        </label>
                                    ) : (
                                        <label className="form-group">
                                            <span className="form-label">Requested Quantity</span>
                                            <input 
                                                className="form-input read-only-input"
                                                type="text"
                                                value={item.requestedQuantity ?? ""}
                                                readOnly
                                            />
                                        </label>
                                    )}

                                    {canViewMaterialCost ? (
                                        <>
                                            <label className="form-group">
                                                <span className="form-label">Unit Cost</span>
                                                <input 
                                                    className="form-input read-only-input"
                                                    type="text"
                                                    value={formatCurrency(item.unitCost)}
                                                    readOnly
                                                />
                                            </label>

                                            <label className="form-group">
                                                <span className="form-label">Line Total</span>
                                                <input 
                                                    className="form-input read-only-input"
                                                    type="text"
                                                    value={formatCurrency(item.lineTotalCost)}
                                                    readOnly
                                                />
                                            </label>
                                        </>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="page-section request-form-section">
                    <div className="section-heading-row">
                        <h2 className="section-title">Notes</h2>
                    </div>

                    {record.request ? (
                        <label className="form-group">
                            <span className="form-label">Request Notes</span>
                            <textarea
                                className="form-textarea read-only-input"
                                type="text"
                                value={record.request.notes || ""}
                                readOnly
                            />
                        </label>
                    ) : null }

                    {record.manifest ? (
                        <label className="form-group">
                            <span className="form-label">Manifest Notes</span>
                            <textarea
                                className="form-textarea read-only-input"
                                type="text"
                                value={record.manifest.notes || ""}
                                readOnly
                            />
                        </label>
                    ) : null }

                    {record.transfer ? (
                        <>
                            <label className="form-group">
                                <span className="form-label">Transfer Notes</span>
                                <textarea
                                    className="form-textarea read-only-input"
                                    type="text"
                                    value={record.transfer.notes || ""}
                                    readOnly
                                />
                            </label>

                            <label className="form-group">
                                <span className="form-label">Exception Notes</span>
                                <textarea
                                    className="form-textarea read-only-input"
                                    type="text"
                                    value={record.transfer.exceptionNotes || ""}
                                    readOnly
                                />
                            </label>
                        </>
                    ) : null }
                </div>
            </div>
        </>
    )
}

function ShipmentTrackingModal({ record, onClose, canViewMaterialCost }) {
    if (!record) return null

    return (
        <div className="inventory-modal-overlay" onClick={onClose}>
            <div className="inventory-modal-card" onClick={(e) => e.stopPropagation()}>
                <ShipmentTrackingDetailContent 
                    record={record}
                    onClose={onClose}
                    showClose={true}
                    canViewMaterialCost={canViewMaterialCost}
                />
            </div>
        </div>
    )
}

function ShipmentTrackingPage({ onBack, permissions = [] }) {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 900)

    const [filtersOpen, setFiltersOpen] = useState(() => window.innerWidth > 900)

    const [searchTerm, setSearchTerm] = useState("")
    const [statusFilter, setStatusFilter] = useState("All")
    const [workflowTypeFilter, setWorkflowTypeFilter] = useState("All")
    const [projectFilter, setProjectFilter] = useState("All")
    const [requesterFilter, setRequesterFilter] = useState("All")
    const [approverFilter, setApproverFilter] = useState("All")

    const [selectedRecord, setSelectedRecord] = useState(null)

    const canViewMaterialCost = hasPermission(permissions, "view_material_cost")

    const { data: trackingData, loading, error } = useAsyncData(async () => {
        const [requests, manifests, transfers] = await Promise.all([
            getAllRequests(),
            getAllManifests(),
            getAllTransfers(),
        ])
        return buildShipmentTrackingRecords(requests, manifests, transfers)
    })

    useEffect(() => {
        function handleResize() {
            setIsMobile(window.innerWidth <= 900)
        }

        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
    }, [])

    const filterOptions = useMemo(() => {
        return {
            statuses: ["All", ...new Set((trackingData ?? []).map((record) => record.currentStatusValue))],
            workflowTypes: ["All", ...new Set((trackingData ?? []).map((record) => record.workflowType))],
            projects: ["All", ...new Set((trackingData ?? []).map((record) => record.project).filter(Boolean))],
            requesters: ["All", ...new Set((trackingData ?? []).map((record) => record.requestedBy).filter(Boolean))],
            approvers: ["All", ...new Set((trackingData ?? []).map((record) => record.approvedBy).filter(Boolean))],
        }
    }, [trackingData])

    const summary = useMemo(() => {
        return {
            totalItems: (trackingData ?? []).length,
            pendingApproval: (trackingData ?? []).filter((record) => record.currentStatusValue === "pending_approval").length,
            approved: (trackingData ?? []).filter((record) => record.currentStatusValue === "approved").length,
            inTransit: (trackingData ?? []).filter((record) => record.currentStatusValue === "in_transit").length,
            exceptions: (trackingData ?? []).filter((record) => record.currentStatusValue === "exception").length,
            completed: (trackingData ?? []).filter((record) => record.currentStatusValue === "completed").length,
        }
    }, [trackingData])

    const filteredRecords = useMemo(() => {
        return (trackingData ?? []).filter((record) => {
            const search = searchTerm.toLowerCase()

            const matchesSearch = 
                record.trackingId.toLowerCase().includes(search) ||
                (record.requestId || "").toLowerCase().includes(search) ||
                (record.manifestId || "").toLowerCase().includes(search) ||
                (record.transferId || "").toLowerCase().includes(search) ||
                (record.project || "").toLowerCase().includes(search) ||
                (record.title || "").toLowerCase().includes(search) ||
                (record.requestedBy || "").toLowerCase().includes(search) ||
                (record.approvedBy || "").toLowerCase().includes(search) ||
                (record.sourceLocation || "").toLowerCase().includes(search) ||
                (record.destinationLocation || "").toLowerCase().includes(search)

            const matchesStatus = statusFilter === "All" || record.currentStatusValue === statusFilter

            const matchesWorkflowType = workflowTypeFilter === "All" || record.workflowType === workflowTypeFilter

            const matchesProject = projectFilter === "All" || record.project === projectFilter

            const matchesRequester = requesterFilter === "All" || record.requestedBy === requesterFilter

            const matchesApprover = approverFilter === "All" || record.approvedBy === approverFilter

            return (
                matchesSearch &&
                matchesStatus &&
                matchesWorkflowType &&
                matchesProject &&
                matchesRequester &&
                matchesApprover
            )
        })
    }, [
        trackingData,
        searchTerm,
        statusFilter,
        workflowTypeFilter,
        projectFilter,
        requesterFilter,
        approverFilter
    ])

    const filteredCost = useMemo(() => {
        if (!canViewMaterialCost) return 0

        return filteredRecords.reduce((sum, record) => {
            if (record.currentStatusValue === "rejected") return sum
            return sum + Number(record.totalCost || 0)
        }, 0)
    }, [filteredRecords, canViewMaterialCost])

    const {
        statuses,
        workflowTypes,
        projects,
        requesters,
        approvers,
    } = filterOptions

    function handleClearFilters() {
        setSearchTerm("")
        setStatusFilter("All")
        setWorkflowTypeFilter("All")
        setProjectFilter("All")
        setRequesterFilter("All")
        setApproverFilter("All")
    }

    if (loading) {
        return <div className="inventory-page"><p>Loading...</p></div>
    }

    if (error) {
        return <div className="inventory-page"><p>Failed to load shipment tracking data.</p></div>
    }

    return (
        <div className="inventory-page">
            <div className="inventory-page-scroll">
                <FilterHeader
                    title="Shipment Tracking"
                    subtitle="Track request and shipment workflow from approval through completion."
                    onBack={onBack}
                    filtersOpen={filtersOpen}
                    onToggleFilters={() => setFiltersOpen((prev) => !prev)}
                    leftMetaLabel={canViewMaterialCost ? "Cost:" : ""}
                    leftMetaValue={canViewMaterialCost ? formatCurrency(filteredCost) : ""}
                    rightMetaText={`${filteredRecords.length} result${filteredRecords.length !== 1 ? "s" : ""}`}
                >
                    <input 
                        type="text"
                        className="inventory-search"
                        placeholder="Search by request, manifest, transfer, project, requester, approver, or location..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />

                    <div className="filter-row">
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            {statuses.map((status) => (
                                <option key={status} value={status}>
                                    Status: {status === "All" ? "All" : getShipmentStatusLabel(status)}
                                </option>
                            ))}
                        </select>

                        <select value={workflowTypeFilter} onChange={(e) => setWorkflowTypeFilter(e.target.value)}>
                            {workflowTypes.map((type) => (
                                <option key={type} value={type}>
                                    Workflow: {type === "All" ? "All" : getWorkflowTypeLabel(type)}
                                </option>
                            ))}
                        </select>

                        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
                            {projects.map((project) => (
                                <option key={project} value={project}>
                                    Project: {project}
                                </option>
                            ))}
                        </select>

                        <select value={requesterFilter} onChange={(e) => setRequesterFilter(e.target.value)}>
                            {requesters.map((requester) => (
                                <option key={requester} value={requester}>
                                    Requested By: {requester}
                                </option>
                            ))}
                        </select>

                        <select value={approverFilter} onChange={(e) => setApproverFilter(e.target.value)}>
                            {approvers.map((approver) => (
                                <option key={approver} value={approver}>
                                    Approved By: {approver}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="filter-actions">
                        <button
                            className="secondary-button"
                            type="button"
                            onClick={handleClearFilters}
                        >
                            Clear Filters
                        </button>
                    </div>
                </FilterHeader>

                <section className="inventory-summary-grid">
                    <div className="summary-card">
                        <div className="summary-row">
                            <span className="summary-label">Total Items: </span>
                            <span className="summary-value">{summary.totalItems}</span>
                        </div>
                    </div>

                    <div className="summary-card">
                        <div className="summary-row">
                            <span className="summary-label">Approved: </span>
                            <span className="summary-value">{summary.approved}</span>
                        </div>
                    </div>

                    <div className="summary-card">
                        <div className="summary-row">
                            <span className="summary-label">Pending: </span>
                            <span className="summary-value">{summary.pendingApproval}</span>
                        </div>
                    </div>

                    <div className="summary-card">
                        <div className="summary-row">
                            <span className="summary-label">In Transit: </span>
                            <span className="summary-value">{summary.inTransit}</span>
                        </div>
                    </div>

                    <div className="summary-card">
                        <div className="summary-row">
                            <span className="summary-label">Exceptions: </span>
                            <span className="summary-value">{summary.exceptions}</span>
                        </div>
                    </div>

                    <div className="summary-card">
                        <div className="summary-row">
                            <span className="summary-label">Completed: </span>
                            <span className="summary-value">{summary.completed}</span>
                        </div>
                    </div>
                </section>

                <section className="inventory-content">
                    <div className="inventory-results">
                        <div className="inventory-card-list">
                            {filteredRecords.map((record) => (
                                <div className="inventory-card" key={record.trackingId}>
                                    <div className="inventory-card-top">
                                        <div>
                                            <h3 className="inventory-item-title">{record.title}</h3>
                                            <p className="inventory-item-subtext">
                                                {getWorkflowTypeLabel(record.workflowType)}
                                            </p>
                                        </div>

                                        <span className={getShipmentStatusClass(record.currentStatusValue)}>
                                            {record.currentStatusLabel}
                                        </span>
                                    </div>

                                    <div className="inventory-card-details">
                                        {record.requestId ? (
                                            <div>
                                                <span className="detail-label">Request ID: </span>
                                                <span className="detail-value">{record.requestId}</span>
                                            </div>
                                        ) : null}

                                        {record.manifestId ? (
                                            <div>
                                                <span className="detail-label">Manifest ID: </span>
                                                <span className="detail-value">{record.manifestId}</span>
                                            </div>
                                        ) : null}

                                        {record.transferId ? (
                                            <div>
                                                <span className="detail-label">Transfer ID: </span>
                                                <span className="detail-value">{record.transferId}</span>
                                            </div>
                                        ) : null}

                                        {record.project ? (
                                            <div>
                                                <span className="detail-label">Project: </span>
                                                <span className="detail-value">{record.project}</span>
                                            </div>
                                        ) : null}

                                        {record.priority ? (
                                            <div>
                                                <span className="detail-label">Priority: </span>
                                                <span className={getPriorityBadgeClass(record.priorityValue)}>{record.priority}</span>
                                            </div>
                                        ) : null}

                                        {record.requestedBy ? (
                                            <div>
                                                <span className="detail-label">Requested By: </span>
                                                <span className="detail-value">{record.requestedBy}</span>
                                            </div>
                                        ) : null}

                                        {record.neededByDate ? (
                                            <div>
                                                <span className="detail-label">Needed By: </span>
                                                <span className="detail-value">{formatDate(record.neededByDate)}</span>
                                            </div>
                                        ) : null}

                                        <div>
                                            <span className="detail-label">Last Updated: </span>
                                            <span className="detail-value">
                                                {record.lastUpdatedAt ? formatAuditTimestamp(record.lastUpdatedAt) : "-"}
                                            </span>
                                        </div>

                                        <div>
                                            <span className="detail-label">Item Count: </span>
                                            <span className="detail-value">{record.itemCount}</span>
                                        </div>

                                        {canViewMaterialCost ? (
                                            <div>
                                                <span className="detail-label">Total Cost: </span>
                                                <span className="detail-value">{formatCurrency(record.totalCost)}</span>
                                            </div>
                                        ) : null }
                                    </div>

                                    <div className="inventory-location-block">
                                        <span className="detail-label">Route: </span>
                                        <span className="detail-value">
                                            {[record.sourceLocation, record.destinationLocation]
                                                .filter(Boolean)
                                                .join(" → ") || "-"}
                                        </span>
                                    </div>

                                    <div className="inventory-card-button">
                                        <button
                                            className="secondary-button"
                                            onClick={() => setSelectedRecord(record)}
                                        >
                                            View Details
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <aside className="inventory-detail-panel">
                        {selectedRecord ? (
                            <ShipmentTrackingDetailContent 
                                record={selectedRecord}
                                onClose={() => setSelectedRecord(null)}
                                showClose={true}
                                canViewMaterialCost={canViewMaterialCost}
                            />
                        ) : (
                            <div className="detail-panel-empty">
                                <p>Select a shipment item to view more details.</p>
                            </div>
                        )}
                    </aside>
                </section>

                {isMobile && (
                    <ShipmentTrackingModal 
                        record={selectedRecord}
                        onClose={() => setSelectedRecord(null)}
                        canViewMaterialCost={canViewMaterialCost}
                    />
                )}
            </div>
        </div>
    )
}

export default ShipmentTrackingPage