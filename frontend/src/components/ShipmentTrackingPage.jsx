import { useEffect, useMemo, useState } from "react"
import { hasPermission } from "../auth/permissions"
import { formatCurrency } from "../utils/formatters"
import { formatAuditTimestamp, formatDate } from "../utils/dateUtils"
import { getAllRequests, subscribeToRequests } from "../services/requestService"
import { getAllManifests, subscribeToManifests } from "../services/manifestService"
import { getAllTransfers, subscribeToTransfers } from "../services/transferService"
import {
    buildShipmentTrackingRecords,
    getWorkflowTypeLabel,
    getShipmentStatusLabel,
    getShipmentStatusClass,
    getPriorityBadgeClass,
    getTransferTypeLabel,
    resolveTransferStatusValue,
} from "../services/shipmentTrackingService"
import FilterHeader from "./FilterHeader"

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
                                        record.transfer
                                            ? resolveTransferStatusValue(record.transfer)
                                            : record.requestStatusValue
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
                                    {getShipmentStatusLabel(resolveTransferStatusValue(record.transfer))}
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

    const [trackingVersion, setTrackingVersion] = useState(0)

    const canViewMaterialCost = hasPermission(permissions, "view_material_cost")

    const trackingData = useMemo(() => {
        return buildShipmentTrackingRecords(
            getAllRequests(),
            getAllManifests(),
            getAllTransfers()
        )
    }, [trackingVersion])

    useEffect(() => {
        function handleResize() {
            setIsMobile(window.innerWidth <= 900)
        }

        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
    }, [])

    useEffect(() => {
        function refreshTrackingData() {
            setTrackingVersion((prev) => prev + 1)
        }

        const unsubscribeRequests = subscribeToRequests(refreshTrackingData)
        const unsubscribeManifests = subscribeToManifests(refreshTrackingData)
        const unsubscribeTransfers = subscribeToTransfers(refreshTrackingData)

        return () => {
            unsubscribeRequests()
            unsubscribeManifests()
            unsubscribeTransfers()
        }
    }, [])

    useEffect(() => {
        if (!selectedRecord) return

        const refreshedRecord =
            trackingData.find(
                (record) => String(record.trackingId) === String(selectedRecord.trackingId)
            ) || null

        if (!refreshedRecord) {
            setSelectedRecord(null)
            return
        }

        if (refreshedRecord !== selectedRecord) {
            setSelectedRecord(refreshedRecord)
        }
    }, [trackingData, selectedRecord])

    const filterOptions = useMemo(() => {
        return {
            statuses: ["All", ...new Set(trackingData.map((record) => record.currentStatusValue))],
            workflowTypes: ["All", ...new Set(trackingData.map((record) => record.workflowType))],
            projects: ["All", ...new Set(trackingData.map((record) => record.project).filter(Boolean))],
            requesters: ["All", ...new Set(trackingData.map((record) => record.requestedBy).filter(Boolean))],
            approvers: ["All", ...new Set(trackingData.map((record) => record.approvedBy).filter(Boolean))],
        }
    }, [trackingData])

    const summary = useMemo(() => {
        return {
            totalItems: trackingData.length,
            pendingApproval: trackingData.filter((record) => record.currentStatusValue === "pending_approval").length,
            approved: trackingData.filter((record) => record.currentStatusValue === "approved").length,
            inTransit: trackingData.filter((record) => record.currentStatusValue === "in_transit").length,
            exceptions: trackingData.filter((record) => record.currentStatusValue === "exception").length,
            completed: trackingData.filter((record) => record.currentStatusValue === "completed").length,
        }
    }, [trackingData])

    const filteredRecords = useMemo(() => {
        return trackingData.filter((record) => {
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