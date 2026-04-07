import { useRef, useState } from "react"
import { createAuditTimestamp, formatAuditTimestamp } from "../utils/dateUtils"
import { createTransfer, getTransfersForPermissions, updateTransfer } from "../services/transferService"
import { getAvailableManifestsForTransfer } from "../services/manifestService"

function TransferInventoryPage({ onBack, currentUser, permissions = [] }) {
    const transferRefs = useRef({})
    const itemFieldRefs = useRef({})
    const transferScrollRef = useRef(null)

    const availableManifests = getAvailableManifestsForTransfer(permissions)

    const availableTransfers = getTransfersForPermissions(permissions)

    const [formError, setFormError] = useState("")
    const [transferErrors, setTransferErrors] = useState({})
    const [itemErrors, setItemErrors] = useState({})

    const [selectedWorkItem, setSelectedWorkItem] = useState("")
    const [activeRecord, setActiveRecord] =useState(null)
    const [activeRecordType, setActiveRecordType] = useState("")

    const isManifest = activeRecordType === "manifest"
    const isTransfer = activeRecordType === "transfer"

    const isShipping = isManifest

    const currentStatusValue = activeRecord?.statusValue || activeRecord?.status

    const isReceiving = isTransfer && currentStatusValue === "in_transit"
    const isFinalized = isTransfer && (currentStatusValue === "completed" || currentStatusValue === "exception")

    function resetTransferSelection() {
        setActiveRecord(null)
        setActiveRecordType("")
        setTransferErrors({})
        setItemErrors({})
        setFormError("")
    }

    function syncWorkItem(value) {
        if (!value) {
            resetTransferSelection()
            return
        }

        const [recordType, recordId] = value.split(":")

        if (recordType === "manifest") {
            const manifest = availableManifests.find((item) => item.id === recordId) || null

            if (!manifest) {
                resetTransferSelection()
                return
            }

            setActiveRecord({
                ...manifest,
                shippedDate: "",
            })
            setActiveRecordType("manifest")
            setTransferErrors({})
            setItemErrors({})
            setFormError("")
            return
        }

        if (recordType === "transfer") {
            const transfer = availableTransfers.find((item) => item.id === recordId) || null

            if (!transfer) {
                resetTransferSelection()
                return
            }

            const normalizedTransfer = (transfer.statusValue === "in_transit" || transfer.status === "In Transit") 
                ? {
                    ...transfer,
                    items: transfer.items.map((item) => ({
                        ...item,
                        receivedQuantity: (item.receivedQuantity === null || item.receivedQuantity === "") ? item.shippedQuantity : item.receivedQuantity,
                    })),
                } : transfer

                setActiveRecord(normalizedTransfer)
                setActiveRecordType("transfer")
                setTransferErrors({})
                setItemErrors({})
                setFormError("")
                return
        }

        resetTransferSelection()
    }

    function handleWorkItemSelectionChange(e) {
        const { value } = e.target

        if (!value) {
            setSelectedWorkItem("")
            resetTransferSelection()
            return
        }

        const [recordType, recordId] = value.split(":")

        const isValidManifest =
            recordType === "manifest" &&
            availableManifests.some((item) => item.id === recordId)

        const isValidTransfer =
            recordType === "transfer" &&
            availableTransfers.some((item) => item.id === recordId)

        if (!isValidManifest && !isValidTransfer) {
            setSelectedWorkItem("")
            resetTransferSelection()
            return
        }

        setSelectedWorkItem(value)
        syncWorkItem(value)
    }

    function handleTransferChange(e) {
        const { name, value } = e.target

        setActiveRecord((prev) => ({
            ...prev,
            [name]: value,
        }))

        setTransferErrors((prev) => {
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
        setActiveRecord((prev) => ({
            ...prev, 
            items: prev.items.map((item) =>
                item.id === id ? { ...item, [field]: value } : item
            ),
        }))

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

    function scrollToFirstError(newTransferErrors, newItemErrors) {
        if (newTransferErrors.shippedDate) {
            transferRefs.current.shippedDate?.scrollIntoView({
                behavior: "smooth",
                block: "center",
            })
            transferRefs.current.shippedDate?.focus?.()
            return
        }

        if (newTransferErrors.receivedDate) {
            transferRefs.current.receivedDate?.scrollIntoView({
                behavior: "smooth",
                block: "center",
            })
            transferRefs.current.receivedDate?.focus?.()
            return
        }

        if (newTransferErrors.exceptionNotes) {
            transferRefs.current.exceptionNotes?.scrollIntoView({
                behavior: "smooth",
                block: "center",
            })
            transferRefs.current.exceptionNotes?.focus?.()
            return
        }

        const firstItemId = Object.keys(newItemErrors)[0]
        if (!firstItemId) return

        const firstItemErrors = newItemErrors[firstItemId]
        const order = ["receivedQuantity"]

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

    function validateShipment() {
        const newTransferErrors = {}

        if (!activeRecord?.shippedDate?.trim()) {
            newTransferErrors.shippedDate = "Shipment date is required."
        }

        setTransferErrors(newTransferErrors)
        setItemErrors({})

        const hasErrors = Object.keys(newTransferErrors).length > 0

        if (hasErrors) {
            setFormError("")
            setTimeout(() => {
                scrollToFirstError(newTransferErrors, {})
            }, 0)
            return false
        }

        setFormError("")
        return true
    }

    function validateReceipt() {
        const newTransferErrors = {}
        const newItemErrors = {}

        if (!activeRecord?.receivedDate?.trim()) {
            newTransferErrors.receivedDate = "Received date is required."
        }

        let hasDiscrepancy = false

        activeRecord.items.forEach((item) => {
            const errors = {}

            const shippedQty = Number(item.shippedQuantity || 0)
            const receivedQty = Number(item.receivedQuantity)

            if (item.receivedQuantity === null || item.receivedQuantity === "") {
                errors.receivedQuantity = "Received quantity is required."
            } else if (receivedQty < 0) {
                errors.receivedQuantity = "Received quantity cannot be negative."
            }

            if (item.receivedQuantity !== null && item.receivedQuantity !== "" && receivedQty !== shippedQty) {
                hasDiscrepancy = true
            }

            if (Object.keys(errors).length > 0) {
                newItemErrors[item.id] = errors
            }
        })

        if (hasDiscrepancy && !activeRecord.exceptionNotes.trim()) {
            newTransferErrors.exceptionNotes = "Exception notes are required when received quantities do not match shipped quantities."
        }

        setTransferErrors(newTransferErrors)
        setItemErrors(newItemErrors)

        const hasTransferErrors = Object.keys(newTransferErrors).length > 0
        const hasItemErrors = Object.keys(newItemErrors).length > 0

        if (hasTransferErrors || hasItemErrors) {
            setFormError("")
            setTimeout(() => {
                scrollToFirstError(newTransferErrors, newItemErrors)
            }, 0)
            return false
        }

        setFormError("")
        return true
    }

    function handleConfirmShipment(e) {
        e.preventDefault()

        if (!activeRecord || !isManifest) return

        const isValid = validateShipment()
        if (!isValid) return

        const newTransfer = {
            manifestId: activeRecord.id,

            transferTypeValue: activeRecord.manifestTypeValue || activeRecord.manifestType,
            transferType: activeRecord.manifestType || activeRecord.manifestTypeValue,

            statusValue: "in_transit",
            status: "In_transit",

            createdBy: activeRecord.finalizedBy || activeRecord.createdBy || "unknown",
            createdAt: createAuditTimestamp(),
            manifestDate: activeRecord.manifestDate,

            shippedDate: activeRecord.shippedDate,
            shippedAt: createAuditTimestamp(),
            shippedBy: currentUser?.username || "unknown",

            receivedDate: null,
            receivedAt: null,
            receivedBy: null,

            locationValue: activeRecord.locationValue || null,
            location: activeRecord.location || "",
            projectValue: activeRecord.projectValue || null,
            project: activeRecord.project || "",

            sourceLocationValue: activeRecord.sourceLocationValue || null,
            sourceLocation: activeRecord.sourceLocation || "",

            destinationLocationValue: activeRecord.destinationLocationValue || null,
            destinationLocation: activeRecord.destinationLocation || "",
            destinationDetail: activeRecord.destinationDetail || "",

            notes: activeRecord.notes || "",
            exceptionNotes: "",

            items: activeRecord.items.map((item) => ({
                ...item,
                manifestQuantity: Number(item.manifestQuantity || 0),
                shippedQuantity: Number(item.manifestQuantity || 0),
                receivedQuantity: Number(item.manifestQuantity || 0),
                varianceReason: "",
            })),
        }

        const createdTransfer = createTransfer(newTransfer)

        setSelectedWorkItem(`transfer:${createdTransfer.id}`)
        syncWorkItem(`transfer:${createdTransfer.id}`)

        alert(`Transfer Shipment ${createdTransfer.id} created.`)
    }

    function handleConfirmReceipt(e) {
        e.preventDefault()

        if (!activeRecord || !isReceiving) return

        const isValid = validateReceipt()
        if(!isValid) return

        const hasDiscrepancy = activeRecord.items.some(
            (item) => Number(item.receivedQuantity || 0) !== Number(item.shippedQuantity || 0)
        )

        const updatedTransfer = updateTransfer(activeRecord.id, {
            statusValue: hasDiscrepancy ? "exception" : "completed",
            status: hasDiscrepancy ? "Exception" : "Completed",
            receivedBy: currentUser?.username || "unknown",
            receivedAt: createAuditTimestamp(),
            receivedDate: activeRecord.receivedDate,
            exceptionNotes: activeRecord.exceptionNotes,
            items: activeRecord.items,
        })

        if (!updatedTransfer) {
            setFormError("Unable to update transfer record.")
            return
        }

        setActiveRecord(updatedTransfer)

        alert(`Transfer Shipment ${updatedTransfer.id} completed.`)
    }

    function getTransferTypeLabel(type) {
        if (type === "outbound") return "Outbound to Job Site"
        if (type === "return") return "Return to Warehouse"
        if (type === "warehouse_transfer") return "Warehouse to Warehouse"
        return ""
    }

    function getStatusLabel(status) {
        if (status === "ready_to_ship") return "Ready to Ship"
        if (status === "in_transit") return "In Transit"
        if (status === "completed") return "Completed"
        if (status === "exception") return "Exception"
        return ""
    }

    function getStatusClass(status) {
        if (status === "ready_to_ship") return "reserved"
        if (status === "in_transit") return "in-transit"
        if (status === "completed") return "available"
        if (status === "exception") return "out-of-stock"
        return "reserved"
    }

    if (availableManifests.length === 0 && availableTransfers.length === 0) {
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

                            <h1 className="page-title manifest-title">Transfer Inventory</h1>
                        </div>

                        <p className="page-subtitle">
                            Select a manifest or transfer to continue shipment or receipt processing.
                        </p>
                    </section>

                    <section className="page-section manifest-form-section">
                        <div className="manifest-empty-state">
                            No transfer records are currently available for your role.
                        </div>
                    </section>
                </div>
            </div>
        )
    }

    if (!activeRecord) {
        return (
            <div className="manifest-page">
                <div className="manifest-page-scroll">
                    <form className="manifest-form">
                        <section className="page-section manifest-header">
                            <div className="manifest-header-bar">
                                <button
                                    className="text-button back-button"
                                    type="button"
                                    onClick={onBack}
                                >
                                    ← Home
                                </button>

                                <h1 className="page-title manifest-title">Transfer Inventory</h1>
                            </div>

                            <p className="page-subtitle">
                                Select a manifest or transfer to continue shipment or receipt processing.
                            </p>
                        </section>

                        <section className="page-section manifest-form-section">
                            <div className="section-heading-row">
                                <h2 className="section-title">Select Work Item</h2>
                            </div>

                            <label className="form-group">
                                <span className="form-label">Manifest or Transfer</span>
                                <select
                                    className="form-input"
                                    value={selectedWorkItem}
                                    onChange={handleWorkItemSelectionChange}
                                >
                                    <option value="">Select work item</option>

                                    {availableManifests.map((manifest) => (
                                        <option key={`manifest:${manifest.id}`} value={`manifest:${manifest.id}`}>
                                            {manifest.id} - (Ready to Ship)
                                        </option>
                                    ))}

                                    {availableTransfers.map((transfer) => (
                                        <option key={`transfer:${transfer.id}`} value={`transfer:${transfer.id}`}>
                                            {transfer.id} - ({getStatusLabel(transfer.statusValue || transfer.status)})
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <div className="manifest-empty-state">
                                No work item selected yet. Choose a manifest or transfer to view details and continue processing.
                            </div>
                        </section>
                    </form>
                </div>
            </div>
        )
    }

    return (
        <div className="manifest-page">
            <div className="manifest-page-scroll" ref={transferScrollRef}>
                <form className="manifest-form" autoComplete="off">
                    <section className="page-section manifest-header">
                        <div className="manifest-header-bar">
                            <button
                                className="text-button back-button"
                                type="button"
                                onClick={onBack}
                            >
                                ← Home
                            </button>

                            <h1 className="page-title manifest-title">Transfer Inventory</h1>
                        </div>

                        <p className="page-subtitle">
                            Execute shipment and receipt for manifests and transfers.
                        </p>
                    </section>

                    <section className="page-section manifest-form-section">
                        <div className="section-heading-row">
                            <h2 className="section-title">Select Work Item</h2>
                        </div>

                        <label className="form-group">
                            <span className="form-label">Manifest or Transfer</span>
                            <select
                                className="form-input"
                                name="work_item"
                                id="work_item"
                                autoComplete="new-password"
                                value={selectedWorkItem}
                                onChange={handleWorkItemSelectionChange}
                            >
                                <option value="">Select work item</option>

                                {availableManifests.map((manifest) => (
                                    <option key={`manifest:${manifest.id}`} value={`manifest:${manifest.id}`}>
                                        {manifest.id} - (Ready to Ship)
                                    </option>
                                ))}

                                {availableTransfers.map((transfer) => (
                                    <option key={`transfer:${transfer.id}`} value={`transfer:${transfer.id}`}>
                                        {transfer.id} - ({getStatusLabel(transfer.statusValue || transfer.status)})
                                    </option>
                                ))}
                            </select>
                        </label>
                    </section>

                    <section className="page-section manifest-form-section">
                        <div className="section-heading-row">
                            <h2 className="section-title">Transfer Information</h2>
                            <span className={`status-badge ${getStatusClass(isManifest ? "ready_to_ship" : (activeRecord.statusValue || activeRecord.status))}`}>
                                {getStatusLabel(isManifest ? "ready_to_ship" : (activeRecord.statusValue || activeRecord.status))}
                            </span>
                        </div>

                        <div className="receive-form-grid">
                            <label className="form-group">
                                <span className="form-label">Transfer ID</span>
                                <input 
                                    className="form-input read-only-input"
                                    type="text"
                                    value={activeRecord.id}
                                    readOnly
                                />
                            </label>

                            <label className="form-group">
                                <span className="form-label">Manifest ID</span>
                                <input 
                                    className="form-input read-only-input"
                                    type="text"
                                    value={isManifest ? activeRecord.id : activeRecord.manifestId}
                                    readOnly
                                />
                            </label>

                            <label className="form-group">
                                <span className="form-label">Transfer Type</span>
                                <input 
                                    className="form-input read-only-input"
                                    type="text"
                                    value={getTransferTypeLabel(isManifest ? activeRecord.manifestType : activeRecord.transferType)}
                                    readOnly
                                />
                            </label>

                            <label className="form-group">
                                <span className="form-label">Created By</span>
                                <input 
                                    className="form-input read-only-input"
                                    type="text"
                                    value={activeRecord.createdBy}
                                    readOnly
                                />
                            </label>

                            <label className="form-group">
                                <span className="form-label">Manifest Date</span>
                                <input 
                                    className="form-input read-only-input"
                                    type="text"
                                    value={activeRecord.manifestDate}
                                    readOnly
                                />
                            </label>

                            {isManifest && (
                                <>
                                   <label className="form-group">
                                        <span className="form-label">Finalized By</span>
                                        <input 
                                            className="form-input read-only-input"
                                            type="text"
                                            value={activeRecord.finalizedBy || ""}
                                            readOnly
                                        />
                                    </label>

                                    <label className="form-group">
                                        <span className="form-label">Finalized At</span>
                                        <input 
                                            className="form-input read-only-input"
                                            type="text"
                                            value={formatAuditTimestamp(activeRecord.finalizedAt)}
                                            readOnly
                                        />
                                    </label> 
                                </>
                            )}

                            {isTransfer && (
                                <>
                                   <label className="form-group">
                                        <span className="form-label">Shipped By</span>
                                        <input 
                                            className="form-input read-only-input"
                                            type="text"
                                            value={activeRecord.shippedBy || ""}
                                            readOnly
                                        />
                                    </label>

                                    <label className="form-group">
                                        <span className="form-label">Shipped At</span>
                                        <input 
                                            className="form-input read-only-input"
                                            type="text"
                                            value={formatAuditTimestamp(activeRecord.shippedAt)}
                                            readOnly
                                        />
                                    </label>

                                    <label className="form-group">
                                        <span className="form-label">Received By</span>
                                        <input 
                                            className="form-input read-only-input"
                                            type="text"
                                            value={activeRecord.receivedBy || ""}
                                            readOnly
                                        />
                                    </label>

                                    <label className="form-group">
                                        <span className="form-label">Received At</span>
                                        <input 
                                            className="form-input read-only-input"
                                            type="text"
                                            value={formatAuditTimestamp(activeRecord.receivedAt)}
                                            readOnly
                                        />
                                    </label>
                                </>
                            )}

                            <label className="form-group">
                                <span className="form-label">Source Location</span>
                                <input 
                                    className="form-input read-only-input"
                                    type="text"
                                    value={activeRecord.sourceLocation}
                                    readOnly
                                />
                            </label>

                            <label className="form-group">
                                <span className="form-label">Destination Location</span>
                                <input 
                                    className="form-input read-only-input"
                                    type="text"
                                    value={activeRecord.destinationLocation}
                                    readOnly
                                />
                            </label>

                            {activeRecord.destinationDetail ? (
                                <label className="form-group">
                                    <span className="form-label">Destination Detail</span>
                                    <input 
                                        className="form-input read-only-input"
                                        type="text"
                                        value={activeRecord.destinationDetail}
                                        readOnly
                                    />
                                </label>
                            ) : null}
                        </div>
                    </section>

                    <section className="page-section manifest-form-section">
                        <div className="section-heading-row">
                            <h2 className="section-title">Transfer Items</h2>
                        </div>

                        <div className="received-items-list">
                            {activeRecord.items.map((item, index) => {
                                const shippedQty = Number(item.shippedQuantity || 0)
                                const receivedQty = item.receivedQuantity === "" ? "" : Number(item.receivedQuantity)
                                const hasDiscrepancy = 
                                    item.receivedQuantity !== "" &&
                                    item.receivedQuantity !== null && 
                                    receivedQty !== shippedQty

                                return (
                                    <div 
                                        className={`received-item-card ${hasDiscrepancy ? "manifest-item-short": ""}`}
                                        key={item.id}
                                    >
                                        <div className="section-heading-row">
                                            <h3 className="received-item-title">Item {index + 1}</h3>
                                            {hasDiscrepancy && (
                                                <span className="manifest-warning-badge">
                                                    {receivedQty < shippedQty ? "Short Received" : "Over Received"}
                                                </span>
                                            )}
                                        </div>

                                        <div className="receive-form-grid">
                                            <label className="form-group">
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
                                                <span className="form-label">Manifest Quantity</span>
                                                <input 
                                                    className="form-input read-only-input"
                                                    type="text"
                                                    value={item.manifestQuantity}
                                                    readOnly
                                                />
                                            </label>

                                            <label className="form-group">
                                                <span className="form-label">Shipped Quantity</span>
                                                <input 
                                                    className="form-input read-only-input"
                                                    type="text"
                                                    value={isManifest ? item.manifestQuantity : item.shippedQuantity}
                                                    readOnly
                                                />
                                            </label>
                                            
                                            {isTransfer && (
                                                <label className="form-group">
                                                    <span className="form-label">Received Quantity</span>
                                                    <input 
                                                        ref={(el) => {
                                                            if (!itemFieldRefs.current[item.id]) {
                                                                itemFieldRefs.current[item.id] = {}
                                                            }
                                                            itemFieldRefs.current[item.id].receivedQuantity = el
                                                        }}
                                                        className={`form-input 
                                                            ${itemErrors[item.id]?.receivedQuantity ? "input-error" : ""}
                                                            ${!isReceiving ? "read-only-input" : ""}`
                                                        }
                                                        type="number"
                                                        value={item.receivedQuantity}
                                                        onChange={(e) => handleItemChange(item.id, "receivedQuantity", e.target.value)}
                                                        placeholder="0"
                                                        readOnly={!isReceiving}
                                                    />
                                                    {itemErrors[item.id]?.receivedQuantity && (
                                                        <span className="field-error">
                                                            {itemErrors[item.id].receivedQuantity}
                                                        </span>
                                                    )}
                                                </label>
                                            )}
                                            
                                            <label className="form-group receive-form-span-2">
                                                <span className="form-label">Variance Reason</span>
                                                <input 
                                                    className="form-input read-only-input"
                                                    type="text"
                                                    value={item.varianceReason || ""}
                                                    readOnly
                                                />
                                            </label>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </section>

                    <section className="page-section manifest-form-section">
                        <div className="section-heading-row">
                            <h2 className="section-title">Execution</h2>
                        </div>

                        <div className="receive-form-grid">
                            <label className="form-group">
                                <span className="form-label">Shipped Date</span>
                                <input 
                                    ref={(el) => (transferRefs.current.shippedDate = el)}
                                    className={`form-input ${transferErrors.shippedDate ? "input-error" : ""}`}
                                    type="date"
                                    name="shippedDate"
                                    value={activeRecord.shippedDate || ""}
                                    onChange={handleTransferChange}
                                    disabled={!isShipping}
                                />
                                {transferErrors.shippedDate && (
                                    <span className="field-error">{transferErrors.shippedDate}</span>
                                )}
                            </label>

                            {isTransfer && (
                                <label className="form-group">
                                    <span className="form-label">Received Date</span>
                                    <input 
                                        ref={(el) => (transferRefs.current.receivedDate = el)}
                                        className={`form-input ${transferErrors.receivedDate ? "input-error" : ""}`}
                                        type="date"
                                        name="receivedDate"
                                        value={activeRecord.receivedDate || ""}
                                        onChange={handleTransferChange}
                                        readOnly={!isReceiving}
                                    />
                                    {transferErrors.receivedDate && (
                                        <span className="field-error">{transferErrors.receivedDate}</span>
                                    )}
                                </label>
                            )}

                        </div>
                    </section>

                    <section className="page-section manifest-form-section">
                        <div className="section-heading-row">
                            <h2 className="section-title">Notes</h2>
                        </div>

                        <label className="form-group">
                            <span className="form-label">Transfer Notes</span>
                            <textarea 
                                className="form-textarea"
                                name="notes"
                                value={activeRecord.notes}
                                onChange={handleTransferChange}
                                readOnly={!isTransfer || isFinalized}
                                placeholder="Add transfer notes."
                            />
                        </label>

                        <label className="form-group">
                            <span className="form-label">Exception Notes</span>
                            <textarea 
                                ref={(el) => (transferRefs.current.exceptionNotes = el)}
                                className={`form-textarea ${transferErrors.exceptionNotes ? "input-error": ""}`}
                                name="exceptionNotes"
                                value={activeRecord.exceptionNotes}
                                onChange={handleTransferChange}
                                readOnly={!isTransfer || isFinalized}
                                placeholder="Required if any received quantity does not match the shipped quantity."
                            />
                            {transferErrors.exceptionNotes && (
                                <span className="field-error">{transferErrors.exceptionNotes}</span>
                            )}
                        </label>
                    </section>

                    <section className="receive-actions">
                        {formError && <div className="login-error">{formError}</div>}

                        {isShipping && (
                            <button
                                className="primary-button"
                                type="button"
                                onClick={handleConfirmShipment}
                            >
                                Confirm Shipment
                            </button>
                        )}

                        {isReceiving && (
                            <button
                                className="primary-button"
                                type="button"
                                onClick={handleConfirmReceipt}
                            >
                                Confirm Receipt
                            </button>
                        )}
                    </section>
                </form>
            </div>
        </div>
    )
}

export default TransferInventoryPage