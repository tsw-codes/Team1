import { useRef, useState } from "react"

function ReceiveInventoryPage({ onBack, currentUser }) {
    const fileInputRef = useRef(null)
    const itemRefs = useRef({})
    const deliveryRefs = useRef({})
    const itemFieldRefs = useRef({})

    const [scanPreview, setScanPreview] = useState(null)

    const [formError, setFormError] = useState("")
    const [itemErrors, setItemErrors] = useState({})
    const [deliveryErrors, setDeliveryErrors] = useState({})

    const [deliveryForm, setDeliveryForm] = useState({
        vendor: "",
        poNumber: "",
        deliveryDate: "",
        receivedBy: currentUser?.username || "",
        project: "",
        notes: "",
    })

    const [receivedItems, setReceivedItems] = useState([
        {
        id: 1,
        materialName: "",
        sku: "",
        quantity: "",
        unit: "",
        condition: "",
        location: "",
        source: "manual",
        },
    ])

    function handleScanClick() {
        fileInputRef.current?.click()
    }

    function handleDocumentSelect(e) {
        const file = e.target.files?.[0]
        if (!file) return

        const previewUrl = URL.createObjectURL(file)

        setScanPreview({
            filename: file.name,
            previewUrl,
        })
    }

    function handleSaveDraft() {
        alert("Save Draft not yet implemented.")
    }

    function handleConfirmReceipt(e) {
        e.preventDefault()

        const isValid = validateReceiveForm()
        if (!isValid) return
        alert("Confirm Receipt not yet implemented.")
    }

    function handleDeliveryChange(e) {
        const { name, value } = e.target

        setDeliveryForm((prev) => ({
            ...prev,
            [name]: value,
        }))

        setDeliveryErrors((prev) => {
            if (!prev[name]) return prev
            const next = { ...prev }
            delete next[name]
            return next
        })

        if (formError) {
            setFormError("")
        }
    }

    function handleItemChange(id, field, value) {
        setReceivedItems((prev) =>
            prev.map((item) => 
                item.id === id ? { ...item, [field]: value } : item
            )
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
        const newItem = {
            id: Date.now(),
                materialName: "",
                sku: "",
                quantity: "",
                unit: "", 
                condition: "",
                location: "",
                source: "manual",
        }

        setReceivedItems ((prev) => [...prev, newItem])

        setTimeout(() => {
            itemRefs.current[newItem.id]?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            })
        }, 0)
    }

    function handleRemoveItem(id) {
        setReceivedItems((prev) => {
            if (prev.length === 1) return prev
            return prev.filter((item) => item.id !== id)
        })
    }

    function validateReceiveForm() {
        const newDeliveryErrors = {}
        const newItemErrors = {}

        if (!deliveryForm.vendor.trim()) {
            newDeliveryErrors.vendor = "Vendor is required."
        }

        if (!deliveryForm.poNumber.trim()) {
            newDeliveryErrors.poNumber = "PO Number is required."
        }

        if (!deliveryForm.deliveryDate.trim()) {
            newDeliveryErrors.deliveryDate = "Delivery Date is required."
        }

        if (!deliveryForm.project.trim()) {
            newDeliveryErrors.project = "Project is required."
        }

        if (receivedItems.length === 0) {
            setFormError("At least one received item is required.")
            setDeliveryErrors(newDeliveryErrors)
            setItemErrors({})
            return false
        }

        receivedItems.forEach((item) => {
            const errors = {}

            if (!item.materialName.trim()) {
                errors.materialName = "Material name is required."
            }

            if (!item.quantity || item.quantity <= 0) {
                errors.quantity = "Quantity must be greater than 0."
            }

            if (!item.unit.trim()) {
                errors.unit = "Unit is required."
            }

            if (!item.condition.trim()) {
                errors.condition = "Condition is required."
            }

            if (!item.location.trim()) {
                errors.location = "Assigned location is required."
            }

            if (!item.sku.trim()) {
                errors.sku = "SKU is required."
            }

            if (Object.keys(errors).length > 0) {
                newItemErrors[item.id] = errors
            }
        })

        setDeliveryErrors(newDeliveryErrors)
        setItemErrors(newItemErrors)

        const hasDeliveryErrors = Object.keys(newDeliveryErrors).length > 0
        const hasItemErrors = Object.keys(newItemErrors).length > 0

        if (hasDeliveryErrors || hasItemErrors) {
            setFormError("")
            scrollToFirstError(newDeliveryErrors, newItemErrors)
            return false
        }

        setFormError("")
        return true
    }

    function scrollToFirstError(newDeliveryErrors, newItemErrors) {
        if (newDeliveryErrors.vendor) {
            deliveryRefs.current.vendor?.scrollIntoView({ behavior: "smooth", block: "center"})
            deliveryRefs.current.vendor?.focus?.()
            return
        }

        if (newDeliveryErrors.poNumber) {
            deliveryRefs.current.poNumber?.scrollIntoView({ behavior: "smooth", block: "center"})
            deliveryRefs.current.poNumber?.focus?.()
            return
        }

        if (newDeliveryErrors.deliveryDate) {
            deliveryRefs.current.deliveryDate?.scrollIntoView({ behavior: "smooth", block: "center"})
            deliveryRefs.current.vendor?.deliveryDate?.()
            return
        }

        if (newDeliveryErrors.project) {
            deliveryRefs.current.project?.scrollIntoView({ behavior: "smooth", block: "center"})
            deliveryRefs.current.project?.focus?.()
            return
        }

        const firstItemId = Object.keys(newItemErrors)[0]
        if (!firstItemId) return

        const itemErrorsForFirst = newItemErrors[firstItemId]

        const fieldsOrder = [
            "materialName",
            "sku",
            "quantity",
            "unit",
            "condition",
            "location",
        ]

        for (const field of fieldsOrder) {
            if (itemErrorsForFirst[field]) {
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
        <div className="receive-page">
            <div className="receive-page-scroll">
                <form className="receive-form" onSubmit={handleConfirmReceipt}>
                    <section className="page-section receive-header">
                        <div className="receive-header-bar">
                            <button
                                className="text-button back-button"
                                type="button"
                                onClick={onBack}
                            >
                                ← Home
                            </button>

                            <h1 className="page-title receive-title">Receive Inventory</h1>
                        </div>

                        <p className="page-subtitle">
                            Log incoming materials, assign locations, and document deliveries.
                        </p>
                    </section>

                    <section className="page-section receive-scan-section">
                        <div className="section-heading-row">
                            <h2 className="section-title">Document Scan</h2>
                        </div>

                        <p className="section-subtext">
                            Capture or upload a packing slip or receipt to support future OCR-assisted entries.
                        </p>

                        <div className="receive-scan-actions">
                            <button
                                className="secondary-button"
                                type="button"
                                onClick={handleScanClick}
                            >
                                Scan Document
                            </button>

                            <input 
                                ref={fileInputRef}
                                className="hidden-file-input"
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handleDocumentSelect}
                            />
                        </div>

                        <p className="feature-note">
                            Feature not yet implemented.  Scanned values will eventually be reviewable and editable before submission.
                        </p>

                        {scanPreview && (
                            <div className="scan-preview-card">
                                <p className="scan-preview-name">{scanPreview.filename}</p>
                                <img 
                                    src={scanPreview.previewUrl}
                                    alt="Scanned document preview"
                                    className="scan-preview-image"
                                />
                                <p className="scan-preview-note">
                                    Document captured successfully.  OCR auto-fill is not yet implemented.
                                </p>
                            </div>
                        )}
                    </section>

                    <section className="page-section receive-form-section">
                        <div className="section-heading-row">
                            <h2 className="section-title">Delivery Information</h2>
                        </div>

                        <div className="receive-form-grid">
                            <label className="form-group">
                                <span className="form-label">Vendor</span>
                                <input 
                                    ref={(el) => (deliveryRefs.current.vendor = el)}
                                    className={`form-input ${deliveryErrors.vendor ? "input-error" : ""}`}
                                    type="text"
                                    name="vendor"
                                    value={deliveryForm.vendor}
                                    onChange={handleDeliveryChange}
                                    placeholder="Enter vendor name"
                                />
                                {deliveryErrors.vendor && (
                                    <span className="field-error">{deliveryErrors.vendor}</span>
                                )}
                            </label>

                            <label className="form-group">
                                <span className="form-label">PO Number</span>
                                <input 
                                    ref={(el) => (deliveryRefs.current.materialName = el)}
                                    className={`form-input ${deliveryErrors.poNumber ? "input-error" : ""}`}
                                    type="text"
                                    name="poNumber"
                                    value={deliveryForm.poNumber}
                                    onChange={handleDeliveryChange}
                                    placeholder="Enter PO number"
                                />
                                {deliveryErrors.poNumber && (
                                    <span className="field-error">{deliveryErrors.poNumber}</span>
                                )}
                            </label>

                            <label className="form-group">
                                <span className="form-label">Delivery Date</span>
                                <input 
                                    ref={(el) => (deliveryRefs.current.deliveryDate = el)}
                                    className={`form-input ${deliveryErrors.deliveryDate ? "input-error" : ""}`}
                                    type="date"
                                    name="deliveryDate"
                                    value={deliveryForm.deliveryDate}
                                    onChange={handleDeliveryChange}
                                />
                                {deliveryErrors.deliveryDate && (
                                    <span className="field-error">{deliveryErrors.deliveryDate}</span>
                                )}
                            </label>

                            <label className="form-group">
                                <span className="form-label">Received By</span>
                                <input 
                                    className="form-input read-only-input"
                                    type="text"
                                    name="receivedBy"
                                    value={deliveryForm.receivedBy}
                                    readOnly
                                />
                            </label>

                            <label className="form-group receive-form-span-2">
                                <span className="form-label">Project</span>
                                <input 
                                    ref={(el) => (deliveryRefs.current.project = el)}
                                    className={`form-input ${deliveryErrors.project ? "input-error" : ""}`}
                                    type="text"
                                    name="project"
                                    value={deliveryForm.project}
                                    onChange={handleDeliveryChange}
                                    placeholder="Enter project name"
                                />
                                {deliveryErrors.project && (
                                    <span className="field-error">{deliveryErrors.project}</span>
                                )}
                            </label>
                        </div>
                    </section> 

                    <section className="page-section receive-form-section">
                        <div className="section-heading-row">
                            <h2 className="section-title">Received Material</h2>
                        </div>

                        <div className="received-items-list">
                            {receivedItems.map((item, index) => (
                                <div className="received-item-card"
                                    key={item.id}
                                    ref={(el) => (itemRefs.current[item.id] = el)}
                                >
                                    <div className="section-heading-row">
                                        <h3 className="received-item-title">Item {index + 1}</h3>
                                        {receivedItems.length > 1 && (
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
                                            <span className="form-label">Material Name</span>
                                            <input 
                                                ref={(el) => {
                                                    if (!itemFieldRefs.current[item.id]) {
                                                    itemFieldRefs.current[item.id] = {}
                                                    }
                                                    itemFieldRefs.current[item.id].materialName = el
                                                }}
                                                className={`form-input ${itemErrors[item.id]?.materialName ? "input-error" : ""}`}
                                                type="text"
                                                name="materialName"
                                                value={item.materialName}
                                                onChange={(e) =>
                                                    handleItemChange(item.id, "materialName", e.target.value)
                                                }
                                                placeholder="Enter material name"
                                            />
                                            {itemErrors[item.id]?.materialName && (
                                                <span className="field-error">{itemErrors[item.id].materialName}</span>
                                            )}
                                        </label>

                                        <label className="form-group">
                                            <span className="form-label">SKU</span>
                                            <input 
                                                ref={(el) => {
                                                    if (!itemFieldRefs.current[item.id]) {
                                                    itemFieldRefs.current[item.id] = {}
                                                    }
                                                    itemFieldRefs.current[item.id].sku = el
                                                }}
                                                className={`form-input ${itemErrors[item.id]?.sku ? "input-error" : ""}`}
                                                type="text"
                                                name="sku"
                                                value={item.sku}
                                                onChange={(e) =>
                                                    handleItemChange(item.id, "sku", e.target.value)
                                                }
                                                placeholder="Enter SKU"
                                            />
                                            {itemErrors[item.id]?.sku && (
                                                <span className="field-error">{itemErrors[item.id].sku}</span>
                                            )}
                                        </label>

                                        <label className="form-group">
                                            <span className="form-label">Quantity</span>
                                            <input 
                                                ref={(el) => {
                                                    if (!itemFieldRefs.current[item.id]) {
                                                    itemFieldRefs.current[item.id] = {}
                                                    }
                                                    itemFieldRefs.current[item.id].quantity = el
                                                }}
                                                className={`form-input ${itemErrors[item.id]?.quantity ? "input-error" : ""}`}
                                                type="text"
                                                name="quantity"
                                                value={item.quantity}
                                                onChange={(e) =>
                                                    handleItemChange(item.id, "quantity", e.target.value)
                                                }
                                                placeholder="0"
                                            />
                                            {itemErrors[item.id]?.quantity && (
                                                <span className="field-error">{itemErrors[item.id].quantity}</span>
                                            )}
                                        </label>

                                        <label className="form-group">
                                            <span className="form-label">Unit</span>
                                            <input 
                                                ref={(el) => {
                                                    if (!itemFieldRefs.current[item.id]) {
                                                    itemFieldRefs.current[item.id] = {}
                                                    }
                                                    itemFieldRefs.current[item.id].unit = el
                                                }}
                                                className={`form-input ${itemErrors[item.id]?.unit ? "input-error" : ""}`}
                                                type="text"
                                                name="unit"
                                                value={item.unit}
                                                onChange={(e) =>
                                                    handleItemChange(item.id, "unit", e.target.value)
                                                }
                                                placeholder="pcs, ft, boxes..."
                                            />
                                            {itemErrors[item.id]?.unit && (
                                                <span className="field-error">{itemErrors[item.id].unit}</span>
                                            )}
                                        </label>

                                        <label className="form-group">
                                            <span className="form-label">Condition</span>
                                            <select
                                                ref={(el) => {
                                                    if (!itemFieldRefs.current[item.id]) {
                                                    itemFieldRefs.current[item.id] = {}
                                                    }
                                                    itemFieldRefs.current[item.id].condition = el
                                                }}
                                                className={`form-input ${itemErrors[item.id]?.condition ? "input-error" : ""}`}
                                                name="condition"
                                                value={item.condition}
                                                onChange={(e) =>
                                                    handleItemChange(item.id, "condition", e.target.value)
                                                }
                                            >
                                                <option value="">Select Condition</option>
                                                <option value="Good">Good</option>
                                                <option value="Damaged">Damaged</option>
                                                <option value="Partial">Partial</option> 
                                            </select>
                                            {itemErrors[item.id]?.condition && (
                                                <span className="field-error">{itemErrors[item.id].condition}</span>
                                            )}
                                        </label>

                                        <label className="form-group receive-form-span-2">
                                            <span className="form-label">Assigned Location</span>
                                            <input 
                                                ref={(el) => {
                                                    if (!itemFieldRefs.current[item.id]) {
                                                    itemFieldRefs.current[item.id] = {}
                                                    }
                                                    itemFieldRefs.current[item.id].location = el
                                                }}
                                                className={`form-input ${itemErrors[item.id]?.location ? "input-error" : ""}`}
                                                type="text"
                                                name="location"
                                                value={item.location}
                                                onChange={(e) =>
                                                    handleItemChange(item.id, "location", e.target.value)
                                                }
                                                placeholder="Warhouse A / Rack 3"
                                            />
                                            {itemErrors[item.id]?.location && (
                                                <span className="field-error">{itemErrors[item.id].location}</span>
                                            )}
                                        </label>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="receive-add-item">
                            <button
                                className="secondary-button"
                                type="button"
                                onClick={handleAddItem}
                            >
                                + Add Item
                            </button>
                        </div>
                    </section>

                    <section className="page-section receive-form-section">
                        <div className="section-heading-row">
                            <h2 className="section-title">Notes</h2>
                        </div>

                        <label className="form-group">
                                <span className="form-label">Delivery Notes</span>
                                <textarea 
                                    className="form-textarea"
                                    name="notes"
                                    value={deliveryForm.notes}
                                    onChange={handleDeliveryChange}
                                    placeholder="Add notes about discrepancies, packaging condition, missing items, or receiving details."
                                />
                            </label>
                    </section>

                    <section className="receive-actions">
                        {formError && (
                            <div className="login-error">{formError}</div>
                        )}
                        <button 
                            className="secondary-button"
                            type="button"
                            onClick={handleSaveDraft}
                        >
                            Save Draft
                        </button>

                        <button className="primary-button" type="submit">Confirm Receipt</button>
                    </section>
                </form>
            </div>
        </div>
    )
}

export default ReceiveInventoryPage