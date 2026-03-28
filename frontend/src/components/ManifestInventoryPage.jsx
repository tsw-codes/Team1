import { useMemo, useRef, useState } from "react"
import { requestableInventory } from "../data/mockInventory"
import { pendingRequests, getRequestById } from "../data/mockRequests"

function buildManifestItemsFromRequest(request) {
    if (!request) return []

    return request.items.map((requestItem) => {
        const inventoryItem = requestableInventory.find(
            (item) => item.id === requestItem.inventoryItemId
        )

        return {
            id: `${request.id}-${requestItem.id}`,
            inventoryItemId: requestItem.inventoryItemId,
            manifestQuantity: Math.min(requestItem.requestedQuantity, inventoryItem?.quantity ?? 0).toString(),
        }
    })
}

function ManifestInventoryPage({ onBack, currentUser }) {
    const lineRefs = useRef({})

    const [formError, setFormError] = useState("")
    const [manifestErrors, setManifestErrors] = useState({})
    const [itemErrors, setItemErrors] = useState({})

    const [manifestForm, setManifestForm] = useState({
        createdBy: currentUser?.username || "",
        requestId: "",
        manifestDate: "",
        sourceLocation: "",
        destinationLocation: "",
        notes: "",
    })

    const [editableManifestItems, setEditableManifestItems] = useState([])

    const selectedRequest = useMemo(() => {
        return getRequestById(manifestForm.requestId)
    }, [manifestForm.requestId])

    function handleManifestChange(e) {
        const { name, value } = e.target

        setManifestForm((prev) => {
            const next = {
                ...prev,
                [name]: value,
            }

            if (name === "requestId") {
                const request = getRequestById(value)

                next.sourceLocation = request ? "Warehouse Stock" : ""
                next.destinationLocation = request?.deliveryLocation || ""
                next.notes = request?.notes

                setEditableManifestItems(buildManifestItemsFromRequest(request))
                setItemErrors({})
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

    function handleManifestItemChange(id, value) {
        setEditableManifestItems((prev) =>
            prev.map((item) =>
                item.id === id ? { ...item, manifestQuantity: value} : item
            )
        )

        setItemErrors((prev) => {
            if (!prev[id]?.manifestQuantity) return prev

            const next = { ...prev }
            next[id] = { ...next[id] }
            delete next[id].manifestQuantity

            if (Object.keys(next[id]).length === 0) {
                delete next[id]
            }
            
            return next
        })

        if (formError) {
            setFormError("")
        }
    }

    function scrollToFirstError(newManifestErrors, newItemErrors) {
        if (newManifestErrors.requestId) {
            document.getElementById("manifest-requestId")?.scrollIntoView({
                behavior: "smooth",
                block: "center",
            })
            return
        }

        if (newManifestErrors.manifestDate) {
            document.getElementById("manifest-manifestDate")?.scrollIntoView({
                behavior: "smooth",
                block: "center",
            })
            return
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

        if (!manifestForm.requestId.trim()) {
            newManifestErrors.requestId = "Request selection is required."
        }

        if (!manifestForm.manifestDate.trim()) {
            newManifestErrors.manifestDate = "Manifest date is required."
        }

        if (!selectedRequest) {
            setManifestErrors(newManifestErrors)
            setItemErrors({})
            setFormError("A valid request is required to build a manifest.")
            return false
        }

        if (editableManifestItems.length === 0) {
            setManifestErrors(newManifestErrors)
            setItemErrors({})
            setFormError("This request has no items available to manifest.")
            return false
        }

        let hasAtLeastOneManifestedItem = false

        editableManifestItems.forEach((manifestItem) => {
            const errors = {}
            const inventoryItem = requestableInventory.find(
                (item) => item.id === manifestItem.inventoryItemId
            )

            const requestedItem = selectedRequest.items.find(
                (item) => item.inventoryItemId === manifestItem.inventoryItemId
            )

            const manifestQty = Number(manifestItem.manifestQuantity || 0)
            const availableQty = Number(inventoryItem?.quantity || 0)
            const requestedQty = Number(requestedItem?.requestedQuantity || 0)

            if (manifestItem.manifestQuantity === "") {
                errors.manifestQuantity = "Manifest quantity is required."
            } else if (manifestQty < 0) {
                errors.manifestQuantity = "Manifest quantity cannot be negative."
            } else if (manifestQty > availableQty) {
                errors.manifestQuantity = "Manifest quantity exceeds available inventory."
            } else if (manifestQty > requestedQty) {
                errors.manifestQuantity = "Manifest quantity cannot exceed requested quantity."
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

        alert("Finalize Manifest not yet implemented.")
    }

    function getRequestedQuantity(inventoryItemId) {
        return (
            selectedRequest?.items.find((item) => item.inventoryItemId === inventoryItemId)?.requestedQuantity ?? 0
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

                            <label className="form-group">
                                <span className="form-label">Request</span>
                                <select
                                    id="manifest-requestId"
                                    className={`form-input ${manifestErrors.requestId ? "input-error": ""}`}
                                    name="requestId"
                                    value={manifestForm.requestId}
                                    onChange={handleManifestChange}
                                >
                                    <option value="">Select request</option>
                                    {pendingRequests.map((request) => (
                                        <option key={request.id} value={request.id}>
                                            {request.id} - {request.project} ({request.priority})
                                        </option>
                                    ))}
                                </select>
                                {manifestErrors.requestId && (
                                    <span className="field-error">{manifestErrors.requestId}</span>
                                )}
                            </label>

                            <label className="form-group">
                                <span className="form-label">Manifest Date</span>
                                <input
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
                                <span className="form-label">Source Location</span>
                                <input 
                                    className="form-input read-only-input"
                                    type="text"
                                    name="sourceLocation"
                                    value={manifestForm.sourceLocation}
                                    readOnly
                                />
                            </label>

                            <label className="form-group">
                                <span className="form-label">Destination Location</span>
                                <input 
                                    className="form-input read-only-input"
                                    type="text"
                                    name="destinationLocation"
                                    value={manifestForm.destinationLocation}
                                    readOnly
                                />
                            </label>
                        </div>
                    </section>

                    <section className="page-section manifest-form-section">
                        <div className="section-heading-row">
                            <h2 className="section-title">Manifest Items</h2>
                        </div>

                        {selectedRequest ? (
                            <div className="received-items-list">
                                {editableManifestItems.map((manifestItem, index) => {
                                    const inventoryItem = requestableInventory.find(
                                        (item) => item.id === manifestItem.inventoryItemId
                                    )

                                    const requestedQuantity = getRequestedQuantity(manifestItem.inventoryItemId)
                                    const availableQuantity = Number(inventoryItem?.quantity || 0)
                                    const isOutOfStock = availableQuantity === 0
                                    const isPartial = availableQuantity > 0 && availableQuantity < requestedQuantity

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
                                                        value={inventoryItem?.quantity ?? ""}
                                                        readOnly
                                                    />
                                                </label>

                                                <label className="form-group receive-form-span-2">
                                                    <span className="form-label">Manifest Quantity</span>
                                                    <input 
                                                        className={`form-input ${itemErrors[manifestItem.id]?.manifestQuantity ? "input-error" : ""}`}
                                                        type="number"
                                                        value={manifestItem.manifestQuantity}
                                                        onChange={(e) => handleManifestItemChange(manifestItem.id, e.target.value)}
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