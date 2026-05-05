import { useEffect, useMemo, useRef, useState } from "react"
import { formatAuditTimestamp, formatDate } from "../utils/dateUtils"
import {
    getRequestsPendingApproval,
    subscribeToRequests,
    approveRequest,
    rejectRequest,
    buildRequestItemsWithCost,
} from "../services/requestService"
import { formatCurrency } from "../utils/formatters"
import { useAsyncData } from "../hooks/useAsyncData"
import Toast from "./Toast"
import FilterHeader from "./FilterHeader"
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

function PendingRequestDetailContent({
    request,
    approvalNotes,
    approvalError,
    onApprovalNotesChange,
    onApprove,
    onReject,
    onClose,
    showClose = false,
    requestRefs,
}) {
    if (!request) return null

    const requestItems = buildRequestItemsWithCost(request)

    const totalRequestCost = requestItems.reduce(
        (sum, item) => sum + Number(item.lineTotalCost || 0),
        0
    )

    return (
        <>
            <div className="detail-panel-header">
                <div className="section-heading-row">
                    <h2 className="section-title">Request Details</h2>
                    {showClose && (
                        <button className="text-button" onClick={onClose}>
                            Close
                        </button>
                    )}
                </div>

                <h3 className="inventory-item-title">{request.project}</h3>
                <p className="inventory-item-subtext">Request ID: {request.id}</p>
                <span className="status-badge reserved">{request.status}</span>
            </div>

            <div className="inventory-card-details detail-panel-grid">
                <div>
                    <span className="detail-label">Requested By: </span>
                    <span className="detail-value">{request.requestedBy}</span>
                </div>

                <div>
                    <span className="detail-label">Created At: </span>
                    <span className="detail-value">{formatAuditTimestamp(request.createdAt)}</span>
                </div>

                <div>
                    <span className="detail-label">Location: </span>
                    <span className="detail-value">{request.location}</span>
                </div>

                <div>
                    <span className="detail-label">Project: </span>
                    <span className="detail-value">{request.project}</span>
                </div>

                <div>
                    <span className="detail-label">Needed By: </span>
                    <span className="detail-value">{formatDate(request.neededByDate)}</span>
                </div>

                <div>
                    <span className="detail-label">Priority: </span>
                    <span className={getPriorityBadgeClass(request.priorityValue)}>
                        {request.priority}
                    </span>
                </div>

                <div>
                    <span className="detail-label">Source Warehouse: </span>
                    <span className="detail-value">{request.sourceWarehouse}</span>
                </div>

                <div>
                    <span className="detail-label">Delivery Location: </span>
                    <span className="detail-value">{request.deliveryLocationText}</span>
                </div>

                <div>
                    <span className="detail-label">Item Count: </span>
                    <span className="detail-value">{request.items.length}</span>
                </div>

                <div>
                    <span className="detail-label">Total Request Cost: </span>
                    <span className="detail-value">{formatCurrency(totalRequestCost)}</span>
                </div>
            </div>

            <div className="page-section request-form-section">
                <div className="section-heading-row">
                    <h2 className="section-title">Requested Items</h2>
                </div>

                <div className="received-items-list">
                    {requestItems.map((item, index) => (
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
                                        value={item.name}
                                        readOnly
                                    />
                                </label>

                                <label className="form-group">
                                    <span className="form-label">SKU</span>
                                    <input
                                        className="form-input read-only-input"
                                        type="text"
                                        value={item.sku}
                                        readOnly
                                    />
                                </label>

                                <label className="form-group">
                                    <span className="form-label">Unit</span>
                                    <input
                                        className="form-input read-only-input"
                                        type="text"
                                        value={item.unit}
                                        readOnly
                                    />
                                </label>

                                <label className="form-group">
                                    <span className="form-label">Requested Quantity</span>
                                    <input
                                        className="form-input read-only-input"
                                        type="text"
                                        value={item.requestedQuantity}
                                        readOnly
                                    />
                                </label>

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
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="page-section request-form-section">
                <div className="section-heading-row">
                    <h2 className="section-title">Notes</h2>
                </div>

                <label className="form-group">
                    <span className="form-label">Request Notes</span>
                    <textarea
                        className="form-textarea read-only-input"
                        value={request.notes || ""}
                        readOnly
                    />
                </label>

                <label className="form-group">
                    <span className="form-label">Approval Notes</span>
                    <textarea
                        ref={(el) => (requestRefs.current.approvalNotes = el)}
                        className={`form-textarea ${approvalError ? "input-error" : ""}`}
                        name="approvalNotes"
                        value={approvalNotes}
                        onChange={onApprovalNotesChange}
                        placeholder="Add approval notes or rejection reason."
                    />
                    {approvalError && (
                        <span className="field-error">{approvalError}</span>
                    )}
                </label>
            </div>

            <div className="receive-actions">
                <button className="secondary-button" type="button" onClick={onReject}>
                    Reject Request
                </button>

                <button className="primary-button" type="button" onClick={onApprove}>
                    Approve Request
                </button>
            </div>
        </>
    )
}

function PendingRequestModal({
    request,
    approvalNotes,
    approvalError,
    onApprovalNotesChange,
    onApprove,
    onReject,
    onClose,
    requestRefs,
}) {
    if (!request) return null

    return (
        <div className="inventory-modal-overlay" onClick={onClose}>
            <div className="inventory-modal-card" onClick={(e) => e.stopPropagation()}>
                <PendingRequestDetailContent
                    request={request}
                    approvalNotes={approvalNotes}
                    approvalError={approvalError}
                    onApprovalNotesChange={onApprovalNotesChange}
                    onApprove={onApprove}
                    onReject={onReject}
                    onClose={onClose}
                    showClose={true}
                    requestRefs={requestRefs}
                />
            </div>
        </div>
    )
}

function PendingRequestsPage({ onBack, currentUser }) {
    const requestRefs = useRef({})

    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 900)
    const [filtersOpen, setFiltersOpen] = useState(false)

    const {
        data: pendingRequests,
        loading: pendingLoading,
        setData: setPendingRequests,
    } = useAsyncData(() => getRequestsPendingApproval())

    const [toast, setToast] = useState({ message: "", type: "success" })

    const [searchTerm, setSearchTerm] = useState("")
    const [projectFilter, setProjectFilter] = useState("All")
    const [priorityFilter, setPriorityFilter] = useState("All")
    const [requesterFilter, setRequesterFilter] = useState("All")
    const [warehouseFilter, setWarehouseFilter] = useState("All")

    const [selectedRequest, setSelectedRequest] = useState(null)

    const [approvalNotes, setApprovalNotes] = useState("")
    const [approvalError, setApprovalError] = useState("")
    const [formError, setFormError] = useState("")

    function toSearchableText(value) {
        return String(value ?? "").toLowerCase()
    }

    useEffect(() => {
        function handleResize() {
            setIsMobile(window.innerWidth <= 900)
        }

        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
    }, [])

    useEffect(() => {
        async function refreshRequests() {
            const updated = await getRequestsPendingApproval()
            setPendingRequests(updated)
        }

        const unsubscribe = subscribeToRequests(refreshRequests)

        return unsubscribe
    }, [setPendingRequests])

    useEffect(() => {
        if (!selectedRequest) return

        const refreshedSelectedRequest =
            (pendingRequests ?? []).find(
                (request) => String(request.id) === String(selectedRequest.id)
            ) || null

        if (!refreshedSelectedRequest) {
            closeRequestDetails()
            return
        }

        if (refreshedSelectedRequest !== selectedRequest) {
            setSelectedRequest(refreshedSelectedRequest)
        }
    }, [pendingRequests, selectedRequest])

    function handleClearFilters() {
        setSearchTerm("")
        setProjectFilter("All")
        setPriorityFilter("All")
        setRequesterFilter("All")
        setWarehouseFilter("All")
    }

    function showToast(message, type = "success") {
        setToast({ message, type })

        window.clearTimeout(showToast.timeoutId)
        showToast.timeoutId = window.setTimeout(() => {
            setToast({ message: "", type: "success" })
        }, 3000)
    }

    async function refreshPendingRequests() {
        const updated = await getRequestsPendingApproval()
        setPendingRequests(updated)
    }

    function openRequestDetails(requestId) {
        const request =
            (pendingRequests ?? []).find(
                (req) => String(req.id) === String(requestId)
            ) || null

        if (!request || request.statusValue !== "pending_approval") return

        setSelectedRequest(request)
        setApprovalNotes(request.approvalNotes || "")
        setApprovalError("")
        setFormError("")
    }

    function closeRequestDetails() {
        setSelectedRequest(null)
        setApprovalNotes("")
        setApprovalError("")
        setFormError("")
    }

    function handleApprovalNotesChange(e) {
        setApprovalNotes(e.target.value)

        if (approvalError) {
            setApprovalError("")
        }

        if (formError) {
            setFormError("")
        }
    }

    function validateDecision(requireNotes = false) {
        if (requireNotes && !approvalNotes.trim()) {
            setApprovalError("Approval notes are required when rejecting a request.")
            requestRefs.current.approvalNotes?.scrollIntoView({
                behavior: "smooth",
                block: "center",
            })
            requestRefs.current.approvalNotes?.focus?.()
            return false
        }

        setApprovalError("")
        setFormError("")
        return true
    }

    async function handleApproveRequest() {
        if (!selectedRequest) return

        const isValid = validateDecision(false)
        if (!isValid) return

        const updatedRequest = await approveRequest(
            selectedRequest.id,
            currentUser?.username || "unknown",
            approvalNotes.trim()
        )

        if (!updatedRequest) {
            setFormError("Unable to approve request.")
            return
        }

        await refreshPendingRequests()
        closeRequestDetails()
        showToast(`Request ${selectedRequest.id} approved.`)
    }

    async function handleRejectRequest() {
        if (!selectedRequest) return

        const isValid = validateDecision(true)
        if (!isValid) return

        const updatedRequest = await rejectRequest(
            selectedRequest.id,
            currentUser?.username || "unknown",
            approvalNotes.trim()
        )

        if (!updatedRequest) {
            setFormError("Unable to reject request.")
            return
        }

        await refreshPendingRequests()
        closeRequestDetails()
        showToast(`Request ${selectedRequest.id} rejected.`, "error")
    }

    const requestSummaries = useMemo(() => {
        const requests = pendingRequests ?? []
        return requests.map((request) => {
            const itemsWithCost = buildRequestItemsWithCost(request)
            const totalCost = itemsWithCost.reduce(
                (sum, item) => sum + Number(item.lineTotalCost || 0),
                0
            )

            return {
                ...request,
                itemCount: Array.isArray(request.items) ? request.items.length : 0,
                totalCost,
            }
        })
    }, [pendingRequests])

    const safeRequestSummaries = useMemo(() => requestSummaries ?? [], [requestSummaries])

    const filterOptions = useMemo(() => {
        return {
            projects: ["All", ...new Set(safeRequestSummaries.map((request) => request.project))],
            priorities: ["All", ...new Set(safeRequestSummaries.map((request) => request.priority))],
            requesters: ["All", ...new Set(safeRequestSummaries.map((request) => request.requestedBy))],
            warehouses: ["All", ...new Set(safeRequestSummaries.map((request) => request.sourceWarehouse))],
        }
    }, [safeRequestSummaries])

    const summary = useMemo(() => {
        const today = new Date()
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())

        const urgentCount = safeRequestSummaries.filter(
            (request) => request.priorityValue === "urgent"
        ).length

        const dueSoonCount = safeRequestSummaries.filter((request) => {
            if (!request.neededByDate) return false

            const neededDate = new Date(request.neededByDate)
            const neededMidnight = new Date(
                neededDate.getFullYear(),
                neededDate.getMonth(),
                neededDate.getDate()
            )

            const diffDays = (neededMidnight - todayMidnight) / (1000 * 60 * 60 * 24)

            return diffDays >= 0 && diffDays <= 2
        }).length

        const overdueCount = safeRequestSummaries.filter((request) => {
            if (!request.neededByDate) return false

            const neededDate = new Date(request.neededByDate)
            const neededMidnight = new Date(
                neededDate.getFullYear(),
                neededDate.getMonth(),
                neededDate.getDate()
            )

            return neededMidnight < todayMidnight
        }).length

        return {
            totalPending: safeRequestSummaries.length,
            urgent: urgentCount,
            dueSoon: dueSoonCount,
            overdue: overdueCount,
            totalPendingCost: safeRequestSummaries.reduce(
                (sum, request) => sum + Number(request.totalCost || 0),
                0
            ),
        }
    }, [safeRequestSummaries])

    const filteredRequests = useMemo(() => {
        return safeRequestSummaries.filter((request) => {
            const search = searchTerm.toLowerCase()
            const requestId = toSearchableText(request.id)
            const project = toSearchableText(request.project)
            const location = toSearchableText(request.location)
            const requestedBy = toSearchableText(request.requestedBy)
            const sourceWarehouse = toSearchableText(request.sourceWarehouse)

            const matchesSearch = 
                requestId.includes(search) ||
                project.includes(search) ||
                location.includes(search) ||
                requestedBy.includes(search) ||
                sourceWarehouse.includes(search)

            const matchesProject =
                projectFilter === "All" || request.project === projectFilter

            const matchesPriority =
                priorityFilter === "All" || request.priority === priorityFilter

            const matchesRequester =
                requesterFilter === "All" || request.requestedBy === requesterFilter

            const matchesWarehouse =
                warehouseFilter === "All" || request.sourceWarehouse === warehouseFilter

            return (
                matchesSearch &&
                matchesProject &&
                matchesPriority &&
                matchesRequester &&
                matchesWarehouse
            )
        })
    }, [
        safeRequestSummaries,
        searchTerm,
        projectFilter,
        priorityFilter,
        requesterFilter,
        warehouseFilter,
    ])

    const filteredCost = useMemo(() => {
        return filteredRequests.reduce(
            (sum, request) => sum + Number(request.totalCost || 0),
            0
        )
    }, [filteredRequests])

    const { projects, priorities, requesters, warehouses } = filterOptions

    if (pendingLoading) return <div>Loading...</div>

    return (
        <>
            <div className={`inventory-page ${filtersOpen && !isMobile ? "desktop-filters-open" : ""}`}>
                <div className="inventory-page-scroll">
                    <FilterHeader
                        title="Pending Requests"
                        subtitle="Review requests awaiting project manager approval before manifesting."
                        onBack={onBack}
                        filtersOpen={filtersOpen}
                        onToggleFilters={() => setFiltersOpen((prev) => !prev)}
                        leftMetaLabel="Cost:"
                        leftMetaValue={formatCurrency(filteredCost)}
                        rightMetaText={`${filteredRequests.length} request${filteredRequests.length !== 1 ? "s" : ""}`}
                    >
                        <input
                            type="text"
                            className="inventory-search"
                            placeholder="Search by request ID, project, requester, location, or warehouse."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />

                        <div className="filter-row">
                            <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
                                {projects.map((project) => (
                                    <option key={project} value={project}>
                                        Project: {project}
                                    </option>
                                ))}
                            </select>

                            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                                {priorities.map((priority) => (
                                    <option key={priority} value={priority}>
                                        Priority: {priority}
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

                            <select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)}>
                                {warehouses.map((warehouse) => (
                                    <option key={warehouse} value={warehouse}>
                                        Source Warehouse: {warehouse}
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
                                <span className="summary-label">Total Pending: </span>
                                <span className="summary-value">{summary.totalPending}</span>
                            </div>
                        </div>

                        <div className="summary-card">
                            <div className="summary-row">
                                <span className="summary-label">Urgent: </span>
                                <span className="summary-value">{summary.urgent}</span>
                            </div>
                        </div>

                        <div className="summary-card">
                            <div className="summary-row">
                                <span className="summary-label">Due Soon: </span>
                                <span className="summary-value">{summary.dueSoon}</span>
                            </div>
                        </div>

                        <div className="summary-card">
                            <div className="summary-row">
                                <span className="summary-label">Overdue: </span>
                                <span className="summary-value">{summary.overdue}</span>
                            </div>
                        </div>
                    </section>

                    <section className="inventory-content">
                        <div className="inventory-results">
                            <div className="inventory-card-list">
                                {filteredRequests.map((request) => (
                                    <div className="inventory-card" key={request.id}>
                                        <div className="inventory-card-top">
                                            <div>
                                                <h3 className="inventory-item-title">{request.project}</h3>
                                                <p className="inventory-item-subtext">Request ID: {request.id}</p>
                                            </div>

                                            <span className={getPriorityBadgeClass(request.priorityValue)}>
                                                {request.priority}
                                            </span>
                                        </div>

                                        <div className="inventory-card-details">
                                            <div>
                                                <span className="detail-label">Requested By: </span>
                                                <span className="detail-value">{request.requestedBy}</span>
                                            </div>

                                            <div>
                                                <span className="detail-label">Needed By: </span>
                                                <span className="detail-value">{formatDate(request.neededByDate)}</span>
                                            </div>

                                            <div>
                                                <span className="detail-label">Warehouse: </span>
                                                <span className="detail-value">{request.sourceWarehouse}</span>
                                            </div>

                                            <div>
                                                <span className="detail-label">Items: </span>
                                                <span className="detail-value">{request.itemCount}</span>
                                            </div>

                                            <div>
                                                <span className="detail-label">Total Cost: </span>
                                                <span className="detail-value">{formatCurrency(request.totalCost)}</span>
                                            </div>
                                        </div>

                                        <div className="inventory-location-block">
                                            <span className="detail-label">Delivery: </span>
                                            <span className="detail-value">{request.deliveryLocationText}</span>
                                        </div>

                                        <div className="inventory-card-button">
                                            <button
                                                className="secondary-button"
                                                onClick={() => openRequestDetails(request.id)}
                                            >
                                                View Details
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <aside className="inventory-detail-panel inventory-detail-panel-scroll">
                            {selectedRequest ? (
                                <PendingRequestDetailContent
                                    request={selectedRequest}
                                    approvalNotes={approvalNotes}
                                    approvalError={approvalError}
                                    onApprovalNotesChange={handleApprovalNotesChange}
                                    onApprove={handleApproveRequest}
                                    onReject={handleRejectRequest}
                                    onClose={closeRequestDetails}
                                    showClose={true}
                                    requestRefs={requestRefs}
                                />
                            ) : (
                                <div className="detail-panel-empty">
                                    <p>Select a request to view more details.</p>
                                </div>
                            )}
                        </aside>
                    </section>

                    {formError && <div className="login-error">{formError}</div>}

                    {isMobile && (
                        <PendingRequestModal
                            request={selectedRequest}
                            approvalNotes={approvalNotes}
                            approvalError={approvalError}
                            onApprovalNotesChange={handleApprovalNotesChange}
                            onApprove={handleApproveRequest}
                            onReject={handleRejectRequest}
                            onClose={closeRequestDetails}
                            requestRefs={requestRefs}
                        />
                    )}
                </div>
            </div>

            <Toast
                message={toast.message}
                type={toast.type}
                onClose={() => setToast({ message: "", type: "success" })}
            />
        </>
    )
}

export default PendingRequestsPage