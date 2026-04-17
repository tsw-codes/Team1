import { useEffect, useRef, useState } from "react"
import { createAuditTimestamp, formatAuditTimestamp, formatDate } from "../utils/dateUtils"
import {
    createTransfer,
    getTransfersForPermissions,
    subscribeToTransfers,
    updateTransfer,
} from "../services/transferService"
import {
    getAvailableManifestsForTransfer,
    subscribeToManifests,
} from "../services/manifestService"
import {
    applyTransferReceiptToInventory,
    applyTransferShipmentToInventory,
} from "../services/inventoryService"
import { useAsyncData } from "../hooks/useAsyncData"
import Toast from "./Toast"
import InfoHeader from "./InfoHeader"

function TransferInventoryPage({ onBack, currentUser, permissions = [] }) {
    const transferRefs = useRef({})
    const itemFieldRefs = useRef({})
    const transferScrollRef = useRef(null)

    const [infoOpen, setInfoOpen] = useState(() => window.innerWidth > 900)

    const [toast, setToast] = useState({ message: "", type: "success" })

    const {
        data: availableManifests,
        loading: manifestsLoading,
        error: manifestsError,
        setData: setAvailableManifests,
    } = useAsyncData(() => getAvailableManifestsForTransfer(permissions), [permissions])

    const {
        data: availableTransfers,
        loading: transfersLoading,
        error: transfersError,
        setData: setAvailableTransfers,
        refetch: refetchTransfers,
    } = useAsyncData(() => getTransfersForPermissions(permissions), [permissions])

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
    const isFinalized = isTransfer && currentStatusValue === "completed"

    useEffect(() => {
        async function refreshWorkItems() {
            const [manifests, transfers] = await Promise.all([
                getAvailableManifestsForTransfer(permissions),
                getTransfersForPermissions(permissions),
            ])
            setAvailableManifests(manifests)
            setAvailableTransfers(transfers)
        }

        const unsubscribeManifests = subscribeToManifests(refreshWorkItems)
        const unsubscribeTransfers = subscribeToTransfers(refreshWorkItems)

        return () => {
            unsubscribeManifests()
            unsubscribeTransfers()
        }
    }, [permissions, setAvailableManifests, setAvailableTransfers])

    useEffect(() => {
        if (!selectedWorkItem) return

        const [recordType, recordId] = selectedWorkItem.split(":")

        if (recordType === "manifest") {
            const manifest = availableManifests.find((item) => item.id === recordId) || null

            if (!manifest) {
                setSelectedWorkItem("")
                resetTransferSelection()
                return
            }

            setActiveRecord((prev) => {
                if (!prev || activeRecordType !== "manifest") return prev
                return {
                    ...manifest,
                    shippedDate: prev.shippedDate || "",
                }
            })
            return
        }

        if (recordType === "transfer") {
            const transfer = availableTransfers.find((item) => item.id === recordId) || null

            if (!transfer) {
                setSelectedWorkItem("")
                resetTransferSelection()
                return
            }

            const normalizedTransfer =
                (transfer.statusValue === "in_transit" || transfer.status === "In Transit")
                    ? {
                        ...transfer,
                        items: transfer.items.map((item) => ({
                            ...item,
                            receivedQuantity:
                                item.receivedQuantity === null || item.receivedQuantity === ""
                                    ? item.shippedQuantity
                                    : item.receivedQuantity,
                        })),
                    }
                    : transfer

            setActiveRecord((prev) => {
                if (!prev || activeRecordType !== "transfer") return prev
                return normalizedTransfer
            })
        }
    }, [selectedWorkItem, availableManifests, availableTransfers, activeRecordType])

    function showToast(message, type = "success") {
        setToast({ message, type })

        window.clearTimeout(showToast.timeoutId)
        showToast.timeoutId = window.setTimeout(() => {
            setToast({ message: "", type: "success" })
        }, 3000)
    }

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
            const manifest = (availableManifests ?? []).find((item) => item.id === recordId) || null

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
            const transfer = (availableTransfers ?? []).find((item) => item.id === recordId) || null

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
            (availableManifests ?? []).some((item) => item.id === recordId)

        const isValidTransfer =
            recordType === "transfer" &&
            (availableTransfers ?? []).some((item) => item.id === recordId)

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

    async function handleConfirmShipment(e) {
        e.preventDefault()

        if (!activeRecord || !isManifest) return

        const isValid = validateShipment()
        if (!isValid) return

        const transferTypeValue = activeRecord.manifestTypeValue || activeRecord.manifestType

        // Step 1: create transfer in ready_to_ship state with no shipped/received quantities.
        // The auto-adjust DB trigger fires on UPDATE only, so inserting directly as
        // in_transit would silently skip source-inventory deduction.
        const createdTransfer = await createTransfer({
            manifestId: activeRecord.id,

            requestId: activeRecord.requestId || null,
            requestedBy: activeRecord.requestedBy || null,
            approvedBy: activeRecord.approvedBy || null,
            approvedAt: activeRecord.approvedAt || null,

            transferTypeValue,
            transferType: activeRecord.manifestType || transferTypeValue,

            statusValue: "ready_to_ship",
            status: "Ready to Ship",

            createdBy: activeRecord.finalizedBy || activeRecord.createdBy || "unknown",
            createdAt: createAuditTimestamp(),
            manifestDate: activeRecord.manifestDate,

            shippedDate: null,
            shippedAt: null,
            shippedBy: null,

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
                shippedQuantity: null,
                receivedQuantity: null,
                varianceReason: "",
            })),
        })

        // Step 2: transition ready_to_ship → in_transit with shipped_quantity set per item.
        // This UPDATE fires auto_adjust_inventory_on_transfer, which deducts source inventory.
        const shippedTransfer = await updateTransfer(createdTransfer.id, {
            statusValue: "in_transit",
            status: "In Transit",
            shippedDate: activeRecord.shippedDate,
            shippedAt: createAuditTimestamp(),
            shippedBy: currentUser?.username || "unknown",
            items: createdTransfer.items.map((item) => ({
                id: item.id,
                shippedQuantity: Number(item.manifestQuantity || 0),
            })),
        })

        await applyTransferShipmentToInventory(shippedTransfer)

        setSelectedWorkItem(`transfer:${shippedTransfer.id}`)
        setActiveRecord(shippedTransfer)
        setActiveRecordType("transfer")
        setTransferErrors({})
        setItemErrors({})
        setFormError("")

        refetchTransfers()
        showToast(`Transfer shipment ${shippedTransfer.id} created.`)
    }

    async function handleConfirmReceipt(e) {
        e.preventDefault()

        if (!activeRecord || !isReceiving) return

        const isValid = validateReceipt()
        if(!isValid) return

        const hasDiscrepancy = activeRecord.items.some(
            (item) => Number(item.receivedQuantity || 0) !== Number(item.shippedQuantity || 0)
        )

        const updatedTransfer = await updateTransfer(activeRecord.id, {
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

        await applyTransferReceiptToInventory(updatedTransfer)

        setActiveRecord(updatedTransfer)

        showToast(
            updatedTransfer.statusValue === "exception"
                ? `Transfer shipment ${updatedTransfer.id} completed with exception.`
                : `Transfer shipment ${updatedTransfer.id} completed.`,
            updatedTransfer.statusValue === "exception" ? "warning" : "success"
        )

        setSelectedWorkItem("")
        resetTransferSelection()

        setTimeout(() => {
            transferScrollRef.current?.scrollTo({
                top: 0,
                behavior: "smooth",
            })
        }, 0)
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
        if (status === "exception") return "Exception"
        if (status === "completed") return "Completed"
        return ""
    }

    function getStatusClass(status) {
        if (status === "ready_to_ship") return "reserved"
        if (status === "in_transit") return "in-transit"
        if (status === "exception") return "out-of-stock"
        if (status === "completed") return "available"
        return "reserved"
    }

    if (manifestsLoading || transfersLoading) {
        return <div className="manifest-page"><p>Loading...</p></div>
    }

    if (manifestsError || transfersError) {
        return <div className="manifest-page"><p>Failed to load transfer data.</p></div>
    }

    if ((availableManifests ?? []).length === 0 && (availableTransfers ?? []).length === 0) {
        return (
            <>
                <div className="manifest-page">
                    <div className="manifest-page-scroll">
                        <InfoHeader
                            title="Transfer Inventory"
                            subtitle="Select a manifest or transfer to continue shipment or receipt processing."
                            onBack={onBack}
                            infoOpen={infoOpen}
                            onToggleInfo={() => setInfoOpen((prev) => !prev)}
                            countText="0 items"
                        />

                        <section className="page-section manifest-form-section">
                            <div className="manifest-empty-state">
                                No transfer records are currently available for your role.
                            </div>
                        </section>
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

    if (!activeRecord) {
        return (
            <>
                <div className="manifest-page">
                    <div className="manifest-page-scroll">
                        <form className="manifest-form">
                            <InfoHeader
                                title="Transfer Inventory"
                                subtitle="Select a manifest or transfer to continue shipment or receipt processing."
                                onBack={onBack}
                                infoOpen={infoOpen}
                                onToggleInfo={() => setInfoOpen((prev) => !prev)}
                                countText="0 items"
                            />

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

                                        {(availableManifests ?? []).map((manifest) => (
                                            <option key={`manifest:${manifest.id}`} value={`manifest:${manifest.id}`}>
                                                {manifest.id} - (Ready to Ship)
                                            </option>
                                        ))}

                                        {(availableTransfers ?? []).map((transfer) => (
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

                <Toast 
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast({ message: "", type: "success" })}
                />
            </>
        )
    }

    return (
        <>
            <div className="manifest-page">
                <div className="manifest-page-scroll" ref={transferScrollRef}>
                    <form className="manifest-form" autoComplete="off">
                        <InfoHeader
                            title="Transfer Inventory"
                            subtitle="Execute shipment and receipt for manifests and transfers."
                            onBack={onBack}
                            infoOpen={infoOpen}
                            onToggleInfo={() => setInfoOpen((prev) => !prev)}
                            countText={`${activeRecord?.items?.length || 0} item${(activeRecord?.items?.length || 0) !== 1 ? "s" : ""}`}
                        />

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

                                    {(availableManifests ?? []).map((manifest) => (
                                        <option key={`manifest:${manifest.id}`} value={`manifest:${manifest.id}`}>
                                            {manifest.id} - (Ready to Ship)
                                        </option>
                                    ))}

                                    {(availableTransfers ?? []).map((transfer) => (
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
                                <span className={`status-badge ${getStatusClass(
                                    isManifest ? "ready_to_ship" : (activeRecord.statusValue || activeRecord.status)
                                )}`}>
                                    {getStatusLabel(
                                        isManifest ? "ready_to_ship" : (activeRecord.statusValue || activeRecord.status)
                                    )}
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

                                {activeRecord.requestId && (
                                    <>
                                        <label className="form-group">
                                            <span className="form-label">Request ID</span>
                                            <input 
                                                className="form-input read-only-input"
                                                type="text"
                                                value={activeRecord.requestId}
                                                readOnly
                                            />
                                        </label>

                                        <label className="form-group">
                                            <span className="form-label">Requested By</span>
                                            <input 
                                                className="form-input read-only-input"
                                                type="text"
                                                value={activeRecord.requestedBy || ""}
                                                readOnly
                                            />
                                        </label>

                                        <label className="form-group">
                                            <span className="form-label">Approved By</span>
                                            <input 
                                                className="form-input read-only-input"
                                                type="text"
                                                value={activeRecord.approvedBy || ""}
                                                readOnly
                                            />
                                        </label>

                                        <label className="form-group">
                                            <span className="form-label">Approved At</span>
                                            <input 
                                                className="form-input read-only-input"
                                                type="text"
                                                value={formatAuditTimestamp(activeRecord.approvedAt)}
                                                readOnly
                                            />
                                        </label>
                                    </>
                                )}

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
                                        value={formatDate(activeRecord.manifestDate)}
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

                                    const hasReceivedQuantity =
                                        item.receivedQuantity !== undefined &&
                                        item.receivedQuantity !== null &&
                                        item.receivedQuantity !== ""

                                    const receivedQty = hasReceivedQuantity ? Number(item.receivedQuantity) : ""

                                    const hasDiscrepancy =
                                        isTransfer &&
                                        hasReceivedQuantity &&
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
                                                        className={`form-input ${!isReceiving ? "read-only-input" : ""}`}
                                                        type="text"
                                                        value={item.varianceReason || ""}
                                                        onChange={(e) => handleItemChange(item.id, "varianceReason", e.target.value)}
                                                        placeholder={isReceiving ? "Explain any quantity difference" : ""}
                                                        readOnly={!isReceiving}
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
                                        disabled={!isShipping || isTransfer}
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
                                            disabled={!isReceiving}
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

            <Toast 
                message={toast.message}
                type={toast.type}
                onClose={() => setToast({ message: "", type: "success" })}
            />
        </>
    )
}

export default TransferInventoryPage