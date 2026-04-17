import { useEffect, useMemo, useRef, useState } from "react"
import { createAuditTimestamp } from "../utils/dateUtils"
import { 
    getLocationOptions,
    getProjectOptionsForLocation,
    getLocationByValue,
    getProjectByValue,
} from "../services/projectService"
import InfoHeader from "./InfoHeader"
import Toast from "./Toast"
import { buildPurchaseOrderPayload, createPurchaseOrder } from "../services/purchaseOrderService"
import { materialCategoryOptions } from "../data/materialCategories"

function EnterPurchaseOrderPage( { onBack, currentUser }) {
    const fileInputRef = useRef(null)
    const poRefs = useRef({})
    const itemRefs = useRef({})
    const itemFieldRefs = useRef({})
    const pageScrollRef = useRef(null)

    function createEmptyPoItem(id = 1) {
        return {
            id,
            materialName: "",
            sku: "",
            category: "",
            orderedQuantity: "",
            unit: "",
            unitCost: "",
            source: "manual",
        }
    }

    const [infoOpen, setInfoOpen] = useState(() => window.innerWidth > 900)

    const [poPreview, setPoPreview] = useState(null)

    const [formError, setFormError] = useState("")
    const [poErrors, setPoErrors] = useState({})
    const [itemErrors, setItemErrors] = useState({})

    const [toast, setToast] = useState({ message: "", type: "success" })

    const [poForm, setPoForm] = useState({
        poNumber: "",
        vendor: "",
        expectedDeliveryDate: "",
        enteredBy: currentUser?.username || "",
        enteredAt: createAuditTimestamp(),
        locationValue: "",
        projectValue: "",
        notes: "",
    })

    const [poItems, setPoItems] = useState([createEmptyPoItem()])

    const [locationOptions, setLocationOptions] = useState([])
    const [projectOptions, setProjectOptions] = useState([])
    const [selectedLocation, setSelectedLocation] = useState(null)
    const [selectedProject, setSelectedProject] = useState(null)

    useEffect(() => {
        let isMounted = true

        async function loadLocations() {
            try {
                const options = await getLocationOptions()
                if (!isMounted) return
                setLocationOptions(Array.isArray(options) ? options : [])
            } catch (error) {
                console.error("Failed to load locations:", error)
                if (!isMounted) return
                setLocationOptions([])
            }
        }

        loadLocations()

        return () => {
            isMounted = false
        }
    }, [])

    useEffect(() => {
        let isMounted = true

        async function loadProjects() {
            if (!poForm.locationValue) {
                setProjectOptions([])
                setSelectedLocation(null)
                setSelectedProject(null)
                return
            }

            try {
                const [projects, location] = await Promise.all([
                    getProjectOptionsForLocation(poForm.locationValue),
                    getLocationByValue(poForm.locationValue),
                ])

                if (!isMounted) return

                setProjectOptions(Array.isArray(projects) ? projects : [])
                setSelectedLocation(location || null)
            } catch (error) {
                console.error("Failed to load projects/location:", error)
                if (!isMounted) return
                setProjectOptions([])
                setSelectedLocation(null)
            }
        }

        loadProjects()

        return () => {
            isMounted = false
        }
    }, [poForm.locationValue])

    useEffect(() => {
        let isMounted = true

        async function loadSelectedProject() {
            if (!poForm.projectValue) {
                setSelectedProject(null)
                return
            }

            try {
                const project = await getProjectByValue(poForm.projectValue)
                if (!isMounted) return
                setSelectedProject(project || null)
            } catch (error) {
                console.error("Failed to load selected project:", error)
                if (!isMounted) return
                setSelectedProject(null)
            }
        }

        loadSelectedProject()

        return () => {
            isMounted = false
        }
    }, [poForm.projectValue])

    function showToast(message, type = "success") {
        setToast({ message, type })

        window.clearTimeout(showToast.timeoutId)
        showToast.timeoutId = window.setTimeout(() => {
            setToast({ message: "", type: "success" })
        }, 3000)
    }

    function handlePoChange(e) {
        const { name, value } = e.target

        setPoForm((prev) => {
            const next = {
                ...prev,
                [name]: value,
            }

            if (name === "locationValue") {
                next.projectValue = ""
            }

            return next
        })

        setPoErrors((prev) => {
            if (!prev[name]) return prev
            const next = { ...prev }
            delete next[name]
            return next
        })

        if (name === "locationValue") {
            setPoErrors((prev) => {
                const next = { ...prev }
                delete next.projectValue
                return next
            })
        }

        if (formError) {
            setFormError("")
        }
    }

    function handleUploadClick() {
        fileInputRef.current?.click()
    }

    function handleDocumentSelect(e) {
        const file = e.target.files?.[0]
        if (!file) return

        const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null

        setPoPreview({
            filename: file.name,
            fileType: file.type,
            previewUrl,
        })

        setPoErrors((prev) => {
            if (!prev.poDocument) return prev
            const next = { ...prev }
            delete next.poDocument
            return next
        })

        if (formError) {
            setFormError("")
        }
    }

    function handleItemChange(id, field, value) {
        setPoItems((prev) =>
            prev.map((item) => 
                item.id === id ? { ...item, [field]: value }: item
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
        const newItem = createEmptyPoItem(Date.now())

        setPoItems((prev) => [ ...prev, newItem ])

        setTimeout(() => {
            itemRefs.current[newItem.id]?.scrollIntoView({
                behavior: "smooth",
                block: "center",
            })
        }, 0)
    }

    function handleRemoveItem(id) {
        setPoItems((prev) => {
            if (prev.length === 1) return prev
            return prev.filter((item) => item.id !== id)
        })

        setItemErrors((prev) => {
            if (!prev[id]) return prev
            const next = { ...prev }
            delete next[id]
            return next
        })

        delete itemRefs.current[id]
        delete itemFieldRefs.current[id]
    }

    function validatePurchaseOrderForm() {
        const newPoErrors = {}
        const newItemErrors = {}

        if (!poForm.poNumber.trim()) {
            newPoErrors.poNumber = "PO Number is required."
        }

        if (!poForm.vendor.trim()) {
            newPoErrors.vendor = "Vendor is required."
        }

        if (!poForm.expectedDeliveryDate.trim()) {
            newPoErrors.expectedDeliveryDate = "Expected delivery date is required."
        }

        if (!poForm.locationValue.trim()) {
            newPoErrors.locationValue = "Location is required."
        }

        if (!poForm.projectValue.trim()) {
            newPoErrors.projectValue = "Project is required."
        }

        if (!poPreview) {
            newPoErrors.poDocument = "PO document upload is required."
        }

        if (poItems.length === 0) {
            setFormError("At least one purchase order item is required.")
            setPoErrors(newPoErrors)
            setItemErrors({})
            return false
        }

        poItems.forEach((item) => {
            const errors = {}

            if (!item.materialName.trim()) {
                errors.materialName = "Material name is required."
            }

            if (!item.sku.trim()) {
                errors.sku = "SKU is required."
            }

            if (!item.category.trim()) {
                errors.category = "Category is required."
            }

            if (!item.orderedQuantity || Number(item.orderedQuantity) <= 0) {
                errors.orderedQuantity = "Order quantity must be greater than 0."
            }

            if (!item.unit.trim()) {
                errors.unit = "Unit is required."
            }

            if (item.unitCost === "") {
                errors.unitCost = "Unit cost is required."
            } else if (Number(item.unitCost) < 0) {
                errors.unitCost = "Unit cost cannot be negative."
            }

            if (Object.keys(errors).length > 0) {
                newItemErrors[item.id] = errors
            }
        })

        setPoErrors(newPoErrors)
        setItemErrors(newItemErrors)

        const hasPoErrors = Object.keys(newPoErrors).length > 0
        const hasItemErrors = Object.keys(newItemErrors).length > 0

        if (hasPoErrors || hasItemErrors) {
            setFormError("")
            scrollToFirstError(newPoErrors, newItemErrors)
            return false
        }

        setFormError("")
        return true
    }

    function scrollToFirstError(newPoErrors, newItemErrors = {}) {
        if (newPoErrors.poNumber) {
            poRefs.current.poNumber?.scrollIntoView({ behavior: "smooth", block: "center" })
            poRefs.current.poNumber?.focus?.()
            return
        }

        if (newPoErrors.vendor) {
            poRefs.current.vendor?.scrollIntoView({ behavior: "smooth", block: "center" })
            poRefs.current.vendor?.focus?.()
            return
        }

        if (newPoErrors.expectedDeliveryDate) {
            poRefs.current.expectedDeliveryDate?.scrollIntoView({ behavior: "smooth", block: "center" })
            poRefs.current.expectedDeliveryDate?.focus?.()
            return
        }

        if (newPoErrors.locationValue) {
            poRefs.current.locationValue?.scrollIntoView({ behavior: "smooth", block: "center" })
            poRefs.current.locationValue?.focus?.()
            return
        }

        if (newPoErrors.projectValue) {
            poRefs.current.projectValue?.scrollIntoView({ behavior: "smooth", block: "center" })
            poRefs.current.projectValue?.focus?.()
            return
        }

        if (newPoErrors.poDocument) {
            poRefs.current.poDocumentSection?.scrollIntoView({ behavior: "smooth", block: "center" })
            return
        }

        const firstItemId = Object.keys(newItemErrors)[0]
        if (!firstItemId) return

        const firstItemErrors = newItemErrors[firstItemId]
        const fieldOrder = ["materialName", "sku", "category", "orderedQuantity", "unit", "unitCost"]

        for (const field of fieldOrder) {
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

    function handleSaveDraft() {
        alert("Save Draft not yet implemented.")
    }

    function handleSubmitPurchaseOrder(e) {
        e.preventDefault()

        const isValid = validatePurchaseOrderForm()
        if (!isValid) return
        
        const purchaseOrderPayload = buildPurchaseOrderPayload({
            poForm,
            poPreview,
            poItems,
            selectedLocationLabel: selectedLocation?.label || "",
            selectedProjectLabel: selectedProject?.label || "",
        })
        
        const createdPurchaseOrder = createPurchaseOrder(purchaseOrderPayload)

        setPoForm({
            poNumber: "",
            vendor: "",
            expectedDeliveryDate: "",
            enteredBy: currentUser?.username || "",
            enteredAt: createAuditTimestamp(),
            locationValue: "",
            projectValue: "",
            notes: "",
        })

        setPoPreview(null)
        setPoErrors({})
        setItemErrors({})
        setFormError("")

        setPoItems([createEmptyPoItem()])

        showToast(`Purchase Order ${createdPurchaseOrder.poNumber} saved.`)

        setTimeout(() => {
            pageScrollRef.current?.scrollTo({
                top: 0,
                behavior: "smooth",
            })
        }, 0)
    }

    return (
        <>
            <div className="receive-page">
                <div className="receive-page-scroll" ref={pageScrollRef}>
                    <form className="receive-form" onSubmit={handleSubmitPurchaseOrder}>
                        <InfoHeader 
                            title="Enter Purchase Order"
                            subtitle="Capture purchase order details before receiving inventory and matching delivery documents."
                            onBack={onBack}
                            infoOpen={infoOpen}
                            onToggleInfo={() => setInfoOpen((prev) => !prev)}
                            countText={`${poItems.length} item${poItems.length !== 1 ? "s" : ""}`}
                        />

                        <section 
                            className="page-section receive-scan-section"
                            ref={(el) => (poRefs.current.poDocumentSection = el)}
                        >
                            <div className="section-heading-row">
                                <h2 className="section-title">PO Document</h2>
                            </div>

                            <p className="section-subtext">
                                Upload or capture the purchase order document for later matching during receiving.
                            </p>

                            <div className="receive-scan-actions">
                                <button
                                    className="secondary-button"
                                    type="button"
                                    onClick={handleUploadClick}
                                >
                                    Upload Purchase Order
                                </button>

                                <input 
                                    ref={fileInputRef}
                                    className="hidden-file-input"
                                    type="file"
                                    accept="image/*,.pdf"
                                    capture="environment"
                                    onChange={handleDocumentSelect}
                                />
                            </div>

                            {poErrors.poDocument && (
                                <span className="field-error">{poErrors.poDocument}</span>
                            )}

                            <p className="feature-note">
                                Purchase order matching will be connected later in the receiving workflow.
                            </p>

                            {poPreview && (
                                <div className="scan-preview-card">
                                    <p className="scan-preview-name">{poPreview.filename}</p>

                                    {poPreview.previewUrl ? (
                                        <img 
                                            src={poPreview.previewUrl}
                                            alt="Purchase order preview"
                                            className="scan-preview-image"
                                        />
                                    ) : (
                                        <p className="scan-preview-note">
                                            Document selected successfully. Preview is not available for this file type.
                                        </p>
                                    )}
                                </div>
                            )}
                        </section> 

                        <section className="page-section receive-form-section">
                            <div className="section-heading-row">
                                <h2 className="section-title">Purchase Order Information</h2>
                            </div>

                            <div className="receive-form-grid">
                                <label className="form-group">
                                    <span className="form-label">PO Number</span>
                                    <input 
                                        ref={(el) => (poRefs.current.poNumber = el)}
                                        className={`form-input ${poErrors.poNumber ? "input-error" : ""}`}
                                        type="text"
                                        name="poNumber"
                                        value={poForm.poNumber}
                                        onChange={handlePoChange}
                                        placeholder="Enter PO number"
                                    />
                                    {poErrors.poNumber && (
                                        <span className="field-error">{poErrors.poNumber}</span>
                                    )}
                                </label>

                                <label className="form-group">
                                    <span className="form-label">Vendor</span>
                                    <input 
                                        ref={(el) => (poRefs.current.vendor = el)}
                                        className={`form-input ${poErrors.vendor ? "input-error" : ""}`}
                                        type="text"
                                        name="vendor"
                                        value={poForm.vendor}
                                        onChange={handlePoChange}
                                        placeholder="Enter vendor name"
                                    />
                                    {poErrors.vendor && (
                                        <span className="field-error">{poErrors.vendor}</span>
                                    )}
                                </label>

                                <label className="form-group">
                                    <span className="form-label">Expected Delivery Date</span>
                                    <input 
                                        ref={(el) => (poRefs.current.expectedDeliveryDate = el)}
                                        className={`form-input ${poErrors.expectedDeliveryDate ? "input-error" : ""}`}
                                        type="date"
                                        name="expectedDeliveryDate"
                                        value={poForm.expectedDeliveryDate}
                                        onChange={handlePoChange}
                                    />
                                    {poErrors.expectedDeliveryDate && (
                                        <span className="field-error">{poErrors.expectedDeliveryDate}</span>
                                    )}
                                </label>

                                <label className="form-group">
                                    <span className="form-label">Entered By</span>
                                    <input 
                                        className="form-input read-only-input"
                                        type="text"
                                        name="enteredBy"
                                        value={poForm.enteredBy}
                                        readOnly
                                    />
                                </label>

                                <label className="form-group receive-form-span-2">
                                    <span className="form-label">Assigned Location</span>
                                    <select
                                        ref={(el) => (poRefs.current.locationValue = el)}
                                        className={`form-input ${poErrors.locationValue ? "input-error": ""}`}
                                        name="locationValue"
                                        value={poForm.locationValue}
                                        onChange={handlePoChange}
                                    >
                                        <option value="">Select Location</option>
                                        {locationOptions.map((location) => (
                                            <option key={location.value} value={location.value}>
                                                {location.label}
                                            </option>
                                        ))}
                                    </select>
                                    {poErrors.locationValue && (
                                        <span className="field-error">{poErrors.locationValue}</span>
                                    )}
                                </label>

                                <label className="form-group receive-form-span-2">
                                    <span className="form-label">Project</span>
                                    <select
                                        ref={(el) => (poRefs.current.projectValue = el)}
                                        className={`form-input ${poErrors.projectValue ? "input-error": ""}`}
                                        name="projectValue"
                                        value={poForm.projectValue}
                                        onChange={handlePoChange}
                                        disabled={!poForm.locationValue}
                                    >
                                        <option value="">
                                            {poForm.locationValue ? "Select project": "Select location first"}
                                        </option>
                                        {projectOptions.map((project) => (
                                            <option key={project.value} value={project.value}>
                                                {project.label}
                                            </option>
                                        ))}
                                    </select>
                                    {poErrors.projectValue && (
                                        <span className="field-error">{poErrors.projectValue}</span>
                                    )}
                                </label>
                            </div>
                        </section>

                        <section className="page-section receive-form-section">
                            <div className="section-heading-row">
                                <h2 className="section-title">Purchase Order Items</h2>
                            </div>

                            <div className="received-items-list">
                                {poItems.map((item, index) => (
                                    <div 
                                        className="received-item-card"
                                        key={item.id}
                                        ref={(el) => (itemRefs.current[item.id] = el)}
                                    >
                                        <div className="section-heading-row">
                                            <h3 className="received-item-title">Item {index + 1}</h3>
                                            {poItems.length > 1 && (
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
                                                    value={item.materialName}
                                                    onChange={(e) => handleItemChange(item.id, "materialName", e.target.value)}
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
                                                    value={item.sku}
                                                    onChange={(e) => handleItemChange(item.id, "sku", e.target.value)}
                                                    placeholder="Enter SKU"
                                                />
                                                {itemErrors[item.id]?.sku && (
                                                    <span className="field-error">{itemErrors[item.id].sku}</span>
                                                )}
                                            </label>

                                            <label className="form-group">
                                                <span className="form-label">Category</span>
                                                <select
                                                    ref={(el) => {
                                                        if (!itemFieldRefs.current[item.id]) {
                                                            itemFieldRefs.current[item.id] = {}
                                                        }
                                                        itemFieldRefs.current[item.id].category = el
                                                    }}
                                                    className={`form-input ${itemErrors[item.id]?.category ? "input-error" : ""}`}
                                                    value={item.category}
                                                    onChange={(e) => handleItemChange(item.id, "category", e.target.value)}
                                                >
                                                    <option value="">Select category</option>
                                                    {materialCategoryOptions.map((category) => (
                                                        <option key={category} value={category}>
                                                            {category}
                                                        </option>
                                                    ))}
                                                </select>
                                                {itemErrors[item.id]?.category && (
                                                    <span className="field-error">{itemErrors[item.id].category}</span>
                                                )}
                                            </label>

                                            <label className="form-group">
                                                <span className="form-label">Ordered Quantity</span>
                                                <input 
                                                    ref={(el) => {
                                                        if (!itemFieldRefs.current[item.id]) {
                                                            itemFieldRefs.current[item.id] = {}
                                                        }
                                                        itemFieldRefs.current[item.id].orderedQuantity = el
                                                    }}
                                                    className={`form-input ${itemErrors[item.id]?.orderedQuantity ? "input-error" : ""}`}
                                                    type="number"
                                                    min="1"
                                                    step="1"
                                                    inputMode="numeric"
                                                    value={item.orderedQuantity}
                                                    onChange={(e) => handleItemChange(item.id, "orderedQuantity", e.target.value)}
                                                    placeholder="0"
                                                />
                                                {itemErrors[item.id]?.orderedQuantity && (
                                                    <span className="field-error">{itemErrors[item.id].orderedQuantity}</span>
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
                                                    value={item.unit}
                                                    onChange={(e) => handleItemChange(item.id, "unit", e.target.value)}
                                                    placeholder="pcs, ft, boxes..."
                                                />
                                                {itemErrors[item.id]?.unit && (
                                                    <span className="field-error">{itemErrors[item.id].unit}</span>
                                                )}
                                            </label>

                                            <label className="form-group">
                                                <span className="form-label">Unit Cost</span>
                                                <input 
                                                    ref={(el) => {
                                                        if (!itemFieldRefs.current[item.id]) {
                                                            itemFieldRefs.current[item.id] = {}
                                                        }
                                                        itemFieldRefs.current[item.id].unitCost = el
                                                    }}
                                                    className={`form-input ${itemErrors[item.id]?.unitCost ? "input-error" : ""}`}
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    inputMode="decimal"
                                                    value={item.unitCost}
                                                    onChange={(e) => handleItemChange(item.id, "unitCost", e.target.value)}
                                                    placeholder="0.00"
                                                />
                                                {itemErrors[item.id]?.unitCost && (
                                                    <span className="field-error">{itemErrors[item.id].unitCost}</span>
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
                                <span className="form-label">Purchase Order Notes</span>
                                <textarea
                                    className="form-textarea"
                                    name="notes"
                                    value={poForm.notes}
                                    onChange={handlePoChange}
                                    placeholder="Add notes about expected delivery timing, vendor communication, or receiving context."
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

                            <button className="primary-button" type="submit">
                                Save Purchase Order
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

export default EnterPurchaseOrderPage