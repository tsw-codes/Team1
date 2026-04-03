import { useMemo, useRef, useState } from "react"
import { createAuditTimestamp } from "../utils/dateUtils"
import { createRequest } from "../services/requestService"
import { 
    getWarehouseOptions, 
    getRequestableInventoryForWarehouse,
} from "../services/inventoryService"
import { getLocationOptions, getProjectOptionsForLocation, getProjectByValue,} from "../services/projectService"

function createEmptyRequestItem() {
    return {
        id: Date.now() + Math.random(),
        inventoryItemId: "",
        requestedQuantity: "",
        source: "manual",
    }
}

function RequestMaterialPage({ onBack, currentUser }) {
    const itemRefs = useRef({})
    const requestRefs = useRef({})
    const itemFieldRefs = useRef({})
    const requestScrollRef = useRef(null)

    const [formError, setFormError] = useState("")
    const [requestErrors, setRequestErrors] = useState({})
    const [itemErrors, setItemErrors] = useState({})

    const [requestForm, setRequestForm] = useState({
        requestedBy: currentUser?.username || "",
        createdAt: createAuditTimestamp(),
        location: "",
        project: "",
        neededByDate: "",
        priority: "",
        sourceWarehouse: "",
        deliveryLocation: "",
        notes: "",
    })

    const [requestedItems, setRequestedItems] = useState([])

    const warehouseOptions = useMemo(() => {
        return getWarehouseOptions()
    }, [])

    const locationOptions = useMemo(() => {
        return getLocationOptions()
    }, [])

    const projectOptions = useMemo(() => {
        return getProjectOptionsForLocation(requestForm.location)
    }, [requestForm.location])

    function handleRequestChange(e) {
        const { name, value } = e.target

        setRequestForm((prev) => {
            const next = {
                ...prev,
                [name]: value,
            }

            if (name === "location") {
                next.project = ""
                next.deliveryLocation = value
            }
            return next
        })

        if (name === "sourceWarehouse") {
            setRequestedItems((prev) =>
                prev.map((item) => ({
                    ...item,
                    inventoryItemId: "",
                    requestedQuantity: "",
                }))
            )

            setItemErrors({})
            setFormError("")
        }

        setRequestErrors((prev) => {
            if (!prev[name]) return prev
            const next = { ...prev }
            delete next[name]
            return next
        })

        if (name === "location") {
            setRequestErrors((prev) => {
                const next = { ...prev }
                delete next.project
                delete next.deliveryLocation
                return next
            })
        }

        if (formError) {
            setFormError("")
        }
    }

    function handleItemChange(id, field, value) {
        setRequestedItems((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item

                if (field === "inventoryItemId") {
                    const isDuplicate = prev.some(
                        (requestItem) => requestItem.id !== id && String(requestItem.inventoryItemId) === String(value)
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

    function handleAddItem() {
        const newItem = createEmptyRequestItem()

        setRequestedItems((prev) => [ ...prev, newItem ])

        setTimeout(() => {
            const container = requestScrollRef.current
            const target = itemRefs.current[newItem.id]

            if (!container || !target) return

            const containerRect = container.getBoundingClientRect()
            const targetRect = target.getBoundingClientRect()

            const offsetTop = targetRect.top - containerRect.top + container.scrollTop

            container.scrollTo({
                top: offsetTop,
                behavior: "smooth",
            })
        }, 0);
    }

    function handleRemoveItem(id) {
        setRequestedItems((prev) => prev.filter((item) => item.id !== id))

        setItemErrors((prev) => {
            if (!prev[id]) return prev
            const next = { ...prev }
            delete next[id]
            return next
        })

        delete itemRefs.current[id]
        delete itemFieldRefs.current[id]
    }

    function validateRequestForm() {
        const newRequestErrors = {}
        const newItemErrors = {}

        if (!requestForm.location.trim()) {
            newRequestErrors.location = "Location is required."
        }

        if (!requestForm.project.trim()) {
            newRequestErrors.project = "Project is required."
        }

        if (!requestForm.neededByDate.trim()) {
            newRequestErrors.neededByDate = "Needed by date is required."
        }

        if (!requestForm.priority.trim()) {
            newRequestErrors.priority = "Priority is required."
        }

        if (!requestForm.sourceWarehouse.trim()) {
            newRequestErrors.sourceWarehouse = "Source warehouse is required."
        }

        if (!requestForm.deliveryLocation.trim()) {
            newRequestErrors.deliveryLocation = "Delivery location is required."
        }

        if (requestedItems.length === 0) {
            setFormError("At least one requested item is required.")
            setRequestErrors(newRequestErrors)
            setItemErrors({})
            return false
        }

        requestedItems.forEach((item) => {
            const errors = {}
            const selectedInventory = getRequestableInventoryForWarehouse(
                requestForm.sourceWarehouse
            ).find(
                (inventoryItem) => String(inventoryItem.id) === String(item.inventoryItemId)
            ) || null

            if (!item.inventoryItemId.trim()) {
                errors.inventoryItemId = "Material selection is required."
            }

            if (item.inventoryItemId) {
                const duplicateCount = requestedItems.filter(
                    (requestItem) => String(requestItem.inventoryItemId) === String(item.inventoryItemId)
                ).length

                if (duplicateCount > 1) {
                    errors.inventoryItemId = "This inventory item has already been selected."
                }
            }

            if (!item.requestedQuantity || Number(item.requestedQuantity) <= 0) {
                errors.requestedQuantity = "Requested quantity must be greater than 0."
            }

            if (
                selectedInventory &&
                Number(item.requestedQuantity) > Number(selectedInventory.quantity)
            ) {
                errors.requestedQuantity = "Requested quantity exceeds available inventory."
            }

            if (Object.keys(errors).length > 0) {
                newItemErrors[item.id] = errors
            }
        })

        setRequestErrors(newRequestErrors)
        setItemErrors(newItemErrors)

        const hasRequestErrors = Object.keys(newRequestErrors).length > 0
        const hasItemErrors = Object.keys(newItemErrors).length > 0

        if (hasRequestErrors || hasItemErrors) {
            setFormError("")
            setTimeout(() => {
                scrollToFirstError(newRequestErrors, newItemErrors)
            }, 0);
            return false
        }

        setFormError("")
        return true
    }

    function handleSaveDraft() {
        alert("Save Draft not yet implemented.")
    }

    function handleSubmitRequest(e) {
        e.preventDefault()

        const isValid = validateRequestForm()
        if (!isValid) return

        const selectedProject = getProjectByValue(requestForm.project)

        const newRequest = {
            requestedBy: requestForm.requestedBy,
            createdAt: requestForm.createdAt,
            status: "Pending",

            project: selectedProject?.label || requestForm.project,
            neededByDate: requestForm.neededByDate,
            priority: requestForm.priority,
            deliveryLocation: requestForm.deliveryLocation,
            notes: requestForm.notes,

            items: requestedItems.map((item, index) => ({
                id: index + 1,
                inventoryItemId: Number(item.inventoryItemId),
                requestedQuantity: Number(item.requestedQuantity),
            })),
        }

        const createdRequest = createRequest(newRequest)

        alert(`Request ${createdRequest.id} created.`)
    }

    function scrollToFirstError(newRequestErrors, newItemErrors) {
        if (newRequestErrors.location) {
            requestRefs.current.location?.scrollIntoView({ behavior: "smooth", block: "center"})
            requestRefs.current.location?.focus?.()
            return
        }
        
        if (newRequestErrors.project) {
            requestRefs.current.project?.scrollIntoView({ behavior: "smooth", block: "center"})
            requestRefs.current.project?.focus?.()
            return
        }

        if (newRequestErrors.neededByDate) {
            requestRefs.current.neededByDate?.scrollIntoView({ behavior: "smooth", block: "center"})
            requestRefs.current.neededByDate?.focus?.()
            return
        }

        if (newRequestErrors.priority) {
            requestRefs.current.priority?.scrollIntoView({ behavior: "smooth", block: "center"})
            requestRefs.current.priority?.focus?.()
            return
        }

        if (newRequestErrors.sourceWarehouse) {
            requestRefs.current.sourceWarehouse?.scrollIntoView({ behavior: "smooth", block: "center"})
            requestRefs.current.sourceWarehouse?.focus?.()
            return
        }

        if (newRequestErrors.deliveryLocation) {
            requestRefs.current.deliveryLocation?.scrollIntoView({ behavior: "smooth", block: "center"})
            requestRefs.current.deliveryLocation?.focus?.()
            return
        }

        const firstItemId = Object.keys(newItemErrors)[0]
        if (!firstItemId) return

        const firstItemErrors = newItemErrors[firstItemId]
        const order = ["inventoryItemId", "requestedQuantity"]

        for (const field of order) {
            if (firstItemErrors[field]) {
                itemFieldRefs.current[firstItemId]?.[field]?.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                })
                itemFieldRefs.current[firstItemId]?.[field]?.focus?.()
                return
            }
        }
    }

    return (
        <div className="request-page">
            <div className="request-page-scroll" ref={requestScrollRef}>
                <form className="request-form" onSubmit={handleSubmitRequest}>
                    <section className="page-section request-header">
                        <div className="request-header-bar">
                            <button
                                className="text-button back-button"
                                type="button"
                                onClick={onBack}
                            >
                                ← Home
                            </button>

                            <h1 className="page-title request-title">Request Material</h1>
                        </div>

                        <p className="page-subtitle">
                            Request warehouse inventory for project use and future manifest fulfillment.
                        </p>
                    </section>

                    <section className="page-section request-form-section">
                        <div className="section-heading-row">
                            <h2 className="section-title">Request Information</h2>
                        </div>

                        <div className="receive-form-grid">
                            <label className="form-group">
                                <span className="form-label">Requested By</span>
                                <input 
                                    className="form-input read-only-input"
                                    type="text"
                                    name="requestedBy"
                                    value={requestForm.requestedBy}
                                    readOnly
                                />
                            </label>

                            <label className="form-group">
                                <span className="form-label">Location</span>
                                <select
                                    ref={(el) => (requestRefs.current.location) = el}
                                    className={`form-input ${requestErrors.location ? "input-error": ""}`}
                                    name="location"
                                    value={requestForm.location}
                                    onChange={handleRequestChange}
                                >
                                    <option value="">Select location</option>
                                    {locationOptions.map((location) => (
                                        <option key={location.value} value={location.value}>
                                            {location.label}
                                        </option>
                                    ))}
                                </select>
                                {requestErrors.project && (
                                    <span className="field-error">{requestErrors.location}</span>
                                )}
                            </label>

                            <label className="form-group">
                                <span className="form-label">Project</span>
                                <select
                                    ref={(el) => (requestRefs.current.project) = el}
                                    className={`form-input ${requestErrors.project ? "input-error": ""}`}
                                    name="project"
                                    value={requestForm.project}
                                    onChange={handleRequestChange}
                                    disabled={!requestForm.location}
                                >
                                    <option value="">
                                        {requestForm.location ? "Select project" : "Select location first"}
                                    </option>
                                    {projectOptions.map((project) => (
                                        <option key={project.value} value={project.value}>
                                            {project.label}
                                        </option>
                                    ))}
                                </select>
                                {requestErrors.project && (
                                    <span className="field-error">{requestErrors.project}</span>
                                )}
                            </label>

                            <label className="form-group">
                                <span className="form-label">Needed By Date</span>
                                <input 
                                    ref={(el) => (requestRefs.current.neededByDate) = el}
                                    className={`form-input ${requestErrors.neededByDate ? "input-error": ""}`}
                                    type="date"
                                    name="neededByDate"
                                    value={requestForm.neededByDate}
                                    onChange={handleRequestChange}
                                />
                                {requestErrors.neededByDate && (
                                    <span className="field-error">{requestErrors.neededByDate}</span>
                                )}
                            </label>

                            <label className="form-group">
                                <span className="form-label">Priority</span>
                                <select 
                                    ref={(el) => (requestRefs.current.priority) = el}
                                    className={`form-input ${requestErrors.priority ? "input-error": ""}`}
                                    name="priority"
                                    value={requestForm.priority}
                                    onChange={handleRequestChange}   
                                >
                                    <option value="">Select Priority</option>
                                    <option value="Low">Low</option>
                                    <option value="Normal">Normal</option>
                                    <option value="High">High</option>
                                    <option value="Urgent">Urgent</option>
                                </select>
                                {requestErrors.priority && (
                                    <span className="field-error">{requestErrors.priority}</span>
                                )}
                            </label>

                            <label className="form-group">
                                <span className="form-label">Source Warehouse</span>
                                <select 
                                    ref={(el) => (requestRefs.current.sourceWarehouse) = el}
                                    className={`form-input ${requestErrors.sourceWarehouse ? "input-error": ""}`}
                                    name="sourceWarehouse"
                                    value={requestForm.sourceWarehouse}
                                    onChange={handleRequestChange}   
                                >
                                    <option value="">Select Warehouse</option>
                                    {warehouseOptions.map((warehouse) => (
                                        <option key={warehouse} value={warehouse}>
                                            {warehouse}
                                        </option>
                                    ))}
                                </select>
                                {requestErrors.sourceWarehouse && (
                                    <span className="field-error">{requestErrors.sourceWarehouse}</span>
                                )}
                            </label>

                            <label className="form-group">
                                <span className="form-label">Requested Delivery Location</span>
                                <input 
                                    ref={(el) => (requestRefs.current.deliveryLocation) = el}
                                    className={`form-input read-only-input ${requestErrors.deliveryLocation ? "input-error": ""}`}
                                    type="text"
                                    name="deliveryLocation"
                                    value={requestForm.deliveryLocation}
                                    readOnly
                                />
                                {requestErrors.deliveryLocation && (
                                    <span className="field-error">{requestErrors.deliveryLocation}</span>
                                )}
                            </label>
                        </div>
                    </section>

                    <section className="page-section request-form-section">
                        <div className="section-heading-row">
                            <h2 className="section-title">Requested Items</h2>
                        </div>

                        <div className="received-items-list">
                            {requestedItems.map((item, index) => {
                                const inventoryOptions = getRequestableInventoryForWarehouse(requestForm.sourceWarehouse)
                                const selectedInventory = inventoryOptions.find(
                                    (inventoryItem) => String(inventoryItem.id) === String(item.inventoryItemId)
                                ) || null

                                const selectedInventoryIds = requestedItems
                                    .filter((requestItem) => requestItem.id !== item.id && requestItem.inventoryItemId)
                                    .map((requestItem) => String(requestItem.inventoryItemId))

                                return (
                                    <div
                                        className="received-item-card"
                                        key={item.id}
                                        ref={(el) => (itemRefs.current[item.id] = el)}
                                    >
                                        <div className="section-heading-row">
                                            <h3 className="received-item-title">Item {index + 1}</h3>
                                            {requestedItems.length > 1 && (
                                                <button
                                                    className="text-button"
                                                    type="button"
                                                    onClick={() => handleRemoveItem(item.id)}
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>

                                        <div className="receive-form-grid">
                                            <label className="form-group receive-form-span-2">
                                                <span className="form-label">Material</span>
                                                <select
                                                    ref={(el) => {
                                                        if (!itemFieldRefs.current[item.id]) {
                                                            itemFieldRefs.current[item.id] = {}
                                                        }
                                                        itemFieldRefs.current[item.id].inventoryItemId = el
                                                    }}
                                                    className={`form-input ${itemErrors[item.id]?.inventoryItemId ? "input-error" : ""}`}
                                                    value={item.inventoryItemId}
                                                    onChange={(e) =>
                                                        handleItemChange(item.id, "inventoryItemId", e.target.value)
                                                    }
                                                    disabled={!requestForm.sourceWarehouse}
                                                >
                                                    <option value="">
                                                        {requestForm.sourceWarehouse ? "Select Material" : "Select warehouse first"}
                                                    </option>
                                                    {inventoryOptions
                                                        .filter((inventoryItem) => !selectedInventoryIds.includes(String(inventoryItem.id)))
                                                        .map((inventoryItem) => (
                                                            <option key={inventoryItem.id} value={inventoryItem.id}>
                                                                {inventoryItem.name} ({inventoryItem.sku})
                                                            </option>
                                                        ))
                                                    }
                                                </select>
                                                {itemErrors[item.id]?.inventoryItemId && (
                                                    <span className="field-error">
                                                        {itemErrors[item.id].inventoryItemId}
                                                    </span>
                                                )}
                                            </label>

                                            <label className="form-group">
                                                <span className="form-label">SKU</span>
                                                <input 
                                                    className="form-input read-only-input"
                                                    type="text"
                                                    value={selectedInventory?.sku || ""}
                                                    readOnly
                                                />
                                            </label>

                                            <label className="form-group">
                                                <span className="form-label">Unit</span>
                                                <input 
                                                    className="form-input read-only-input"
                                                    type="text"
                                                    value={selectedInventory?.unit || ""}
                                                    readOnly
                                                />
                                            </label>

                                            <label className="form-group">
                                                <span className="form-label">Available Quantity</span>
                                                <input 
                                                    className="form-input read-only-input"
                                                    type="text"
                                                    value={selectedInventory?.quantity ?? ""}
                                                    readOnly
                                                />
                                            </label>

                                            <label className="form-group">
                                                <span className="form-label">Requested Quantity</span>
                                                <input 
                                                    ref={(el) => {
                                                        if (!itemFieldRefs.current[item.id]) {
                                                            itemFieldRefs.current[item.id] = {}
                                                        }
                                                        itemFieldRefs.current[item.id].requestedQuantity = el
                                                    }}
                                                    className={`form-input ${itemErrors[item.id]?.requestedQuantity ? "input-error" : ""}`}
                                                    type="number"
                                                    value={item.requestedQuantity}
                                                    onChange={(e) =>
                                                        handleItemChange(item.id, "requestedQuantity", e.target.value)
                                                    }
                                                    placeholder="0"
                                                />
                                                {itemErrors[item.id]?.requestedQuantity && (
                                                    <span className="field-error">
                                                        {itemErrors[item.id].requestedQuantity}
                                                    </span>
                                                )}
                                            </label>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="receive-add-item">
                            {requestedItems.length === 0 && (
                                <div className="empty-state-message">
                                    No items added yet. Select a source warehouse, then click Add Item.
                                </div>
                            )}
                            <button
                                className="secondary-button"
                                type="button"
                                onClick={handleAddItem}
                                disabled={!requestForm.sourceWarehouse}
                            >
                                + Add Item
                            </button>
                        </div>
                    </section>

                    <section className="page-section request-form-section">
                        <div className="section-heading-row">
                            <h2 className="section-title">Notes</h2>
                        </div>

                        <label className="form-group">
                            <span className="form-label">Request Notes</span>
                            <textarea 
                                className="form-textarea"
                                name="notes"
                                value={requestForm.notes}
                                onChange={handleRequestChange}
                                placeholder="Add notes about urgency, substitutions, delivery timing, or staging instructions."
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
                            Submit Request
                        </button>
                    </section>
                </form>
            </div>
        </div>
    )
}

export default RequestMaterialPage