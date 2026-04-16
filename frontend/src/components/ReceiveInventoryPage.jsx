import { useEffect, useMemo, useRef, useState } from "react"
import { 
    getLocationOptionsForPermissions,
    getProjectOptionsForLocation,
    getLocationByValue,
    getProjectByValue,
 } from "../services/projectService"
import { 
    getOpenPurchaseOrders, 
    completePurchaseOrder,
    subscribeToPurchaseOrders,
} from "../services/purchaseOrderService"
import { applyReceiptToInventory } from "../services/inventoryService"
import { buildReceiptPayload, createReceipt } from "../services/receiptService"
import { getMaterialCategoryOptions } from "../services/materialService"
import InfoHeader from "./InfoHeader"
import Toast from "./Toast"

function ReceiveInventoryPage({ onBack, currentUser, permissions = [] }) {
    const fileInputRef = useRef(null)
    const itemRefs = useRef({})
    const deliveryRefs = useRef({})
    const itemFieldRefs = useRef({})
    const pageScrollRef = useRef(null)

    function createEmptyReceivedItem() {
        return {
            id: Date.now(),
            materialName: "",
            sku: "",
            category: "",
            orderedQuantity: "",
            packingSlipQuantity: "",
            receivedQuantity: "",
            receivedQuantityManual: false,
            unit: "",
            condition: "Good",
            source: "manual",
        }
    }

    const [toast, setToast] = useState({ message: "", type: "success" })

    const [infoOpen, setInfoOpen] = useState(() => window.innerWidth > 900)

    const [scanPreview, setScanPreview] = useState(null)

    const [formError, setFormError] = useState("")
    const [itemErrors, setItemErrors] = useState({})
    const [deliveryErrors, setDeliveryErrors] = useState({})

    const [deliveryForm, setDeliveryForm] = useState({
        selectedPurchaseOrderId: "",
        vendor: "",
        poNumber: "",
        deliveryDate: "",
        receivedBy: currentUser?.username || "",
        projectValue: "",
        locationValue: "",
        notes: "",
    })

    const [receivedItems, setReceivedItems] = useState([createEmptyReceivedItem()])

    const locationOptions = useMemo(() => {
        return getLocationOptionsForPermissions(permissions)
    }, [permissions])

    const [purchaseOrders, setPurchaseOrders] = useState(() =>
        getOpenPurchaseOrders()
    )

    const purchaseOrderOptions = useMemo(() => {
        const canReceiveWarehouse = permissions.includes("receive_inventory_warehouse")
        const canReceiveSite = permissions.includes("receive_inventory_site")

        return purchaseOrders.filter((purchaseOrder) => {
            const location = getLocationByValue(purchaseOrder.locationValue)
            if (!location) return false

            if (canReceiveWarehouse && canReceiveSite) return true
            if (canReceiveWarehouse && location.type === "warehouse") return true
            if (canReceiveSite && location.type === "site") return true

            return false
        })
    }, [purchaseOrders, permissions])

    const hasSelectedPurchaseOrder = Boolean(deliveryForm.selectedPurchaseOrderId)
    
    const projectOptions = useMemo(() => {
        return getProjectOptionsForLocation(deliveryForm.locationValue)
    }, [deliveryForm.locationValue])

    const selectedLocation = useMemo(() => {
        return getLocationByValue(deliveryForm.locationValue)
    }, [deliveryForm.locationValue])

    const selectedProject = useMemo(() => {
        return getProjectByValue(deliveryForm.projectValue)
    }, [deliveryForm.projectValue])

    const hasReceiptDiscrepancy = useMemo(() => {
        return receivedItems.some((item) => getItemDiscrepancyState(item).hasAnyDiscrepancy)
    }, [receivedItems])

    useEffect(() => {
        function refreshPurchaseOrders() {
            setPurchaseOrders(getOpenPurchaseOrders())
        }

        const unsubscribe = subscribeToPurchaseOrders(refreshPurchaseOrders)

        return unsubscribe
    }, [])

    useEffect(() => {
        if (!deliveryForm.selectedPurchaseOrderId) return

        const stillExists = purchaseOrderOptions.some(
            (purchaseOrder) =>
                String(purchaseOrder.id) === String(deliveryForm.selectedPurchaseOrderId)
        )

        if (!stillExists) {
            clearSelectedPurchaseOrder()
        }
    }, [purchaseOrderOptions, deliveryForm.selectedPurchaseOrderId])

    function showToast(message, type = "success") {
        setToast({ message, type })

        window.clearTimeout(showToast.timeoutId)
        showToast.timeoutId = window.setTimeout(() => {
            setToast({ message: "", type: "success" })
        }, 3000)
    }

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

    function createReceivedItemsFromPurchaseOrder(purchaseOrder) {
        if (!purchaseOrder?.items?.length) {
            return [createEmptyReceivedItem()]
        }

        return purchaseOrder.items.map((item, index) => ({
            id: Date.now() + index,
            materialName: item.materialName || "",
            sku: item.sku || "",
            category: item.category || "",
            orderedQuantity: Number(item.orderedQuantity || 0),
            packingSlipQuantity: Number(item.orderedQuantity || 0),
            receivedQuantity: Number(item.orderedQuantity || 0),
            receivedQuantityManual: false,
            unit: item.unit || "",
            condition: "Good",
            source: "purchase_order"
        }))
    }

    function applyPurchaseOrderToReceiveForm(purchaseOrder) {
        if (!purchaseOrder) return

        setDeliveryForm((prev) => ({
            ...prev,
            selectedPurchaseOrderId: purchaseOrder.id,
            vendor: purchaseOrder.vendor,
            poNumber: purchaseOrder.poNumber,
            locationValue: purchaseOrder.locationValue || "",
            projectValue: purchaseOrder.projectValue || "",
        }))

        setReceivedItems(createReceivedItemsFromPurchaseOrder(purchaseOrder))
        setItemErrors({})
        setFormError("")
    }

    function clearSelectedPurchaseOrder() {
        setDeliveryForm((prev) => ({
            ...prev,
            selectedPurchaseOrderId: "",
            vendor: "",
            poNumber: "",
            locationValue: "",
            projectValue: "",
        }))

        setReceivedItems([createEmptyReceivedItem()])

        setDeliveryErrors((prev) => {
            const next = { ...prev }
            delete next.selectedPurchaseOrderId
            delete next.vendor
            delete next.poNumber
            delete next.locationValue
            delete next.projectValue
            return next
        })

        setItemErrors({})
        setFormError("")
    }

    function resetReceiveForm() {
        setDeliveryForm({
            selectedPurchaseOrderId: "",
            vendor: "",
            poNumber: "",
            deliveryDate: "",
            receivedBy: currentUser?.username || "",
            projectValue: "",
            locationValue: "",
            notes: "",
        })

        setReceivedItems([createEmptyReceivedItem()])

        setScanPreview(null)
        setFormError("")
        setItemErrors({})
        setDeliveryErrors({})
    }

    function handleSaveDraft() {
        alert("Save Draft not yet implemented.")
    }

    function handleConfirmReceipt(e) {
        e.preventDefault()

        const isValid = validateReceiveForm()
        if (!isValid) return
        
        const receiptPayload = buildReceiptPayload({
            deliveryForm,
            receivedItems,
            selectedLocationLabel: selectedLocation?.label || "",
            selectedProjectLabel: selectedProject?.label || "",
            hasDiscrepancy: hasReceiptDiscrepancy,
        })

        const createdReceipt = createReceipt(receiptPayload)

        applyReceiptToInventory(createdReceipt)

        if (deliveryForm.selectedPurchaseOrderId) {
            completePurchaseOrder(deliveryForm.selectedPurchaseOrderId, hasReceiptDiscrepancy)
        }

        resetReceiveForm()

        setTimeout(() => {
            pageScrollRef.current?.scrollTo({
                top: 0,
                behavior: "smooth",
            })
        }, 0)

        showToast(`Receipt ${createdReceipt.id} confirmed.`)
    }

    function handleDeliveryChange(e) {
        const { name, value } = e.target

        if (name === "selectedPurchaseOrderId") {
            const nextPurchaseOrder =
                purchaseOrderOptions.find(
                    (purchaseOrder) => String(purchaseOrder.id) === String(value)
                ) || null

            if (nextPurchaseOrder) {
                applyPurchaseOrderToReceiveForm(nextPurchaseOrder)
            } else {
                clearSelectedPurchaseOrder()
            }

            setDeliveryErrors((prev) => {
                const next = { ...prev }
                delete next.selectedPurchaseOrderId
                return next
            })

            if (formError) {
                setFormError("")
            }

            return
        }

        setDeliveryForm((prev) => {
            const next = {
                ...prev, 
                [name]: value,
            }

            if (name === "locationValue") {
                next.projectValue = ""
            }

            return next
        })

        setDeliveryErrors((prev) => {
            if (!prev[name]) return prev
            const next = { ...prev }
            delete next[name]
            return next
        })

        if (name === "locationValue") {
            setDeliveryErrors((prev) => {
                const next = { ...prev }
                delete next.projectValue
                return next
            })
        }

        if (formError) {
            setFormError("")
        }
    }

    function handleItemChange(id, field, value) {
        setReceivedItems((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item

                if (field === "packingSlipQuantity") {
                    const nextItem = {
                        ...item,
                        packingSlipQuantity: value,
                    }

                    if (!item.receivedQuantityManual) {
                        nextItem.receivedQuantity = value
                    }

                    return nextItem
                }

                if (field === "receivedQuantity") {
                    return {
                        ...item,
                        receivedQuantity: value,
                        receivedQuantityManual: true,
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

        if (field === "packingSlipQuantity") {
            setItemErrors((prev) => {
                if (!prev[id]?.receivedQuantity) return prev

                const next = { ...prev }
                next[id] = { ...next[id] }
                delete next[id].receivedQuantity

                if (Object.keys(next[id]).length === 0) {
                    delete next[id]
                }

                return next
            })
        }

        if (formError) {
            setFormError("")
        }
    }
    
    function handleAddItem() {
        const newItem = {
            ...createEmptyReceivedItem(),
            id: Date.now(),
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

    function hasOrderedVsPackingSlipDiscrepancy(item) {
        return Number(item.orderedQuantity || 0) !== Number(item.packingSlipQuantity || 0)
    }

    function hasPackingSlipVsReceivedDiscrepancy(item) {
        return Number(item.packingSlipQuantity || 0) !== Number(item.receivedQuantity || 0)
    }

    function getItemDiscrepancyState(item) {
        const orderedVsPackingSlip = hasOrderedVsPackingSlipDiscrepancy(item)
        const packingSlipVsReceived = hasPackingSlipVsReceivedDiscrepancy(item)

        return {
            orderedVsPackingSlip,
            packingSlipVsReceived,
            hasAnyDiscrepancy: orderedVsPackingSlip || packingSlipVsReceived,
        }
    }

    function isPurchaseOrderItem(item) {
        return item.source === "purchase_order"
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

        if (!deliveryForm.projectValue.trim()) {
            newDeliveryErrors.projectValue = "Project is required."
        }

        if (!deliveryForm.locationValue.trim()) {
            newDeliveryErrors.locationValue = "Location is required."
        }

        if (hasReceiptDiscrepancy && !deliveryForm.notes.trim()) {
            newDeliveryErrors.notes = "Delivery notes are required when quantity discrepancies exist."
        }

        const canReceiveAtWarehouse = permissions.includes("receive_inventory_warehouse")
        const canReceiveAtSite = permissions.includes("receive_inventory_site")

        if (deliveryForm.locationValue && selectedLocation?.type === "warehouse" && !canReceiveAtWarehouse) {
            newDeliveryErrors.locationValue = "You are not allowed to receive at warehouse locations."
        }

        if (deliveryForm.locationValue && selectedLocation?.type === "site" && !canReceiveAtSite) {
            newDeliveryErrors.locationValue = "You are not allowed to receive at site locations."
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

            if (item.orderedQuantity === "" || Number(item.orderedQuantity || 0) < 0) {
                errors.orderedQuantity = "Ordered quantity is required."
            }

            if (item.packingSlipQuantity === "" || Number(item.packingSlipQuantity || 0) < 0) {
                errors.packingSlipQuantity = "Packing slip quantity is required."
            }

            if (item.receivedQuantity === "" || Number(item.receivedQuantity || 0) < 0) {
                errors.receivedQuantity = "Received quantity is required."
            }

            if (!item.unit.trim()) {
                errors.unit = "Unit is required."
            }

            if (!item.condition.trim()) {
                errors.condition = "Condition is required."
            }

            if (!item.sku.trim()) {
                errors.sku = "SKU is required."
            }

            if (!item.category.trim()) {
                errors.category = "Category is required."
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
            deliveryRefs.current.deliveryDate?.focus?.()
            return
        }

        if (newDeliveryErrors.locationValue) {
            deliveryRefs.current.locationValue?.scrollIntoView({ behavior: "smooth", block: "center"})
            deliveryRefs.current.locationValue?.focus?.()
            return
        }

        if (newDeliveryErrors.projectValue) {
            deliveryRefs.current.projectValue?.scrollIntoView({ behavior: "smooth", block: "center"})
            deliveryRefs.current.projectValue?.focus?.()
            return
        }

        if (newDeliveryErrors.notes) {
            deliveryRefs.current.notes?.scrollIntoView({ behavior: "smooth", block: "center"})
            deliveryRefs.current.notes?.focus?.()
            return
        }

        const firstItemId = Object.keys(newItemErrors)[0]
        if (!firstItemId) return

        const itemErrorsForFirst = newItemErrors[firstItemId]

        const fieldsOrder = [
            "materialName",
            "sku",
            "category",
            "orderedQuantity",
            "packingSlipQuantity",
            "receivedQuantity",
            "unit",
            "condition",
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
        <>
            <div className="receive-page">
                <div className="receive-page-scroll" ref={pageScrollRef}>
                    <form className="receive-form" onSubmit={handleConfirmReceipt}>
                        <InfoHeader
                            title="Receive Inventory"
                            subtitle="Log incoming materials, match purchase orders, and document deliveries."
                            onBack={onBack}
                            infoOpen={infoOpen}
                            onToggleInfo={() => setInfoOpen((prev) => !prev)}
                            countText={`${receivedItems.length} item${receivedItems.length !== 1 ? "s" : ""}`}
                        />

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
                                <label className="form-group receive-form-span-2">
                                    <div className="purchase-order-field-header">
                                        <span className="form-label">Purchase Order</span>
                                        {hasSelectedPurchaseOrder && (
                                            <button
                                                className="text-button"
                                                type="button"
                                                onClick={clearSelectedPurchaseOrder}
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                    
                                    <select
                                        className="form-input"
                                        name="selectedPurchaseOrderId"
                                        value={deliveryForm.selectedPurchaseOrderId}
                                        onChange={handleDeliveryChange}
                                    >
                                        <option value="">
                                            {purchaseOrderOptions.length === 0
                                                ? "No available purchase orders"
                                                : "Select purchase order"}
                                        </option>
                                        {purchaseOrderOptions.map((purchaseOrder) => (
                                            <option key={purchaseOrder.id} value={purchaseOrder.id}>
                                                {purchaseOrder.project} • ({purchaseOrder.poNumber})
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className="form-group">
                                    <span className="form-label">Vendor</span>
                                    <input 
                                        ref={(el) => (deliveryRefs.current.vendor = el)}
                                        className={`form-input ${hasSelectedPurchaseOrder ? "read-only-input" : ""} ${deliveryErrors.vendor ? "input-error" : ""}`}
                                        type="text"
                                        name="vendor"
                                        value={deliveryForm.vendor}
                                        onChange={handleDeliveryChange}
                                        placeholder="Enter vendor name"
                                        readOnly={hasSelectedPurchaseOrder}
                                    />
                                    {deliveryErrors.vendor && (
                                        <span className="field-error">{deliveryErrors.vendor}</span>
                                    )}
                                </label>

                                <label className="form-group">
                                    <span className="form-label">PO Number</span>
                                    <input 
                                        ref={(el) => (deliveryRefs.current.poNumber = el)}
                                        className={`form-input ${hasSelectedPurchaseOrder ? "read-only-input" : ""} ${deliveryErrors.poNumber ? "input-error" : ""}`}
                                        type="text"
                                        name="poNumber"
                                        value={deliveryForm.poNumber}
                                        onChange={handleDeliveryChange}
                                        placeholder="Enter PO number"
                                        readOnly={hasSelectedPurchaseOrder}
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
                                    <span className="form-label">Assigned Location</span>
                                    <select
                                        ref={(el) => (deliveryRefs.current.locationValue = el)}
                                        className={`form-input ${hasSelectedPurchaseOrder ? "read-only-input" : ""} ${deliveryErrors.locationValue ? "input-error" : ""}`}
                                        name="locationValue"
                                        value={deliveryForm.locationValue}
                                        onChange={handleDeliveryChange}
                                        disabled={hasSelectedPurchaseOrder}
                                    >
                                        <option value="">Select location</option>
                                        {locationOptions.map((location) => (
                                            <option key={location.value} value={location.value}>
                                                {location.label}
                                            </option>
                                        ))}
                                    </select>
                                    {deliveryErrors.locationValue && (
                                        <span className="field-error">{deliveryErrors.locationValue}</span>
                                    )}
                                </label>
                                
                                <label className="form-group receive-form-span-2">
                                    <span className="form-label">Project</span>
                                    <select
                                        ref={(el) => (deliveryRefs.current.projectValue = el)}
                                        className={`form-input ${hasSelectedPurchaseOrder ? "read-only-input" : ""} ${deliveryErrors.projectValue ? "input-error" : ""}`}
                                        name="projectValue"
                                        value={deliveryForm.projectValue}
                                        onChange={handleDeliveryChange}
                                        disabled={!deliveryForm.locationValue || hasSelectedPurchaseOrder}
                                    >
                                        <option value="">
                                            {deliveryForm.locationValue ? "Select project" : "Select location first"}
                                        </option>
                                        {projectOptions.map((project) => (
                                            <option key={project.value} value={project.value}>
                                                {project.label}
                                            </option>
                                        ))}
                                    </select>
                                    {deliveryErrors.projectValue && (
                                        <span className="field-error">{deliveryErrors.projectValue}</span>
                                    )}
                                </label>
                            </div>
                        </section> 

                        <section className="page-section receive-form-section">
                            <div className="section-heading-row">
                                <h2 className="section-title">Received Material</h2>
                            </div>

                            {receivedItems.some((item) => getItemDiscrepancyState(item).hasAnyDiscrepancy) && (
                                <p className="section-subtext discrepancy-summary-text">
                                    Review highlighted items before confirming receipt.  Quantity differences have been detected.
                                </p>
                            )}

                            <div className="received-items-list">
                                {receivedItems.map((item, index) => {
                                    const discrepancyState = getItemDiscrepancyState(item)

                                    return (
                                        <div 
                                            className={`received-item-card ${discrepancyState.hasAnyDiscrepancy ? "received-item-card-warning" : ""}`}
                                            key={item.id}
                                            ref={(el) => (itemRefs.current[item.id] = el)}
                                        >
                                            <div className="section-heading-row">
                                                <h3 className="received-item-title">Item {index + 1}</h3>
                                                {(receivedItems.length > 1 && !isPurchaseOrderItem(item)) && (
                                                    <button 
                                                        className="text-button"
                                                        type="button"
                                                        onClick={() => handleRemoveItem(item.id)}
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </div>

                                            {discrepancyState.hasAnyDiscrepancy && (
                                                <div className="received-item-warning-block">
                                                    {discrepancyState.orderedVsPackingSlip && (
                                                        <p className="received-item-warning-text">
                                                            Packing slip quantity does not match the purchase order quantity.
                                                        </p>
                                                    )}

                                                    {discrepancyState.packingSlipVsReceived && (
                                                        <p className="received-item-warning-text">
                                                            Received quantity does not match the packing slip quantity.
                                                        </p>
                                                    )}
                                                </div>
                                            )}

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
                                                        className={`form-input ${isPurchaseOrderItem(item) ? "read-only-input" : ""} ${itemErrors[item.id]?.materialName ? "input-error" : ""}`}
                                                        type="text"
                                                        name="materialName"
                                                        value={item.materialName}
                                                        onChange={(e) =>
                                                            handleItemChange(item.id, "materialName", e.target.value)
                                                        }
                                                        placeholder="Enter material name"
                                                        readOnly={isPurchaseOrderItem(item)}
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
                                                        className={`form-input ${isPurchaseOrderItem(item) ? "read-only-input" : ""} ${itemErrors[item.id]?.sku ? "input-error" : ""}`}
                                                        type="text"
                                                        name="sku"
                                                        value={item.sku}
                                                        onChange={(e) =>
                                                            handleItemChange(item.id, "sku", e.target.value)
                                                        }
                                                        placeholder="Enter SKU"
                                                        readOnly={isPurchaseOrderItem(item)}
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
                                                        className={`form-input ${isPurchaseOrderItem(item) ? "read-only-input" : ""} ${itemErrors[item.id]?.category ? "input-error" : ""}`}
                                                        value={item.category}
                                                        onChange={(e) =>
                                                            handleItemChange(item.id, "category", e.target.value)
                                                        }
                                                        disabled={isPurchaseOrderItem(item)}
                                                    >
                                                        <option value="">Select category</option>
                                                        {getMaterialCategoryOptions().map((category) => (
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
                                                        className={`form-input read-only-input ${
                                                            itemErrors[item.id]?.orderedQuantity 
                                                            ? "input-error" 
                                                            : discrepancyState.orderedVsPackingSlip
                                                            ? "input-warning"
                                                            : ""
                                                        }`}
                                                        type="number"
                                                        value={item.orderedQuantity}
                                                        readOnly
                                                        tabIndex={-1}
                                                    />
                                                    {itemErrors[item.id]?.orderedQuantity && (
                                                        <span className="field-error">{itemErrors[item.id].orderedQuantity}</span>
                                                    )}
                                                </label>

                                                <label className="form-group">
                                                    <span className="form-label">Packing Slip Quantity</span>
                                                    <input
                                                        ref={(el) => {
                                                            if (!itemFieldRefs.current[item.id]) {
                                                                itemFieldRefs.current[item.id] = {}
                                                            }
                                                            itemFieldRefs.current[item.id].packingSlipQuantity = el
                                                        }}
                                                        className={`form-input ${
                                                            itemErrors[item.id]?.packingSlipQuantity 
                                                            ? "input-error" 
                                                            : discrepancyState.orderedVsPackingSlip || discrepancyState.packingSlipVsReceived
                                                            ? "input-warning"
                                                            : ""
                                                        }`}
                                                        type="number"
                                                        min="0"
                                                        step="1"
                                                        inputMode="numeric"
                                                        value={item.packingSlipQuantity}
                                                        onChange={(e) =>
                                                            handleItemChange(item.id, "packingSlipQuantity", e.target.value)
                                                        }
                                                        placeholder="0"
                                                    />
                                                    {itemErrors[item.id]?.packingSlipQuantity && (
                                                        <span className="field-error">{itemErrors[item.id].packingSlipQuantity}</span>
                                                    )}
                                                </label>

                                                <label className="form-group">
                                                    <span className="form-label">Received Quantity</span>
                                                    <input
                                                        ref={(el) => {
                                                            if (!itemFieldRefs.current[item.id]) {
                                                                itemFieldRefs.current[item.id] = {}
                                                            }
                                                            itemFieldRefs.current[item.id].receivedQuantity = el
                                                        }}
                                                        className={`form-input ${
                                                            itemErrors[item.id]?.receivedQuantity 
                                                            ? "input-error" 
                                                            : discrepancyState.packingSlipVsReceived
                                                            ? "input-warning"
                                                            : ""
                                                        }`}
                                                        type="number"
                                                        min="0"
                                                        step="1"
                                                        inputMode="numeric"
                                                        value={item.receivedQuantity}
                                                        onChange={(e) =>
                                                            handleItemChange(item.id, "receivedQuantity", e.target.value)
                                                        }
                                                        placeholder="0"
                                                    />
                                                    {itemErrors[item.id]?.receivedQuantity && (
                                                        <span className="field-error">{itemErrors[item.id].receivedQuantity}</span>
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
                                                        className={`form-input ${isPurchaseOrderItem(item) ? "read-only-input" : ""} ${itemErrors[item.id]?.unit ? "input-error" : ""}`}
                                                        type="text"
                                                        name="unit"
                                                        value={item.unit}
                                                        onChange={(e) =>
                                                            handleItemChange(item.id, "unit", e.target.value)
                                                        }
                                                        placeholder="pcs, ft, boxes..."
                                                        readOnly={isPurchaseOrderItem(item)}
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
                                            </div>
                                        </div>
                                    )
                                })}
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
                                {hasReceiptDiscrepancy && (
                                    <p className="section-subtext discrepancy-summary-text">
                                        Delivery notes are required because receipt quantities do not match the purchase order or packing slip.
                                    </p>
                                )}

                                <span className="form-label">Delivery Notes</span>
                                <textarea 
                                    ref={(el) => (deliveryRefs.current.notes = el)}
                                    className={`form-textarea ${deliveryErrors.notes ? "input-error" : ""}`}
                                    name="notes"
                                    value={deliveryForm.notes}
                                    onChange={handleDeliveryChange}
                                    placeholder="Add notes about discrepancies, packaging condition, missing items, or receiving details."
                                />

                                {deliveryErrors.notes && (
                                    <span className="field-error">{deliveryErrors.notes}</span>
                                )}
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

            <Toast
                message={toast.message}
                type={toast.type}
                onClose={() => setToast({ message: "", type: "success" })}
            />
        </>
    )
}

export default ReceiveInventoryPage