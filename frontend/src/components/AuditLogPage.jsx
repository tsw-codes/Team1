import { Fragment, useEffect, useMemo, useState } from "react"
import { formatAuditTimestamp } from "../utils/dateUtils"
import {
    getAuditEvents,
    getActionLabel,
    getActionGroup,
    getActionBadgeClass,
} from "../services/auditService"
import { subscribeToRequests } from "../services/requestService"
import { subscribeToManifests } from "../services/manifestService"
import { subscribeToTransfers } from "../services/transferService"
import { useAsyncData } from "../hooks/useAsyncData"
import FilterHeader from "./FilterHeader"

const RANGE_PRESETS = [
    { key: "all", label: "All time", hours: null },
    { key: "24h", label: "Last 24h", hours: 24 },
    { key: "7d", label: "Last 7 days", hours: 24 * 7 },
    { key: "30d", label: "Last 30 days", hours: 24 * 30 },
    { key: "custom", label: "Custom range", hours: null },
]

function toLocalDateInputValue(date) {
    if (!date) return ""
    const d = new Date(date)
    const pad = (n) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function AuditEventDetail({ event }) {
    if (!event) return null

    const adj = event.related?.adjustment
    const req = event.related?.request
    const manifest = event.related?.manifest
    const transfer = event.related?.transfer

    return (
        <div className="audit-log-detail-grid">
            <div>
                <span className="detail-label">When: </span>
                <span className="detail-value">
                    {event.at ? formatAuditTimestamp(event.at) : "-"}
                </span>
            </div>
            <div>
                <span className="detail-label">Who: </span>
                <span className="detail-value">{event.actor || "-"}</span>
            </div>
            <div>
                <span className="detail-label">Action: </span>
                <span className="detail-value">{getActionLabel(event.action)}</span>
            </div>
            <div>
                <span className="detail-label">Entity: </span>
                <span className="detail-value">
                    {event.entityType}: {event.entityId}
                </span>
            </div>
            <div>
                <span className="detail-label">Summary: </span>
                <span className="detail-value">{event.summary || "-"}</span>
            </div>

            {event.action === "inventory_adjusted" && adj ? (
                <>
                    <div>
                        <span className="detail-label">Adjustment Type: </span>
                        <span className="detail-value">{adj.adjustmentType}</span>
                    </div>
                    <div>
                        <span className="detail-label">Quantity Change: </span>
                        <span className="detail-value">
                            {event.qtyChange > 0 ? "+" : ""}
                            {event.qtyChange}
                        </span>
                    </div>
                    <div>
                        <span className="detail-label">Before → After: </span>
                        <span className="detail-value">
                            {adj.previousQuantity} → {adj.newQuantity}
                        </span>
                    </div>
                </>
            ) : null}

            {req ? (
                <>
                    <div>
                        <span className="detail-label">Request ID: </span>
                        <span className="detail-value">{req.id}</span>
                    </div>
                    {req.project ? (
                        <div>
                            <span className="detail-label">Project: </span>
                            <span className="detail-value">{req.project}</span>
                        </div>
                    ) : null}
                </>
            ) : null}

            {manifest ? (
                <>
                    <div>
                        <span className="detail-label">Manifest ID: </span>
                        <span className="detail-value">{manifest.id}</span>
                    </div>
                    {manifest.requestId ? (
                        <div>
                            <span className="detail-label">From Request: </span>
                            <span className="detail-value">{manifest.requestId}</span>
                        </div>
                    ) : null}
                </>
            ) : null}

            {transfer ? (
                <>
                    <div>
                        <span className="detail-label">Transfer ID: </span>
                        <span className="detail-value">{transfer.id}</span>
                    </div>
                    {transfer.manifestId ? (
                        <div>
                            <span className="detail-label">From Manifest: </span>
                            <span className="detail-value">{transfer.manifestId}</span>
                        </div>
                    ) : null}
                </>
            ) : null}

            {event.variances && event.variances.length > 0 ? (
                <div className="audit-log-detail-notes is-variance">
                    <span className="detail-label">Variance: </span>
                    <span className="detail-value">{event.variances.join("; ")}</span>
                </div>
            ) : event.notes ? (
                <div className="audit-log-detail-notes">
                    <span className="detail-label">Notes: </span>
                    <span className="detail-value">{event.notes}</span>
                </div>
            ) : null}
        </div>
    )
}

function AuditLogModal({ event, onClose }) {
    if (!event) return null
    return (
        <div className="inventory-modal-overlay" onClick={onClose}>
            <div className="inventory-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="detail-panel-header">
                    <h2 className="detail-panel-title">Audit Event</h2>
                    <button className="link-button" type="button" onClick={onClose}>
                        Close
                    </button>
                </div>
                <h3 className="detail-panel-subtitle">{getActionLabel(event.action)}</h3>
                <span className={getActionBadgeClass(event.action)}>
                    {getActionGroup(event.action)}
                </span>
                <AuditEventDetail event={event} />
            </div>
        </div>
    )
}

function AuditLogPage({ onBack }) {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 700)
    const [filtersOpen, setFiltersOpen] = useState(false)

    const [searchTerm, setSearchTerm] = useState("")
    const [actionFilter, setActionFilter] = useState("All")
    const [actorFilter, setActorFilter] = useState("All")
    const [entityTypeFilter, setEntityTypeFilter] = useState("All")
    const [rangePreset, setRangePreset] = useState("all")
    const [fromDate, setFromDate] = useState("")
    const [toDate, setToDate] = useState("")

    const [expandedEventId, setExpandedEventId] = useState(null)
    const [mobileEvent, setMobileEvent] = useState(null)
    const [auditVersion, setAuditVersion] = useState(0)

    const { data: events, loading, error } = useAsyncData(
        () => getAuditEvents(),
        [auditVersion]
    )

    useEffect(() => {
        function handleResize() {
            setIsMobile(window.innerWidth <= 700)
        }
        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
    }, [])

    useEffect(() => {
        function refresh() {
            setAuditVersion((prev) => prev + 1)
        }
        const unsubscribeRequests = subscribeToRequests(refresh)
        const unsubscribeManifests = subscribeToManifests(refresh)
        const unsubscribeTransfers = subscribeToTransfers(refresh)
        return () => {
            unsubscribeRequests()
            unsubscribeManifests()
            unsubscribeTransfers()
        }
    }, [])

    const filterOptions = useMemo(() => {
        return {
            actions: ["All", ...new Set((events ?? []).map((e) => e.action))],
            actors: [
                "All",
                ...new Set((events ?? []).map((e) => e.actor).filter(Boolean)),
            ],
            entityTypes: [
                "All",
                ...new Set((events ?? []).map((e) => e.entityType).filter(Boolean)),
            ],
        }
    }, [events])

    const summary = useMemo(() => {
        const totals = {
            total: (events ?? []).length,
            requests: 0,
            manifests: 0,
            transfers: 0,
            adjustments: 0,
        }
        for (const event of events ?? []) {
            const group = getActionGroup(event.action)
            if (group === "Request") totals.requests++
            else if (group === "Manifest") totals.manifests++
            else if (group === "Transfer") totals.transfers++
            else if (group === "Inventory") totals.adjustments++
        }
        return totals
    }, [events])

    const dateBounds = useMemo(() => {
        const now = Date.now()
        let fromMs = null
        let toMs = null

        const preset = RANGE_PRESETS.find((p) => p.key === rangePreset)
        if (preset && preset.hours) {
            fromMs = now - preset.hours * 60 * 60 * 1000
        }

        if (rangePreset === "custom") {
            if (fromDate) fromMs = new Date(`${fromDate}T00:00:00`).getTime()
            if (toDate) toMs = new Date(`${toDate}T23:59:59.999`).getTime()
        }

        return { fromMs, toMs }
    }, [rangePreset, fromDate, toDate])

    const filteredEvents = useMemo(() => {
        const { fromMs, toMs } = dateBounds
        return (events ?? []).filter((event) => {
            const search = searchTerm.toLowerCase()

            const matchesSearch =
                !search ||
                (event.entityId || "").toLowerCase().includes(search) ||
                (event.actor || "").toLowerCase().includes(search) ||
                (event.summary || "").toLowerCase().includes(search) ||
                (event.notes || "").toLowerCase().includes(search) ||
                getActionLabel(event.action).toLowerCase().includes(search)

            const matchesAction = actionFilter === "All" || event.action === actionFilter
            const matchesActor = actorFilter === "All" || event.actor === actorFilter
            const matchesEntity =
                entityTypeFilter === "All" || event.entityType === entityTypeFilter

            const eventMs = event.at ? new Date(event.at).getTime() : 0
            const matchesFrom = !fromMs || eventMs >= fromMs
            const matchesTo = !toMs || eventMs <= toMs

            return (
                matchesSearch &&
                matchesAction &&
                matchesActor &&
                matchesEntity &&
                matchesFrom &&
                matchesTo
            )
        })
    }, [
        events,
        searchTerm,
        actionFilter,
        actorFilter,
        entityTypeFilter,
        dateBounds,
    ])

    function handleRowClick(event) {
        if (isMobile) {
            setMobileEvent(event)
            return
        }
        setExpandedEventId((prev) => (prev === event.id ? null : event.id))
    }

    function handleClearFilters() {
        setSearchTerm("")
        setActionFilter("All")
        setActorFilter("All")
        setEntityTypeFilter("All")
        setRangePreset("all")
        setFromDate("")
        setToDate("")
    }

    function handleExportCsv() {
        const headers = ["When", "Who", "Action", "Entity Type", "Entity ID", "Summary", "Notes"]
        const rows = filteredEvents.map((event) => [
            event.at || "",
            event.actor || "",
            getActionLabel(event.action),
            event.entityType || "",
            event.entityId || "",
            event.summary || "",
            event.notes || "",
        ])

        const escape = (cell) => {
            const value = String(cell ?? "")
            if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
                return `"${value.replace(/"/g, '""')}"`
            }
            return value
        }

        const csv = [headers, ...rows]
            .map((row) => row.map(escape).join(","))
            .join("\n")

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `audit-log-${toLocalDateInputValue(new Date())}.csv`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
    }

    if (loading) {
        return (
            <div className="inventory-page">
                <p>Loading audit log...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="inventory-page">
                <p>Failed to load audit log.</p>
            </div>
        )
    }

    const { actions, actors, entityTypes } = filterOptions

    function renderEventRowMobile(event) {
        return (
            <button
                key={event.id}
                type="button"
                className="audit-log-row-mobile"
                onClick={() => setMobileEvent(event)}
            >
                <div className="audit-log-row-mobile-top">
                    <span className="audit-log-row-mobile-time">
                        {event.at ? formatAuditTimestamp(event.at) : "-"}
                    </span>
                    <span className={getActionBadgeClass(event.action)}>
                        {getActionLabel(event.action)}
                    </span>
                </div>
                <div className="audit-log-row-mobile-mid">
                    <span className="audit-log-row-mobile-actor">{event.actor || "-"}</span>
                    <span className="audit-log-row-mobile-entity">
                        {event.entityType}: {event.entityId}
                    </span>
                </div>
                {event.summary ? (
                    <div className="audit-log-row-mobile-summary">{event.summary}</div>
                ) : null}
                {event.notes ? (
                    <div className="audit-log-row-mobile-notes">{event.notes}</div>
                ) : null}
            </button>
        )
    }

    return (
        <div className="inventory-page">
            <div className="inventory-page-scroll">
                <FilterHeader
                    title="Audit Log"
                    subtitle="Every state change in the system, in chronological order."
                    onBack={onBack}
                    filtersOpen={filtersOpen}
                    onToggleFilters={() => setFiltersOpen((prev) => !prev)}
                    rightMetaText={`${filteredEvents.length} event${
                        filteredEvents.length !== 1 ? "s" : ""
                    }`}
                >
                    <input
                        type="text"
                        className="inventory-search"
                        placeholder="Search by ID, actor, summary, or notes..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />

                    <div className="filter-row">
                        <select
                            value={rangePreset}
                            onChange={(e) => setRangePreset(e.target.value)}
                        >
                            {RANGE_PRESETS.map((preset) => (
                                <option key={preset.key} value={preset.key}>
                                    Range: {preset.label}
                                </option>
                            ))}
                        </select>

                        <select
                            value={actionFilter}
                            onChange={(e) => setActionFilter(e.target.value)}
                        >
                            {actions.map((action) => (
                                <option key={action} value={action}>
                                    Action: {action === "All" ? "All" : getActionLabel(action)}
                                </option>
                            ))}
                        </select>

                        <select
                            value={actorFilter}
                            onChange={(e) => setActorFilter(e.target.value)}
                        >
                            {actors.map((actor) => (
                                <option key={actor} value={actor}>
                                    Actor: {actor}
                                </option>
                            ))}
                        </select>

                        <select
                            value={entityTypeFilter}
                            onChange={(e) => setEntityTypeFilter(e.target.value)}
                        >
                            {entityTypes.map((entityType) => (
                                <option key={entityType} value={entityType}>
                                    Entity: {entityType}
                                </option>
                            ))}
                        </select>
                    </div>

                    {rangePreset === "custom" ? (
                        <div className="filter-row">
                            <label className="filter-date-label">
                                From
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                />
                            </label>
                            <label className="filter-date-label">
                                To
                                <input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                />
                            </label>
                        </div>
                    ) : null}

                    <div className="filter-actions">
                        <button
                            className="secondary-button"
                            type="button"
                            onClick={handleClearFilters}
                        >
                            Clear Filters
                        </button>
                        <button
                            className="secondary-button"
                            type="button"
                            onClick={handleExportCsv}
                            disabled={filteredEvents.length === 0}
                        >
                            Export CSV
                        </button>
                    </div>
                </FilterHeader>

                <section className="inventory-summary-grid shipment-summary-grid">
                    <div className="summary-card">
                        <div className="summary-row">
                            <span className="summary-label">Total Events: </span>
                            <span className="summary-value">{summary.total}</span>
                        </div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-row">
                            <span className="summary-label">Requests: </span>
                            <span className="summary-value">{summary.requests}</span>
                        </div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-row">
                            <span className="summary-label">Manifests: </span>
                            <span className="summary-value">{summary.manifests}</span>
                        </div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-row">
                            <span className="summary-label">Transfers: </span>
                            <span className="summary-value">{summary.transfers}</span>
                        </div>
                    </div>
                    <div className="summary-card">
                        <div className="summary-row">
                            <span className="summary-label">Adjustments: </span>
                            <span className="summary-value">{summary.adjustments}</span>
                        </div>
                    </div>
                </section>

                <section className="audit-log-content">
                    {isMobile ? (
                        <div className="audit-log-mobile-list">
                            {filteredEvents.length === 0 ? (
                                <div className="audit-log-empty">
                                    No events match the current filters.
                                </div>
                            ) : (
                                filteredEvents.map(renderEventRowMobile)
                            )}
                        </div>
                    ) : (
                        <div className="audit-log-table-wrap">
                            <div className="audit-log-table-scroll">
                                <table className="audit-log-table">
                                    <thead>
                                        <tr>
                                            <th className="col-expand"></th>
                                            <th className="col-time">Time</th>
                                            <th className="col-actor">Who</th>
                                            <th>Action</th>
                                            <th className="col-entity">Entity</th>
                                            <th className="col-summary">Summary</th>
                                            <th className="col-notes">Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredEvents.length === 0 ? (
                                            <tr className="audit-log-empty-row">
                                                <td colSpan={7}>
                                                    No events match the current filters.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredEvents.map((event) => {
                                                const isExpanded = expandedEventId === event.id
                                                return (
                                                    <Fragment key={event.id}>
                                                        <tr
                                                            className={
                                                                isExpanded ? "expanded" : ""
                                                            }
                                                            onClick={() => handleRowClick(event)}
                                                        >
                                                            <td className="col-expand">
                                                                <span
                                                                    className={`audit-log-chevron ${
                                                                        isExpanded ? "open" : ""
                                                                    }`}
                                                                    aria-hidden="true"
                                                                >
                                                                    ▶
                                                                </span>
                                                            </td>
                                                            <td className="col-time">
                                                                {event.at
                                                                    ? formatAuditTimestamp(event.at)
                                                                    : "-"}
                                                            </td>
                                                            <td className="col-actor">
                                                                {event.actor || "-"}
                                                            </td>
                                                            <td>
                                                                <span
                                                                    className={getActionBadgeClass(
                                                                        event.action
                                                                    )}
                                                                >
                                                                    {getActionLabel(event.action)}
                                                                </span>
                                                            </td>
                                                            <td className="col-entity">
                                                                {event.entityType}: {event.entityId}
                                                            </td>
                                                            <td
                                                                className="col-summary"
                                                                title={event.summary || ""}
                                                            >
                                                                {event.summary || "-"}
                                                            </td>
                                                            <td
                                                                className={`col-notes${
                                                                    event.variances && event.variances.length > 0
                                                                        ? " is-variance"
                                                                        : ""
                                                                }`}
                                                                title={event.notes || ""}
                                                            >
                                                                {event.notes || ""}
                                                            </td>
                                                        </tr>
                                                        {isExpanded ? (
                                                            <tr className="audit-log-detail-row">
                                                                <td colSpan={7}>
                                                                    <AuditEventDetail event={event} />
                                                                </td>
                                                            </tr>
                                                        ) : null}
                                                    </Fragment>
                                                )
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </section>

                {isMobile && (
                    <AuditLogModal
                        event={mobileEvent}
                        onClose={() => setMobileEvent(null)}
                    />
                )}
            </div>
        </div>
    )
}

export default AuditLogPage
