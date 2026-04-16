import { useEffect, useMemo, useRef, useState } from "react"
import { createAuditTimestamp, formatAuditTimestamp } from "../utils/dateUtils"
import {
    getAllowedManifestModes,
    getAllowedSourceLocations,
    getAllowedDestinationLocations,
    buildManifestPayload,
    createManifest,
} from "../services/manifestService"
import {
    getApprovedRequests,
    subscribeToRequests,
} from "../services/requestService"
import { 
    getRequestableInventory,
    findRequestableInventoryItemById,
    getManualSourceInventory,
    subscribeToInventory,
} from "../services/inventoryService"
import { getLocationByValue } from "../services/projectService"
import Toast from "./Toast"
import InfoHeader from "./InfoHeader"

function buildManifestItemsFromRequest(request) {
    if (!request) return []

    return request.items.map((requestItem) => {
        const inventoryItem = findRequestableInventoryItemById(requestItem.inventoryItemId)

        return {
            id: `${request.id}-${requestItem.id}`,
            inventoryItemId: requestItem.inventoryItemId,
            manifestQuantity: Math.min(requestItem.requestedQuantity, inventoryItem?.quantity ?? 0),
        }
    })
}

function createEmptyManualManifestItem() {
    return {
        id: `manual-${Date.now()}-${Math.random()}`,
        inventoryItemId: "",
        manifestQuantity: null,
    }
}

