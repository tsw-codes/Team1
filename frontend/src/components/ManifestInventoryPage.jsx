import { useEffect, useMemo, useRef, useState } from "react"
import { getAllowedSourceLocations, getAllowedDestinationLocations } from "../data/mockLocations"
import { createAuditTimestamp, formatAuditTimestamp } from "../utils/dateUtils"
import { getPendingRequests, findRequestById } from "../services/requestService"
import { getAllowedManifestModes, createManifest } from "../services/manifestService"
import { getRequestableInventory, findRequestableInventoryItemById, getManualSourceInventory } from "../services/inventoryService"

function buildManifestItemsFromRequest(request) {
    if (!request) return []

    return request.items.map((requestItem) => {
        const inventoryItem = findRequestableInventoryItemById(requestItem.inventoryItemId)

        return {
            id: `${request.id}-${requestItem.id}`,
            inventoryItemId: requestItem.inventoryItemId,
            manifestQuantity: Math.min(requestItem.requestedQuantity, inventoryItem?.quantity ?? 0).toString(),
        }
    })
}

function createEmptyManualManifestItem() {
    return {
        id: `manual-${Date.now()}-${Math.random()}`,
        inventoryItemId: "",
        manifestQuantity: "",
    }
}

function ManifestInventoryPage({ onBack, currentUser, permissions = [] }) {
    const lineRefs = useRef({})
    const manifestRefs = useRef({})

    const pendingRequestOptions = useMemo(() => {
        return getPendingRequests()
    }, [])

    const requestableInventoryItems = useMemo(() => {
        return getRequestableInventory()
    }, [])

    const previousManifestMode = useRef("")

    const allowedManifestModes = useMemo(() => {
        return getAllowedManifestModes(permissions)
    }, [permissions])

    const [manifestMode, setManifestMode] = useState("")

    const [formError, setFormError] = useState("")
    const [manifestErrors, setManifestErrors] = useState({})
    const [itemErrors, setItemErrors] = useState({})

    const [manualSourceInventory, setManualSourceInventory] = useState([])

    const [manifestForm, setManifestForm] = useState({
        createdBy: currentUser?.username || "",
        createdAt: createAuditTimestamp(),

        requestId: "",
        manifestDate: "",
        sourceLocation: "",
        destinationLocation: "",
        notes: "",
        
        finalizedBy: "",
        finalizedAt: "",
    })

    const [editableManifestItems, setEditableManifestItems] = useState([])

    const selectedRequest = useMemo(() => {
        return findRequestById(manifestForm.requestId)
    }, [manifestForm.requestId])

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
            sourceLocation: "",
            destinationLocation: "",
            notes: "",
        }))

        previousManifestMode.current = manifestMode
    }, [manifestMode])

    function resetManifestState() {
        setEditableManifestItems([])
        setManualSourceInventory([])
        setItemErrors({})
        setManifestErrors({})
        setFormError("")
    }

    function handleManifestChange(e) {
        const { name, value } = e.target

        setManifestForm((prev) => {
            const next = {
                ...prev,
                [name]: value,
            }

            if (name === "requestId" && manifestMode === "outbound") {
                resetManifestState()

                const request = findRequestById(value)

                next.sourceLocation = request ? "Warehouse Stock" : ""
                next.destinationLocation = request?.deliveryLocation || ""
                next.notes = request?.notes || ""

                setEditableManifestItems(buildManifestItemsFromRequest(request))
            }

            if (name === "sourceLocation" && manifestMode !== "outbound") {
                resetManifestState()

                const inventory = getManualSourceInventory(manifestMode, value)

                if (value === manifestForm.destinationLocation) {
                    next.destinationLocation = ""
                }

                setManualSourceInventory(inventory)
            }

            return next
        }) 

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
                            ? String(selectedInventory.quantity)
                            : "",
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
            "sourceLocation",
            "destinationLocation",
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

        if (manifestMode !== "outbound" && !manifestForm.sourceLocation.trim()) {
            newManifestErrors.sourceLocation = "Source Location is required."
        }

        if (manifestMode !== "outbound" && !manifestForm.destinationLocation.trim()) {
            newManifestErrors.destinationLocation = "Destination Location is required."
        }

        if (
            manifestForm.sourceLocation &&
            manifestForm.destinationLocation &&
            manifestForm.sourceLocation === manifestForm.destinationLocation
        ) {
            newManifestErrors.destinationLocation = "Source and destination cannot be the same."
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

            if (manifestItem.manifestQuantity === "") {
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
        alert("Save Draft not yet implemented.")
    }

    function handleFinalizeManifest(e) {
        e.preventDefault()

        const isValid = validateManifestForm()
        if(!isValid) return

        const finalizedAt = createAuditTimestamp()
        const finalizedBy = currentUser?.username || "unknown"

        const newManifest = {
            manifestType: manifestMode,
            status: "finalized",

            requestId: manifestForm.requestId,
            createdBy: manifestForm.createdBy,
            createdAt: manifestForm.createdAt,

            manifestDate: manifestForm.manifestDate,

            finalizedBy,
            finalizedAt,

            sourceLocation: manifestForm.sourceLocation,
            destinationLocation: manifestForm.destinationLocation,

            notes: manifestForm.notes,

            items: editableManifestItems.map((item) => {
                const inventoryItem = manifestMode === "outbound"
                    ? requestableInventoryItems.find((inventory) => inventory.id === item.inventoryItemId)
                    : manualSourceInventory.find((inventory) => String(inventory.id) === String(item.inventoryItemId))

                return {
                    id: item.id,
                    inventoryItemId: item.inventoryItemId,
                    name: inventoryItem?.name || "",
                    sku: inventoryItem?.sku || "",
                    unit: inventoryItem?.unit || "",
                    manifestQuantity: item.manifestQuantity,
                }
            }),
        }

        const createdManifest = createManifest(newManifest)

        setManifestForm((prev) => ({
            ...prev,
            finalizedBy: createdManifest.finalizedBy,
            finalizedAt: createdManifest.finalizedAt,
        }))

        alert(`Manifest ${createdManifest.id} finalized.`)
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
                    <section className="page-section manifest-header">
                        <div className="manifest-header-bar">
                            <button
                                className="text-button back-button"
                                type="button"
                                onClick={onBack}
                            >
                                ← Home
                            </button>

                            <h1 className="page-title manifest-title">Manifest Inventory</h1>
                        </div>

                        <p className="page-subtitle">
                            Build a manifest from a request, confirm available quantities, and prepare inventory for transfer.
                        </p>
                    </section>

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
        <div className="manifest-page">
            <div className="manifest-page-scroll">
                <form className="manifest-form" onSubmit={handleFinalizeManifest}>
                    <section className="page-section manifest-header">
                        <div className="manifest-header-bar">
                            <button
                                className="text-button back-button"
                                type="button"
                                onClick={onBack}
                            >
                                ← Home
                            </button>

                            <h1 className="page-title manifest-title">Manifest Inventory</h1>
                        </div>

                        <p className="page-subtitle">
                            Build a manifest from a request, confirm available quantities, and prepare inventory for transfer.
                        </p>
                    </section>

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
                                        <option value="">Select request</option>
                                        {pendingRequestOptions.map((request) => (
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
                                            ref={(el) => (manifestRefs.current.sourceLocation = el)}
                                            className="form-input read-only-input"
                                            type="text"
                                            name="sourceLocation"
                                            value={manifestForm.sourceLocation}
                                            readOnly
                                        />
                                    </label>

                                    <label className="form-group receive-form-span-2">
                                        <span className="form-label">Destination Location</span>
                                        <input 
                                            ref={(el) => (manifestRefs.current.destinationLocation = el)}
                                            className="form-input read-only-input"
                                            type="text"
                                            name="destinationLocation"
                                            value={manifestForm.destinationLocation}
                                            readOnly
                                        />
                                    </label>
                            </>
                            ) : (
                                <>
                                   <label className="form-group">
                                        <span className="form-label">Source Location</span>
                                        <select 
                                            ref={(el) => (manifestRefs.current.sourceLocation = el)}
                                            className={`form-input ${manifestErrors.sourceLocation ? "input-error" : ""}`}
                                            name="sourceLocation"
                                            value={manifestForm.sourceLocation}
                                            onChange={handleManifestChange}
                                        >
                                            <option value="">Select source location</option>
                                            {getAllowedSourceLocations(manifestMode).map((location) => (
                                                <option key={location} value={location}>
                                                    {location}
                                                </option>
                                            ))}
                                        </select>
                                        {manifestErrors.sourceLocation && (
                                            <span className="field-error">{manifestErrors.sourceLocation}</span>
                                        )}
                                    </label>

                                    <label className="form-group receive-form-span-2">
                                        <span className="form-label">Destination Location</span>
                                        <select
                                            ref={(el) => (manifestRefs.current.destinationLocation = el)}
                                            className={`form-input ${manifestErrors.destinationLocation ? "input-error" : ""}`}
                                            name="destinationLocation"
                                            value={manifestForm.destinationLocation}
                                            onChange={handleManifestChange}
                                        >
                                            <option value="">Select destination location</option>
                                            {getAllowedDestinationLocations(manifestMode)
                                                .filter((location) => location !== manifestForm.sourceLocation)
                                                .map((location) => (
                                                    <option key={location} value={location}>
                                                        {location}
                                                    </option>
                                                ))}
                                        </select>
                                        {manifestErrors.destinationLocation && (
                                            <span className="field-error">{manifestErrors.destinationLocation}</span>
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
                                Select a pending request to load requested items and confirm manifest quantities.
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
                                        disabled={!manifestForm.sourceLocation}
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
    )
}

export default ManifestInventoryPage