function ManifestInventoryPage({ onBack, currentUser, permissions = [] }) {
    const lineRefs = useRef({})
    const manifestRefs = useRef({})

    const [infoOpen, setInfoOpen] = useState(() => window.innerWidth > 900)

    const [toast, setToast] = useState({ message: "", type: "success" })

    const [manifestMode, setManifestMode] = useState("")

    const [approvedRequestOptions, setApprovedRequestOptions] = useState(() =>
        getApprovedRequests()
    )

    const [requestableInventoryItems, setRequestableInventoryItems] = useState(() =>
        getRequestableInventory()
    )

    const previousManifestMode = useRef("")

    const allowedManifestModes = useMemo(() => {
        return getAllowedManifestModes(permissions)
    }, [permissions])

    const allowedSourceLocationOptions = useMemo(() => {
        return getAllowedSourceLocations(manifestMode)
    }, [manifestMode])

    const allowedDestinationLocationOptions = useMemo(() => {
        return getAllowedDestinationLocations(manifestMode)
    }, [manifestMode])

    const [formError, setFormError] = useState("")
    const [manifestErrors, setManifestErrors] = useState({})
    const [itemErrors, setItemErrors] = useState({})

    const [manualSourceInventory, setManualSourceInventory] = useState([])

    const [manifestForm, setManifestForm] = useState({
        createdBy: currentUser?.username || "",
        createdAt: createAuditTimestamp(),

        requestId: "",
        requestedBy: "",
        approvedBy: "",
        approvedAt: null,

        manifestDate: "",
        
        locationValue: "",
        location: "",
        projectValue: "",
        project: "",

        sourceLocationValue: "",
        destinationLocationValue: "",
        destinationDetail: "",
        
        notes: "",
        
        finalizedBy: "",
        finalizedAt: "",
    })

    const [editableManifestItems, setEditableManifestItems] = useState([])

    const selectedRequest = useMemo(() => {
        return (
            approvedRequestOptions.find(
                (request) => String(request.id) === String(manifestForm.requestId)
            ) || null
        )
    }, [manifestForm.requestId, approvedRequestOptions])

    const selectedSourceLocation = useMemo(() => {
        return getLocationByValue(manifestForm.sourceLocationValue)
    }, [manifestForm.sourceLocationValue])

    const selectedDestinationLocation = useMemo(() => {
        return getLocationByValue(manifestForm.destinationLocationValue)
    }, [manifestForm.destinationLocationValue])

    useEffect(() => {
        if (allowedManifestModes.length === 1 && !manifestMode) {
            setManifestMode(allowedManifestModes[0])
        }
    }, [allowedManifestModes, manifestMode])

    useEffect(() => {
        const previousMode = previousManifestMode.current

        if (previousMode === "") {
            previousManifestMode.current = manifestMode
            return
        }

        resetManifestState()

        setManifestForm((prev) => ({
            ...prev,
            requestId: "",
            requestedBy: "",
            approvedBy: "",
            approvedAt: null,
            locationValue: "",
            location: "",
            projectValue: "",
            project: "",
            sourceLocationValue: "",
            destinationLocationValue: "",
            destinationDetail: "",
            notes: "",
        }))

        previousManifestMode.current = manifestMode
    }, [manifestMode])

    useEffect(() => {
        function refreshRequests() {
            setApprovedRequestOptions(getApprovedRequests())
        }

        const unsubscribe = subscribeToRequests(refreshRequests)
        return unsubscribe
    }, [])

    useEffect(() => {
        if (manifestMode !== "outbound") return
        if (!manifestForm.requestId) return

        const stillExists = approvedRequestOptions.some(
            (request) => String(request.id) === String(manifestForm.requestId)
        )

        if (!stillExists) {
            resetManifestState()

            setManifestForm((prev) => ({
                ...prev,
                requestId: "",
                requestedBy: "",
                approvedBy: "",
                approvedAt: null,
                locationValue: "",
                location: "",
                projectValue: "",
                project: "",
                sourceLocationValue: "",
                destinationLocationValue: "",
                destinationDetail: "",
                notes: "",
            }))
        }
    }, [approvedRequestOptions, manifestForm.requestId, manifestMode])

    useEffect(() => {
        function refreshInventory() {
            setRequestableInventoryItems(getRequestableInventory())
        }

        const unsubscribe = subscribeToInventory(refreshInventory)
        return unsubscribe
    }, [])

    useEffect(() => {
        if (!manifestMode || manifestMode === "outbound") {
            setManualSourceInventory([])
            return
        }

        if (!manifestForm.sourceLocationValue) {
            setManualSourceInventory([])
            return
        }

        setManualSourceInventory(
            getManualSourceInventory(manifestMode, manifestForm.sourceLocationValue)
        )
    }, [manifestMode, manifestForm.sourceLocationValue, requestableInventoryItems])

    useEffect(() => {
        if (manifestMode === "outbound") return
        if (editableManifestItems.length === 0) return

        setEditableManifestItems((prev) =>
            prev.map((item) => {
                if (!item.inventoryItemId) return item

                const matchingInventory = manualSourceInventory.find(
                    (inventoryItem) => String(inventoryItem.id) === String(item.inventoryItemId)
                )

                if (!matchingInventory) {
                    return {
                        ...item,
                        inventoryItemId: "",
                        manifestQuantity: null,
                    }
                }

                const availableQty = Number(matchingInventory.quantity || 0)
                const currentQty = Number(item.manifestQuantity || 0)

                return {
                    ...item,
                    manifestQuantity: currentQty > availableQty ? availableQty : item.manifestQuantity,
                }
            })
        )
    }, [manualSourceInventory, manifestMode])

    function showToast(message, type = "success") {
        setToast({ message, type })

        window.clearTimeout(showToast.timeoutId)
        showToast.timeoutId = window.setTimeout(() => {
            setToast({ message: "", type: "success" })
        }, 3000)
    }

    function resetManifestState() {
        setEditableManifestItems([])
        setManualSourceInventory([])
        setItemErrors({})
        setManifestErrors({})
        setFormError("")
    }

    function handleManifestChange(e) {
        const { name, value } = e.target

        if (name === "requestId" && manifestMode === "outbound") {
            resetManifestState()

            const request =
                approvedRequestOptions.find(
                    (requestOption) => String(requestOption.id) === String(value)
                ) || null

            setManifestForm((prev) => ({
                ...prev,
                requestId: value,
                requestedBy: request?.requestedBy || "",
                approvedBy: request?.approvedBy || "",
                approvedAt: request?.approvedAt || null,
                
                locationValue: request?.locationValue || "",
                location: request?.location || "",
                projectValue: request?.projectValue || "",
                project: request?.project || "",

                sourceLocationValue: request?.sourceWarehouseValue || "",
                destinationLocationValue: request?.locationValue || "",
                destinationDetail: request?.deliveryLocationText || "",

                notes: request?.notes || "",
            }))

            setEditableManifestItems(buildManifestItemsFromRequest(request))

            if (formError) {
                setFormError("")
            }

            return
        }

        if (name === "sourceLocationValue" && manifestMode !== "outbound") {
            resetManifestState()

            setManifestForm((prev) => ({
                ...prev,
                requestId: "",
                requestedBy: "",
                approvedBy: "",
                approvedAt: null,
                sourceLocationValue: value,
                destinationLocationValue: value === prev.destinationLocationValue ? "" : prev.destinationLocationValue,
                destinationDetail: "",
            }))

            if (formError) {
                setFormError("")
            }

            return
        }

        setManifestForm((prev) => ({
            ...prev,
            [name]: value,
        }))

        setManifestErrors((prev) => {
            if (!prev[name]) return prev
            const next = { ...prev }
            delete next[name]
            return next
        })

        if (formError) {
            setFormError("")
        }
    }

    function handleManifestItemChange(id, field, value) {
        setEditableManifestItems((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item
                
                if (field === "inventoryItemId") {
                    const selectedInventory = manualSourceInventory.find(
                        (inventoryItem) => String(inventoryItem.id) === String(value)
                    )

                    const isDuplicate = prev.some(
                        (existingItem) => existingItem.id !== id && String(existingItem.inventoryItemId) === String(value)
                    )

                    if (isDuplicate) {
                        setItemErrors((prevErrors) => ({
                            ...prevErrors,
                            [id]: {
                                ...prevErrors[id],
                                inventoryItemId: "This inventory item has already been selected.",
                            },
                        }))
                        return item
                    }

                    return {
                        ...item,
                        inventoryItemId: value,
                        manifestQuantity: selectedInventory?.quantity
                            ? Number(selectedInventory.quantity)
                            : null,
                    }
                }

                return {
                    ...item,
                    [field]: value,
                }
            })
        )

        setItemErrors((prev) => {
            if (!prev[id]?.[field]) return prev

            const next = { ...prev }
            next[id] = { ...next[id] }
            delete next[id][field]

            if (Object.keys(next[id]).length === 0) {
                delete next[id]
            }
            
            return next
        })

        if (formError) {
            setFormError("")
        }
    }

    function handleAddManualManifestItem() {
        setEditableManifestItems((prev) => [...prev, createEmptyManualManifestItem()])
    }

    function handleRemoveManualManifestItem(id) {
        setEditableManifestItems((prev) => 
            prev.filter((item) => item.id !== id)
        )

        setItemErrors((prev) => {
            if (!prev[id]) return prev
            const next = { ...prev }
            delete next[id]
            return next
        })

        delete lineRefs.current[id]
    }

    function scrollToFirstError(newManifestErrors, newItemErrors) {
        const manifestErrorOrder = [
            "manifestMode",
            "requestId",
            "manifestDate",
            "sourceLocationValue",
            "destinationLocationValue",
        ]

        for (const field of manifestErrorOrder) {
            if (newManifestErrors[field]) {
                manifestRefs.current[field]?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                })
                manifestRefs.current[field]?.focus?.()
                return
            }
        }

        const firstItemId = Object.keys(newItemErrors)[0]
        if (!firstItemId) return

        lineRefs.current[firstItemId]?.scrollIntoView({
            behavior: "smooth",
            block: "center",
        })
    }

    function validateManifestForm() {
        const newManifestErrors = {}
        const newItemErrors = {}

        if (!manifestMode) {
            newManifestErrors.manifestMode = "Manifest type is required."
        }

        if (manifestMode === "outbound" && !manifestForm.requestId.trim()) {
            newManifestErrors.requestId = "Request selection is required."
        }

        if (!manifestForm.manifestDate.trim()) {
            newManifestErrors.manifestDate = "Manifest date is required."
        }

        if (manifestMode !== "outbound" && !manifestForm.sourceLocationValue.trim()) {
            newManifestErrors.sourceLocationValue = "Source Location is required."
        }

        if (manifestMode !== "outbound" && !manifestForm.destinationLocationValue.trim()) {
            newManifestErrors.destinationLocationValue = "Destination Location is required."
        }

        if (
            manifestForm.sourceLocationValue &&
            manifestForm.destinationLocationValue &&
            manifestForm.sourceLocationValue === manifestForm.destinationLocationValue
        ) {
            newManifestErrors.destinationLocationValue = "Source and destination cannot be the same."
        }

        if (manifestMode === "outbound" && !selectedRequest) {
            setManifestErrors(newManifestErrors)
            setItemErrors({})
            setFormError("A valid request is required to build an outbound manifest.")
            return false
        }

        if (editableManifestItems.length === 0) {
            setManifestErrors(newManifestErrors)
            setItemErrors({})
            setFormError("At least one manifest item is required.")
            return false
        }

        let hasAtLeastOneManifestedItem = false

        editableManifestItems.forEach((manifestItem) => {
            const errors = {}

            const inventoryItem = 
                manifestMode === "outbound"
                    ? requestableInventoryItems.find((item) => item.id === manifestItem.inventoryItemId)
                    : manualSourceInventory.find(
                        (item) => String(item.id) === String(manifestItem.inventoryItemId)
                    )

            const manifestQty = Number(manifestItem.manifestQuantity || 0)
            const availableQty = Number(inventoryItem?.quantity || 0)

            if (manifestMode !== "outbound" && !manifestItem.inventoryItemId) {
                errors.inventoryItemId = "Inventory item selection is required."
            }

            if (manifestMode !== "outbound" && manifestItem.inventoryItemId) {
                const duplicateCount = editableManifestItems.filter(
                    (item) => String(item.inventoryItemId) === String(manifestItem.inventoryItemId)
                ).length

                if (duplicateCount > 1) {
                    errors.inventoryItemId = "This inventory item has already been selected."
                }
            }

            if (manifestItem.manifestQuantity === null || manifestItem.manifestQuantity === "") {
                errors.manifestQuantity = "Manifest quantity is required."
            } else if (manifestQty < 0) {
                errors.manifestQuantity = "Manifest quantity cannot be negative."
            } else if (manifestQty > availableQty) {
                errors.manifestQuantity = "Manifest quantity exceeds available inventory."
            }

            if (manifestMode === "outbound") {
                const requestedItem = selectedRequest.items.find(
                    (item) => item.inventoryItemId === manifestItem.inventoryItemId
                )

                const requestedQty = Number(requestedItem?.requestedQuantity || 0)

                if (manifestQty > requestedQty) {
                    errors.manifestQuantity = "Manifest quantity cannot exceed requested quantity."
                }
            }

            if (manifestQty > 0) {
                hasAtLeastOneManifestedItem = true
            }

            if (Object.keys(errors).length > 0) {
                newItemErrors[manifestItem.id] = errors
            }
        })

        setManifestErrors(newManifestErrors)
        setItemErrors(newItemErrors)

        const hasManifestErrors = Object.keys(newManifestErrors).length > 0
        const hasItemErrors = Object.keys(newItemErrors).length > 0

        if (hasManifestErrors || hasItemErrors) {
            setFormError("")
            setTimeout(() => {
                scrollToFirstError(newManifestErrors, newItemErrors)
            }, 0)
            return false
        }

        if (!hasAtLeastOneManifestedItem) {
            setFormError("At least one item must have a manifest quantity greater than 0.")
            return false
        }

        setFormError("")
        return true
    }

    function handleSaveDraft() {
        showToast("Save Draft not yet implemented", "error")
    }

    function handleFinalizeManifest(e) {
        e.preventDefault()

        const isValid = validateManifestForm()
        if(!isValid) return

        const manifestPayload = buildManifestPayload({
            manifestMode,
            manifestForm,
            editableManifestItems,
            selectedSourceLocation,
            selectedDestinationLocation,
            requestableInventoryItems,
            manualSourceInventory,
            currentUser,
        })

        const createdManifest = createManifest(manifestPayload)

        setManifestForm((prev) => ({
            ...prev,
            finalizedBy: createdManifest.finalizedBy,
            finalizedAt: createdManifest.finalizedAt,
        }))

        showToast(`Manifest ${createdManifest.id} finalized.`)
    }

    function getRequestedQuantity(inventoryItemId) {
        return (
            selectedRequest?.items.find((item) => item.inventoryItemId === inventoryItemId)?.requestedQuantity ?? 0
        )
    }

    if (allowedManifestModes.length === 0) {
        return (
            <div className="manifest-page">
                <div className="manifest-page-scroll">
                    <InfoHeader
                        title="Manifest Inventory"
                        subtitle="Build a manifest from a request, confirm available quantities, and prepare inventory for transfer."
                        onBack={onBack}
                        infoOpen={infoOpen}
                        onToggleInfo={() => setInfoOpen((prev) => !prev)}
                        countText="0 items"
                    />

                    <section className="page-section manifest-form-section">
                        <div className="manifest-empty-state">
                            No manifest options are currently available for your role.
                        </div>
                    </section>
                </div>
            </div>
        )
    }

    return (
        <>
            <div className="manifest-page">
                <div className="manifest-page-scroll">
                    <form className="manifest-form" onSubmit={handleFinalizeManifest}>
                        <InfoHeader
                            title="Manifest Inventory"
                            subtitle="Build a manifest from a request, confirm available quantities, and prepare inventory for transfer."
                            onBack={onBack}
                            infoOpen={infoOpen}
                            onToggleInfo={() => setInfoOpen((prev) => !prev)}
                            countText={`${editableManifestItems.length} item${editableManifestItems.length !== 1 ? "s" : ""}`}
                        />

                        <section className="page-section manifest-form-section">
                            <div className="section-heading-row">
                                <h2 className="section-title">Manifest Information</h2>
                            </div>

                            {allowedManifestModes.length > 1 && (
                                <label className="form-group">
                                    <span className="form-label">Manifest Type</span>
                                    <select
                                        ref={(el) => (manifestRefs.current.manifestMode = el)}
                                        className={`form-input ${manifestErrors.manifestMode ? "input-error" : ""}`}
                                        value={manifestMode}
                                        onChange={(e) => setManifestMode(e.target.value)}
                                    >
                                        <option value="">Select manifest type</option>
                                        {allowedManifestModes.includes("outbound") && (
                                            <option value="outbound">Outbound to Job Site</option>
                                        )}
                                        {allowedManifestModes.includes("return") && (
                                            <option value="return">Return to Warehouse</option>
                                        )}
                                        {allowedManifestModes.includes("warehouse_transfer") && (
                                            <option value="warehouse_transfer">Warehouse to Warehouse</option>
                                        )}
                                    </select>
                                    {manifestErrors.manifestMode && (
                                        <span className="field-error">{manifestErrors.manifestMode}</span>
                                    )}
                                </label>
                            )}

                            <div className="receive-form-grid">
                                <label className="form-group">
                                    <span className="form-label">Created By</span>
                                    <input 
                                        className="form-input read-only-input"
                                        type="text"
                                        name="createdBy"
                                        value={manifestForm.createdBy}
                                        readOnly
                                    />
                                </label>

                                {manifestMode ==="outbound" && (
                                    <label className="form-group">
                                        <span className="form-label">Request</span>
                                        <select
                                            ref={(el) => (manifestRefs.current.requestId = el)}
                                            id="manifest-requestId"
                                            className={`form-input ${manifestErrors.requestId ? "input-error": ""}`}
                                            name="requestId"
                                            value={manifestForm.requestId}
                                            onChange={handleManifestChange}
                                        >
                                            <option value="">Select approved request</option>
                                            {approvedRequestOptions.map((request) => (
                                                <option key={request.id} value={request.id}>
                                                    {request.id} - {request.project} ({request.priority})
                                                </option>
                                            ))}
                                        </select>
                                        {manifestErrors.requestId && (
                                            <span className="field-error">{manifestErrors.requestId}</span>
                                        )}
                                    </label>
                                )}

                                {manifestMode === "outbound" && manifestForm.requestId && (
                                    <>
                                        <label className="form-group">
                                            <span className="form-label">Requested By</span>
                                            <input 
                                                className="form-input read-only-input"
                                                type="text"
                                                value={manifestForm.requestedBy || ""}
                                                readOnly
                                            />
                                        </label>

                                        <label className="form-group">
                                            <span className="form-label">Approved By</span>
                                            <input 
                                                className="form-input read-only-input"
                                                type="text"
                                                value={manifestForm.approvedBy || ""}
                                                readOnly
                                            />
                                        </label>

                                        <label className="form-group">
                                            <span className="form-label">Approved At</span>
                                            <input 
                                                className="form-input read-only-input"
                                                type="text"
                                                value={formatAuditTimestamp(manifestForm.approvedAt)}
                                                readOnly
                                            />
                                        </label>
                                    </>
                                )}

                                <label className="form-group">
                                    <span className="form-label">Manifest Date</span>
                                    <input
                                        ref={(el) => (manifestRefs.current.manifestDate = el)}
                                        id="manifest-manifestDate"
                                        className={`form-input ${manifestErrors.manifestDate ? "input-error": ""}`}
                                        type="date"
                                        name="manifestDate"
                                        value={manifestForm.manifestDate}
                                        onChange={handleManifestChange}
                                    />
                                    {manifestErrors.manifestDate && (
                                        <span className="field-error">{manifestErrors.manifestDate}</span>
                                    )}
                                </label>

                                <label className="form-group">
                                    <span className="form-label">Finalized By</span>
                                    <input
                                        className="form-input read-only-input"
                                        type="text"
                                        value={manifestForm.finalizedBy || ""}
                                        readOnly
                                    />
                                </label>

                                <label className="form-group">
                                    <span className="form-label">Finalized At</span>
                                    <input
                                        className="form-input read-only-input"
                                        type="text"
                                        value={formatAuditTimestamp(manifestForm.finalizedAt)}
                                        readOnly
                                    />
                                </label>

                                {manifestMode === "outbound" ? (
                                    <>
                                        <label className="form-group">
                                            <span className="form-label">Source Location</span>
                                            <input 
                                                ref={(el) => (manifestRefs.current.sourceLocationValue = el)}
                                                className="form-input read-only-input"
                                                type="text"
                                                name="sourceLocationValue"
                                                value={selectedSourceLocation?.label || ""}
                                                readOnly
                                            />
                                        </label>

                                        <label className="form-group receive-form-span-2">
                                            <span className="form-label">Destination Location</span>
                                            <input 
                                                ref={(el) => (manifestRefs.current.destinationLocationValue = el)}
                                                className="form-input read-only-input"
                                                type="text"
                                                name="destinationLocationValue"
                                                value={selectedDestinationLocation?.label || ""}
                                                readOnly
                                            />
                                        </label>

                                        <label className="form-group receive-form-span-2">
                                            <span className="form-label">Destination Detail</span>
                                            <input 
                                                className="form-input read-only-input"
                                                type="text"
                                                value={manifestForm.destinationDetail || ""}
                                                readOnly
                                            />
                                        </label>
                                    </>
                                ) : (
                                    <>
                                    <label className="form-group">
                                            <span className="form-label">Source Location</span>
                                            <select 
                                                ref={(el) => (manifestRefs.current.sourceLocationValue = el)}
                                                className={`form-input ${manifestErrors.sourceLocationValue ? "input-error" : ""}`}
                                                name="sourceLocationValue"
                                                value={manifestForm.sourceLocationValue}
                                                onChange={handleManifestChange}
                                            >
                                                <option value="">Select source location</option>
                                                {allowedSourceLocationOptions.map((location) => (
                                                    <option key={location.value} value={location.value}>
                                                        {location.label}
                                                    </option>
                                                ))}
                                            </select>
                                            {manifestErrors.sourceLocationValue && (
                                                <span className="field-error">{manifestErrors.sourceLocationValue}</span>
                                            )}
                                        </label>

                                        <label className="form-group receive-form-span-2">
                                            <span className="form-label">Destination Location</span>
                                            <select
                                                ref={(el) => (manifestRefs.current.destinationLocationValue = el)}
                                                className={`form-input ${manifestErrors.destinationLocationValue ? "input-error" : ""}`}
                                                name="destinationLocationValue"
                                                value={manifestForm.destinationLocationValue}
                                                onChange={handleManifestChange}
                                            >
                                                <option value="">Select destination location</option>
                                                {allowedDestinationLocationOptions
                                                    .filter((location) => location.value !== manifestForm.sourceLocationValue)
                                                    .map((location) => (
                                                        <option key={location.value} value={location.value}>
                                                            {location.label}
                                                        </option>
                                                    ))}
                                            </select>
                                            {manifestErrors.destinationLocationValue && (
                                                <span className="field-error">{manifestErrors.destinationLocationValue}</span>
                                            )}
                                        </label> 
                                    </>
                                )}
                            </div>
                        </section>

                        <section className="page-section manifest-form-section">
                            <div className="section-heading-row">
                                <h2 className="section-title">Manifest Items</h2>
                            </div>

                            {manifestMode === "outbound" ? (
                                selectedRequest ? (
                                    <div className="received-items-list">
                                        {editableManifestItems.map((manifestItem, index) => {
                                            const inventoryItem = requestableInventoryItems.find(
                                                (item) => item.id === manifestItem.inventoryItemId
                                            )

                                            const requestedQuantity = getRequestedQuantity(manifestItem.inventoryItemId)
                                            const availableQuantity = Number(inventoryItem?.quantity || 0)
                                            const requestedQty = Number(requestedQuantity || 0)

                                            const isOutOfStock = availableQuantity === 0
                                            const isPartial = availableQuantity > 0 && availableQuantity < requestedQty

                                            return (
                                                <div
                                                    className={`received-item-card 
                                                        ${isOutOfStock ? "manifest-item-out" : ""} 
                                                        ${isPartial ? "manifest-item-short" : ""}`}
                                                    key={manifestItem.id}
                                                    ref={(el) => (lineRefs.current[manifestItem.id] = el)}
                                                >
                                                    <div className="section-heading-row">
                                                        <h3 className="received-item-title">Item {index + 1}</h3>
                                                        {isPartial && <span className="manifest-warning-badge">Short Available</span>}
                                                        {isOutOfStock && <span className="manifest-warning-out">Out of Stock</span>}
                                                    </div>

                                                    <div className="receive-form-grid">
                                                        <label className="form-group receive-form-span-2">
                                                            <span className="form-label">Material</span>
                                                            <input 
                                                                className="form-input read-only-input"
                                                                type="text"
                                                                value={inventoryItem?.name || ""}
                                                                readOnly
                                                            />
                                                        </label>

                                                        <label className="form-group receive-form-span-2">
                                                            <span className="form-label">SKU</span>
                                                            <input 
                                                                className="form-input read-only-input"
                                                                type="text"
                                                                value={inventoryItem?.sku || ""}
                                                                readOnly
                                                            />
                                                        </label>

                                                        <label className="form-group receive-form-span-2">
                                                            <span className="form-label">Unit</span>
                                                            <input 
                                                                className="form-input read-only-input"
                                                                type="text"
                                                                value={inventoryItem?.unit || ""}
                                                                readOnly
                                                            />
                                                        </label>

                                                        <label className="form-group receive-form-span-2">
                                                            <span className="form-label">Requested Quantity</span>
                                                            <input 
                                                                className="form-input read-only-input"
                                                                type="text"
                                                                value={requestedQuantity}
                                                                readOnly
                                                            />
                                                        </label>

                                                        <label className="form-group receive-form-span-2">
                                                            <span className="form-label">Available Quantity</span>
                                                            <input 
                                                                className={`form-input read-only-input ${(isPartial || isOutOfStock) ? "manifest-readonly-warning" : ""}`}
                                                                type="text"
                                                                value={availableQuantity}
                                                                readOnly
                                                            />
                                                        </label>

                                                        <label className="form-group receive-form-span-2">
                                                            <span className="form-label">Manifest Quantity</span>
                                                            <input 
                                                                className={`form-input ${itemErrors[manifestItem.id]?.manifestQuantity ? "input-error" : ""}`}
                                                                type="number"
                                                                value={manifestItem.manifestQuantity}
                                                                onChange={(e) => handleManifestItemChange(
                                                                    manifestItem.id,
                                                                    "manifestQuantity",
                                                                    e.target.value
                                                                )}
                                                                placeholder="0"
                                                            />
                                                            {itemErrors[manifestItem.id]?.manifestQuantity && (
                                                                <span className="field-error">
                                                                    {itemErrors[manifestItem.id].manifestQuantity}
                                                                </span>
                                                            )}
                                                        </label>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                            ):(
                                <div className="manifest-empty-state">
                                    Select an approved request to load requested items and confirm manifest quantities.
                                </div>
                            )
                            ) : (
                                <div className="received-items-list">
                                    {editableManifestItems.map((manifestItem, index) => {
                                        const inventoryItem = manualSourceInventory.find(
                                            (item) => String(item.id) === String(manifestItem.inventoryItemId)
                                        )

                                        const selectedInventoryIds = editableManifestItems
                                            .filter((item) => item.id !== manifestItem.id && item.inventoryItemId)
                                            .map((item) => String(item.inventoryItemId))
                                        
                                        const hasSelectedInventory = !!manifestItem.inventoryItemId
                                        const availableQuantity = hasSelectedInventory
                                            ? Number(inventoryItem?.quantity || 0)
                                            : ""
                                        const isOutOfStock = hasSelectedInventory && Number(inventoryItem?.quantity || 0) === 0

                                        return (
                                            <div
                                                className={`received-item-card ${isOutOfStock ? "manifest-item-out" : ""}`}
                                                key={manifestItem.id}
                                                ref={(el) => (lineRefs.current[manifestItem.id]= el)}
                                            >
                                                <div className="section-heading-row">
                                                    <h3 className="received-item-title">Item {index + 1}</h3>
                                                    {isOutOfStock && (
                                                        <span className="manifest-warning-out">Out of Stock</span>
                                                    )}
                                                    {editableManifestItems.length > 1 && (
                                                        <button
                                                            className="text-button"
                                                            type="button"
                                                            onClick={() => handleRemoveManualManifestItem(manifestItem.id)}
                                                        >
                                                            Remove
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="receive-form-grid">
                                                    <label className="form-group receive-form-span-2">
                                                        <span className="form-label">Inventory Item</span>
                                                        <select
                                                            className={`form-input ${itemErrors[manifestItem.id]?.inventoryItemId ? "input-error": ""}`}
                                                            value={manifestItem.inventoryItemId}
                                                            onChange={(e) => handleManifestItemChange(
                                                                    manifestItem.id,
                                                                    "inventoryItemId",
                                                                    e.target.value
                                                                )}
                                                        >
                                                            <option value="">Select inventory item</option>
                                                            {manualSourceInventory
                                                                .filter((item) => !selectedInventoryIds.includes(String(item.id)))
                                                                .map((item) => (
                                                                    <option key={item.id} value={item.id}>
                                                                        {item.name} ({item.sku})
                                                                    </option>
                                                                ))
                                                            }
                                                        </select>
                                                        {itemErrors[manifestItem.id]?.inventoryItemId && (
                                                            <span className="field-error">{itemErrors[manifestItem.id].inventoryItemId}</span>
                                                        )}
                                                    </label>

                                                    <label className="form-group receive-form-span-2">
                                                        <span className="form-label">SKU</span>
                                                        <input 
                                                            className="form-input read-only-input"
                                                            type="text"
                                                            value={inventoryItem?.sku || ""}
                                                            readOnly
                                                        />
                                                    </label>

                                                    <label className="form-group receive-form-span-2">
                                                        <span className="form-label">Unit</span>
                                                        <input 
                                                            className="form-input read-only-input"
                                                            type="text"
                                                            value={inventoryItem?.unit || ""}
                                                            readOnly
                                                        />
                                                    </label>

                                                    <label className="form-group receive-form-span-2">
                                                        <span className="form-label">Available Quantity</span>
                                                        <input 
                                                            className={`form-input read-only-input ${isOutOfStock ? "manifest-readonly-warning" : ""}`}
                                                            type="text"
                                                            value={availableQuantity}
                                                            readOnly
                                                        />
                                                    </label>

                                                    <label className="form-group receive-form-span-2">
                                                        <span className="form-label">Manifest Quantity</span>
                                                        <input 
                                                            className={`form-input ${itemErrors[manifestItem.id]?.manifestQuantity ? "input-error" : ""}`}
                                                            type="number"
                                                            value={manifestItem.manifestQuantity}
                                                            onChange={(e) => handleManifestItemChange(
                                                                manifestItem.id,
                                                                "manifestQuantity",
                                                                e.target.value
                                                            )}
                                                            placeholder="0"
                                                        />
                                                        {itemErrors[manifestItem.id]?.manifestQuantity && (
                                                            <span className="field-error">
                                                                {itemErrors[manifestItem.id].manifestQuantity}
                                                            </span>
                                                        )}
                                                    </label>
                                                </div>
                                            </div>
                                        )
                                    })}

                                    <div className="receive-add-item">
                                        {editableManifestItems.length === 0 && (
                                            <div className="empty-state-message">
                                                No items added yet. Select a manual manifest type and source location, then click Add Item.
                                            </div>
                                        )}
                                        <button
                                            className="secondary-button"
                                            type="button"
                                            onClick={handleAddManualManifestItem}
                                            disabled={!manifestForm.sourceLocationValue}
                                        >
                                            + Add Item
                                        </button>
                                    </div>
                                </div>
                            )}
                        </section>

                        <section className="page-section manifest-form-section">
                            <div className="section-heading-row">
                                <h2 className="section-title">Notes</h2>
                            </div>

                            <label className="form-group">
                                <span className="form-label">Manifest Notes</span>
                                <textarea 
                                    className="form-textarea"
                                    name="notes"
                                    value={manifestForm.notes}
                                    onChange={handleManifestChange}
                                    placeholder="Add notes about shortages, loading instructions, or special handling."
                                />
                            </label>
                        </section>

                        <section className="receive-actions">
                            {formError && <div className="login-error">{formError}</div>}

                            <button
                                className="secondary-button"
                                type="button"
                                onClick={handleSaveDraft}
                            >
                                Save Draft
                            </button>

                            <button className="primary-button" type="submit">
                                Finalize Manifest
                            </button>
                        </section>
                    </form>
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

export default ManifestInventoryPage