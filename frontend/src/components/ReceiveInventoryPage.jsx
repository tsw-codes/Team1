import { useEffect, useMemo, useRef, useState } from "react"
import {
    getLocationOptionsForPermissions,
    getProjectOptionsForLocation,
    getLocationByValue,
} from "../services/projectService"
import {
    getOpenPurchaseOrders,
    completePurchaseOrder,
    subscribeToPurchaseOrders,
} from "../services/purchaseOrderService"
import { applyReceiptToInventory } from "../services/inventoryService"
import { buildReceiptPayload, createReceipt } from "../services/receiptService"
import {
    buildReceiptItemSerialPayload,
    createReceiptItemSerials,
} from "../services/receiptSerialService"
import {
    buildReceiptAttachmentPayload,
    createReceiptAttachments,
} from "../services/receiptAttachmentService"
import { getMaterialCategoryOptions } from "../services/materialService"
import { useAsyncData } from "../hooks/useAsyncData"
import InfoHeader from "./InfoHeader"
import Toast from "./Toast"

function createLocalPhoto(file) {
    return {
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        fileName: file.name,
        previewUrl: URL.createObjectURL(file),
        contentType: file.type || "",
    }
}

function createSerialEntry() {
    return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        serialNumber: "",
        labelPhotos: [],
    }
}

function ReceiveInventoryPage({ onBack, currentUser, permissions = [] }) {
    const fileInputRef = useRef(null)
    const deliveryPhotoInputRef = useRef(null)
    const itemRefs = useRef({})
    const deliveryRefs = useRef({})
    const itemFieldRefs = useRef({})
    const itemPhotoInputRefs = useRef({})
    const serialPhotoInputRefs = useRef({})
    const pageScrollRef = useRef(null)
    const nextReceivedItemIdRef = useRef(2)

    function getNextReceivedItemId() {
        const nextId = nextReceivedItemIdRef.current
        nextReceivedItemIdRef.current += 1
        return nextId
    }

    function createEmptyReceivedItem() {
        return {
            id: getNextReceivedItemId(),
            materialName: "",
            sku: "",
            category: "",
            orderedQuantity: "",
            alreadyReceivedQuantity: 0,
            remainingQuantity: "",
            packingSlipQuantity: "",
            receivedQuantity: "",
            receivedQuantityManual: false,
            unit: "",
            condition: "Good",
            isCompleted: false,
            source: "manual",
            serialTrackingEnabled: false,
            serialEntries: [],
            itemPhotos: [],
        }
    }

    const [toast, setToast] = useState({ message: "", type: "success" })

    const [infoOpen, setInfoOpen] = useState(() => window.innerWidth > 900)

    const [scanPreview, setScanPreview] = useState(null)
    const [deliveryPhotos, setDeliveryPhotos] = useState([])
    const [deliveryPhotosExpanded, setDeliveryPhotosExpanded] = useState(false)
    const [serialPanels, setSerialPanels] = useState({})
    const [itemPhotoPanels, setItemPhotoPanels] = useState({})
    const [serialPhotoPanels, setSerialPhotoPanels] = useState({})
    const [purchaseOrdersLoading, setPurchaseOrdersLoading] = useState(true)
    const [purchaseOrdersError, setPurchaseOrdersError] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)

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

    const [receivedItems, setReceivedItems] = useState(() => [{
        id: 1,
        materialName: "",
        sku: "",
        category: "",
        orderedQuantity: "",
        alreadyReceivedQuantity: 0,
        remainingQuantity: "",
        packingSlipQuantity: "",
        receivedQuantity: "",
        receivedQuantityManual: false,
        unit: "",
        condition: "Good",
        isCompleted: false,
        source: "manual",
        serialTrackingEnabled: false,
        serialEntries: [],
        itemPhotos: [],
    }])

    const { data: rawLocationOptions } = useAsyncData(
        () => getLocationOptionsForPermissions(permissions),
        [permissions]
    )
    const locationOptions = rawLocationOptions ?? []

    const [purchaseOrders, setPurchaseOrders] = useState([])

    // Resolve location types for purchase orders (async — getLocationByValue hits the DB in live mode)
    const { data: purchaseOrderLocationTypes } = useAsyncData(async () => {
        const entries = await Promise.all(
            purchaseOrders.map(async (po) => {
                const location = await getLocationByValue(po.locationValue)
                return [po.id, location?.type ?? null]
            })
        )
        return Object.fromEntries(entries)
    }, [purchaseOrders])

    const purchaseOrderOptions = useMemo(() => {
        const canReceiveWarehouse = permissions.includes("receive_inventory_warehouse")
        const canReceiveSite = permissions.includes("receive_inventory_site")
        const typeMap = purchaseOrderLocationTypes ?? {}

        return purchaseOrders.filter((purchaseOrder) => {
            const type = typeMap[purchaseOrder.id]
            if (!type) return false

            if (canReceiveWarehouse && canReceiveSite) return true
            if (canReceiveWarehouse && type === "warehouse") return true
            if (canReceiveSite && type === "site") return true

            return false
        })
    }, [purchaseOrders, permissions, purchaseOrderLocationTypes])

    const hasSelectedPurchaseOrder = Boolean(deliveryForm.selectedPurchaseOrderId)

    const { data: rawProjectOptions } = useAsyncData(
        () => getProjectOptionsForLocation(deliveryForm.locationValue),
        [deliveryForm.locationValue]
    )
    const projectOptions = rawProjectOptions ?? []

    const { data: selectedLocation } = useAsyncData(
        () => deliveryForm.locationValue ? getLocationByValue(deliveryForm.locationValue) : null,
        [deliveryForm.locationValue]
    )

    const hasReceiptDiscrepancy = useMemo(() => {
        return receivedItems.some((item) => {
            const orderedVsPackingSlip =
                Number(item.orderedQuantity || 0) !== Number(item.packingSlipQuantity || 0)
            const packingSlipVsReceived =
                Number(item.packingSlipQuantity || 0) !== Number(item.receivedQuantity || 0)

            return orderedVsPackingSlip || packingSlipVsReceived
        })
    }, [receivedItems])

    useEffect(() => {
        let cancelled = false

        async function refreshPurchaseOrders() {
            try {
                if (!cancelled) {
                    setPurchaseOrdersLoading(true)
                    setPurchaseOrdersError("")
                }

                const nextPurchaseOrders = await getOpenPurchaseOrders()
                if (!cancelled) {
                    setPurchaseOrders(nextPurchaseOrders)
                    setPurchaseOrdersLoading(false)
                }
            } catch (err) {
                if (!cancelled) {
                    setPurchaseOrders([])
                    setPurchaseOrdersError(err.message || "Unable to load purchase orders.")
                    setPurchaseOrdersLoading(false)
                }
            }
        }

        refreshPurchaseOrders()

        const unsubscribe = subscribeToPurchaseOrders(refreshPurchaseOrders)

        return () => {
            cancelled = true
            unsubscribe()
        }
    }, [])

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

    function normalizeSelectedPhotos(fileList) {
        return Array.from(fileList || []).map(createLocalPhoto)
    }

    function handleDeliveryPhotoSelect(e) {
        const nextPhotos = normalizeSelectedPhotos(e.target.files)
        if (nextPhotos.length === 0) return

        setDeliveryPhotos((prev) => [...prev, ...nextPhotos])
        setDeliveryPhotosExpanded(false)
        e.target.value = ""
    }

    function handleRemoveDeliveryPhoto(photoId) {
        setDeliveryPhotos((prev) => {
            const target = prev.find((photo) => photo.id === photoId)
            if (target?.previewUrl) {
                URL.revokeObjectURL(target.previewUrl)
            }
            return prev.filter((photo) => photo.id !== photoId)
        })
    }

    function toggleDeliveryPhotosExpanded() {
        setDeliveryPhotosExpanded((prev) => !prev)
    }

    function createReceivedItemsFromPurchaseOrder(purchaseOrder) {
        if (!purchaseOrder?.items?.length) {
            return [createEmptyReceivedItem()]
        }

        return purchaseOrder.items.map((item) => {
            const remainingQuantity = Number(item.remainingQuantity || 0)
            const alreadyReceivedQuantity = Number(item.receivedQuantityTotal || 0)
            const isCompleted = Boolean(item.isFullyReceived) || remainingQuantity <= 0

            return ({
            id: getNextReceivedItemId(),
            purchaseOrderItemId: item.id || null,
            materialName: item.materialName || "",
            sku: item.sku || "",
            category: item.category || "",
            orderedQuantity: Number(item.orderedQuantity || 0),
            alreadyReceivedQuantity,
            remainingQuantity,
            packingSlipQuantity: isCompleted ? 0 : remainingQuantity,
            receivedQuantity: isCompleted ? 0 : remainingQuantity,
            receivedQuantityManual: false,
            unit: item.unit || "",
            condition: "Good",
            isCompleted,
            source: "purchase_order",
            serialTrackingEnabled: false,
            serialEntries: [],
            itemPhotos: [],
        })})
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
        setDeliveryPhotos([])
        setFormError("")
        setItemErrors({})
        setDeliveryErrors({})
    }

    function handleSaveDraft() {
        alert("Save Draft not yet implemented.")
    }

    async function handleConfirmReceipt(e) {
        e.preventDefault()
        if (isSubmitting) return

        const isValid = validateReceiveForm()
        if (!isValid) return

        const selectedProject = projectOptions.find(
            (project) => String(project.value) === String(deliveryForm.projectValue)
        ) || null

        const receiptPayload = buildReceiptPayload({
            deliveryForm,
            receivedItems,
            selectedLocationLabel: selectedLocation?.label || "",
            selectedProjectLabel: selectedProject?.label || "",
            hasDiscrepancy: hasReceiptDiscrepancy,
        })

        try {
            setIsSubmitting(true)
            const createdReceipt = await createReceipt(receiptPayload)
            await persistReceiptEnhancements(createdReceipt, receiptPayload)

            await applyReceiptToInventory(createdReceipt)

            if (deliveryForm.selectedPurchaseOrderId) {
                await completePurchaseOrder(deliveryForm.selectedPurchaseOrderId, hasReceiptDiscrepancy)
            }

            resetReceiveForm()

            setTimeout(() => {
                pageScrollRef.current?.scrollTo({
                    top: 0,
                    behavior: "smooth",
                })
            }, 0)

            showToast(`Receipt ${createdReceipt.id} confirmed.`)
        } catch (err) {
            setFormError(err.message || "Unable to confirm receipt.")
        } finally {
            setIsSubmitting(false)
        }
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
                if (item.isCompleted) return item

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

    function handleAddItemPhotos(itemId) {
        itemPhotoInputRefs.current[itemId]?.click?.()
    }

    function handleItemPhotoSelect(itemId, e) {
        const nextPhotos = normalizeSelectedPhotos(e.target.files)
        if (nextPhotos.length === 0) return

        setItemPhotoPanels((prev) => ({
            ...prev,
            [itemId]: false,
        }))

        setReceivedItems((prev) =>
            prev.map((item) =>
                item.id === itemId
                    ? { ...item, itemPhotos: [...(item.itemPhotos || []), ...nextPhotos] }
                    : item
            )
        )

        e.target.value = ""
    }

    function handleRemoveItemPhoto(itemId, photoId) {
        setReceivedItems((prev) =>
            prev.map((item) => {
                if (item.id !== itemId) return item

                const target = (item.itemPhotos || []).find((photo) => photo.id === photoId)
                if (target?.previewUrl) {
                    URL.revokeObjectURL(target.previewUrl)
                }

                return {
                    ...item,
                    itemPhotos: (item.itemPhotos || []).filter((photo) => photo.id !== photoId),
                }
            })
        )
    }

    function toggleItemPhotoPanel(itemId) {
        setItemPhotoPanels((prev) => ({
            ...prev,
            [itemId]: !prev[itemId],
        }))
    }

    function toggleSerialPanel(itemId) {
        setSerialPanels((prev) => ({
            ...prev,
            [itemId]: !prev[itemId],
        }))
    }

    function handleAddSerialEntry(itemId) {
        setReceivedItems((prev) =>
            prev.map((item) =>
                item.id === itemId
                    ? {
                        ...item,
                        serialTrackingEnabled: true,
                        serialEntries: [...(item.serialEntries || []), createSerialEntry()],
                    }
                    : item
            )
        )
    }

    function handleSerialEntryChange(itemId, serialEntryId, value) {
        setReceivedItems((prev) =>
            prev.map((item) =>
                item.id === itemId
                    ? {
                        ...item,
                        serialEntries: (item.serialEntries || []).map((serialEntry) =>
                            serialEntry.id === serialEntryId
                                ? { ...serialEntry, serialNumber: value }
                                : serialEntry
                        ),
                    }
                    : item
            )
        )
    }

    function handleRemoveSerialEntry(itemId, serialEntryId) {
        setReceivedItems((prev) =>
            prev.map((item) => {
                if (item.id !== itemId) return item

                const target = (item.serialEntries || []).find(
                    (serialEntry) => serialEntry.id === serialEntryId
                )
                ;(target?.labelPhotos || []).forEach((photo) => {
                    if (photo.previewUrl) {
                        URL.revokeObjectURL(photo.previewUrl)
                    }
                })

                const nextSerialEntries = (item.serialEntries || []).filter(
                    (serialEntry) => serialEntry.id !== serialEntryId
                )

                return {
                    ...item,
                    serialEntries: nextSerialEntries,
                    serialTrackingEnabled: nextSerialEntries.length > 0,
                }
            })
        )
    }

    function handleAddSerialLabelPhotos(itemId, serialEntryId) {
        serialPhotoInputRefs.current[`${itemId}-${serialEntryId}`]?.click?.()
    }

    function handleSerialLabelPhotoSelect(itemId, serialEntryId, e) {
        const nextPhotos = normalizeSelectedPhotos(e.target.files)
        if (nextPhotos.length === 0) return

        const panelKey = `${itemId}-${serialEntryId}`
        setSerialPhotoPanels((prev) => ({
            ...prev,
            [panelKey]: false,
        }))

        setReceivedItems((prev) =>
            prev.map((item) =>
                item.id === itemId
                    ? {
                        ...item,
                        serialEntries: (item.serialEntries || []).map((serialEntry) =>
                            serialEntry.id === serialEntryId
                                ? {
                                    ...serialEntry,
                                    labelPhotos: [
                                        ...(serialEntry.labelPhotos || []),
                                        ...nextPhotos,
                                    ],
                                }
                                : serialEntry
                        ),
                    }
                    : item
            )
        )

        e.target.value = ""
    }

    function handleRemoveSerialLabelPhoto(itemId, serialEntryId, photoId) {
        setReceivedItems((prev) =>
            prev.map((item) => {
                if (item.id !== itemId) return item
                return {
                    ...item,
                    serialEntries: (item.serialEntries || []).map((serialEntry) => {
                        if (serialEntry.id !== serialEntryId) return serialEntry

                        const target = (serialEntry.labelPhotos || []).find(
                            (photo) => photo.id === photoId
                        )
                        if (target?.previewUrl) {
                            URL.revokeObjectURL(target.previewUrl)
                        }

                        return {
                            ...serialEntry,
                            labelPhotos: (serialEntry.labelPhotos || []).filter(
                                (photo) => photo.id !== photoId
                            ),
                        }
                    }),
                }
            })
        )
    }

    function toggleSerialPhotoPanel(itemId, serialEntryId) {
        const panelKey = `${itemId}-${serialEntryId}`
        setSerialPhotoPanels((prev) => ({
            ...prev,
            [panelKey]: !prev[panelKey],
        }))
    }
    
    function handleAddItem() {
        const newItem = {
            ...createEmptyReceivedItem(),
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
            const target = prev.find((item) => item.id === id)
            ;(target?.itemPhotos || []).forEach((photo) => {
                if (photo.previewUrl) {
                    URL.revokeObjectURL(photo.previewUrl)
                }
            })
            ;(target?.serialEntries || []).forEach((serialEntry) => {
                ;(serialEntry.labelPhotos || []).forEach((photo) => {
                    if (photo.previewUrl) {
                        URL.revokeObjectURL(photo.previewUrl)
                    }
                })
            })
            return prev.filter((item) => item.id !== id)
        })
    }

    function hasOrderedVsPackingSlipDiscrepancy(item) {
        const expectedQuantity =
            item.source === "purchase_order"
                ? Number(item.remainingQuantity || 0)
                : Number(item.orderedQuantity || 0)

        return expectedQuantity !== Number(item.packingSlipQuantity || 0)
    }

    function hasPackingSlipVsReceivedDiscrepancy(item) {
        return Number(item.packingSlipQuantity || 0) !== Number(item.receivedQuantity || 0)
    }

    function hasOverReceiptRemainingDiscrepancy(item) {
        if (item.source !== "purchase_order") return false
        return Number(item.receivedQuantity || 0) > Number(item.remainingQuantity || 0)
    }

    function getItemDiscrepancyState(item) {
        const orderedVsPackingSlip = hasOrderedVsPackingSlipDiscrepancy(item)
        const packingSlipVsReceived = hasPackingSlipVsReceivedDiscrepancy(item)
        const overRemaining = hasOverReceiptRemainingDiscrepancy(item)

        return {
            orderedVsPackingSlip,
            packingSlipVsReceived,
            overRemaining,
            hasAnyDiscrepancy: orderedVsPackingSlip || packingSlipVsReceived || overRemaining,
        }
    }

    function isPurchaseOrderItem(item) {
        return item.source === "purchase_order"
    }

    async function persistReceiptEnhancements(createdReceipt, receiptPayload) {
        const savedReceiptItems = Array.isArray(createdReceipt?.items) ? createdReceipt.items : []
        const actionableItems = receivedItems.filter((item) => !item.isCompleted)
        const attachmentRows = deliveryPhotos.map((photo) =>
            buildReceiptAttachmentPayload({
                receiptId: createdReceipt.id,
                attachmentType: "delivery_photo",
                fileName: photo.fileName,
                filePath: `session-preview://${encodeURIComponent(photo.fileName)}`,
                contentType: photo.contentType,
            })
        )

        for (const [index, sourceItem] of actionableItems.entries()) {
            const savedItem = savedReceiptItems[index]
            if (!savedItem?.id) continue

            ;(sourceItem.itemPhotos || []).forEach((photo) => {
                attachmentRows.push(
                    buildReceiptAttachmentPayload({
                        receiptId: createdReceipt.id,
                        receiptItemId: savedItem.id,
                        attachmentType: "item_photo",
                        fileName: photo.fileName,
                        filePath: `session-preview://${encodeURIComponent(photo.fileName)}`,
                        contentType: photo.contentType,
                    })
                )
            })

            const serialEntries = (sourceItem.serialEntries || []).filter(
                (serialEntry) => serialEntry.serialNumber.trim()
            )
            if (serialEntries.length === 0) continue

            const serialRows = serialEntries.map((serialEntry) =>
                buildReceiptItemSerialPayload({
                    receiptId: createdReceipt.id,
                    receiptItemId: savedItem.id,
                    purchaseOrderItemId:
                        sourceItem.purchaseOrderItemId || savedItem.purchaseOrderItemId || null,
                    projectValue: receiptPayload.projectValue,
                    locationValue: receiptPayload.locationValue,
                    serialNumber: serialEntry.serialNumber,
                })
            )

            const createdSerials = await createReceiptItemSerials(serialRows)

            createdSerials.forEach((createdSerial, serialIndex) => {
                const sourceSerial = serialEntries[serialIndex]
                ;(sourceSerial?.labelPhotos || []).forEach((photo) => {
                    attachmentRows.push(
                        buildReceiptAttachmentPayload({
                            receiptId: createdReceipt.id,
                            receiptItemId: savedItem.id,
                            receiptItemSerialId: createdSerial.id,
                            attachmentType: "label_photo",
                            fileName: photo.fileName,
                            filePath: `session-preview://${encodeURIComponent(photo.fileName)}`,
                            contentType: photo.contentType,
                        })
                    )
                })
            })
        }

        if (attachmentRows.length > 0) {
            await createReceiptAttachments(attachmentRows)
        }
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

        const actionableItems = receivedItems.filter((item) => !item.isCompleted)

        if (actionableItems.length === 0) {
            setFormError("All selected purchase order items are already fully received.")
            setDeliveryErrors(newDeliveryErrors)
            setItemErrors({})
            return false
        }

        actionableItems.forEach((item) => {
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

            if (item.serialTrackingEnabled) {
                const serialNumbers = (item.serialEntries || [])
                    .map((serialEntry) => serialEntry.serialNumber.trim())
                    .filter(Boolean)

                if (serialNumbers.length === 0) {
                    errors.serialEntries = "Add at least one serial number or turn off serial tracking."
                } else if (new Set(serialNumbers).size !== serialNumbers.length) {
                    errors.serialEntries = "Serial numbers must be unique within the item."
                }
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
            "serialEntries",
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
                            <button
                                className="photo-section-toggle"
                                type="button"
                                onClick={toggleDeliveryPhotosExpanded}
                                style={{ marginTop: "1rem" }}
                            >
                                <span className="photo-section-toggle-label">Delivery Photos</span>
                                <span className="photo-section-toggle-meta">
                                    {deliveryPhotosExpanded ? "Hide" : "View"}
                                    {deliveryPhotos.length > 0 ? ` (${deliveryPhotos.length})` : ""}
                                </span>
                            </button>

                            <input
                                ref={deliveryPhotoInputRef}
                                className="hidden-file-input"
                                type="file"
                                accept="image/*"
                                capture="environment"
                                multiple
                                onChange={handleDeliveryPhotoSelect}
                            />

                            {deliveryPhotosExpanded && (
                                <div className="photo-section-body">
                                    {deliveryPhotos.length > 0 && (
                                        <div className="received-items-list">
                                            {deliveryPhotos.map((photo) => (
                                                <div className="scan-preview-card" key={photo.id}>
                                                    <div className="preview-card-header">
                                                        <p className="scan-preview-name">{photo.fileName}</p>
                                                        <button
                                                            className="icon-button"
                                                            type="button"
                                                            aria-label={`Remove ${photo.fileName}`}
                                                            title="Remove photo"
                                                            onClick={() => handleRemoveDeliveryPhoto(photo.id)}
                                                        >
                                                            🗑
                                                        </button>
                                                    </div>
                                                    <img
                                                        src={photo.previewUrl}
                                                        alt={photo.fileName}
                                                        className="scan-preview-image"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="photo-section-body-actions">
                                        <button
                                            className="text-button"
                                            type="button"
                                            onClick={() => deliveryPhotoInputRef.current?.click()}
                                        >
                                            Add Delivery Photos
                                        </button>
                                    </div>
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
                                        disabled={purchaseOrdersLoading || isSubmitting}
                                    >
                                        <option value="">
                                            {purchaseOrdersLoading
                                                ? "Loading purchase orders..."
                                                : purchaseOrderOptions.length === 0
                                                ? "No available purchase orders"
                                                : "Select purchase order"}
                                        </option>
                                        {purchaseOrderOptions.map((purchaseOrder) => (
                                            <option key={purchaseOrder.id} value={purchaseOrder.id}>
                                                {purchaseOrder.project} • ({purchaseOrder.poNumber})
                                            </option>
                                        ))}
                                    </select>

                                    {purchaseOrdersError && (
                                        <span className="field-error">{purchaseOrdersError}</span>
                                    )}
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
                                    Review highlighted items before confirming receipt. Quantity differences or over-receipt amounts have been detected.
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
                                                {item.isCompleted ? (
                                                    <span className="feature-note">Completed</span>
                                                ) : (receivedItems.length > 1 && !isPurchaseOrderItem(item)) && (
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
                                                <div className="received-item-warning-block serial-entries-list">
                                                    {discrepancyState.orderedVsPackingSlip && (
                                                        <p className="received-item-warning-text">
                                                            Packing slip quantity does not match the expected quantity for this receipt.
                                                        </p>
                                                    )}

                                                    {discrepancyState.packingSlipVsReceived && (
                                                        <p className="received-item-warning-text">
                                                            Received quantity does not match the packing slip quantity.
                                                        </p>
                                                    )}

                                                    {discrepancyState.overRemaining && (
                                                        <p className="received-item-warning-text">
                                                            Received quantity is greater than the remaining quantity on this purchase order line.
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {isPurchaseOrderItem(item) && (
                                                <p className="section-subtext">
                                                    Already received: {Number(item.alreadyReceivedQuantity || 0)} {item.unit || ""}
                                                    {" • "}
                                                    Remaining: {Number(item.remainingQuantity || 0)} {item.unit || ""}
                                                </p>
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
                                                            item.isCompleted ? "read-only-input " : ""
                                                        }${
                                                            itemErrors[item.id]?.packingSlipQuantity 
                                                            ? "input-error" 
                                                            : discrepancyState.orderedVsPackingSlip || discrepancyState.packingSlipVsReceived || discrepancyState.overRemaining
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
                                                        readOnly={item.isCompleted}
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
                                                            item.isCompleted ? "read-only-input " : ""
                                                        }${
                                                            itemErrors[item.id]?.receivedQuantity 
                                                            ? "input-error" 
                                                            : discrepancyState.packingSlipVsReceived || discrepancyState.overRemaining
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
                                                        readOnly={item.isCompleted}
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
                                                        disabled={item.isCompleted}
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
                                            <button
                                                className="photo-section-toggle"
                                                type="button"
                                                onClick={() => toggleSerialPanel(item.id)}
                                                style={{ marginTop: "1rem", marginBottom: "0.5rem" }}
                                            >
                                                <span className="photo-section-toggle-label">Serial Numbers</span>
                                                <span className="photo-section-toggle-meta">
                                                    {serialPanels[item.id] ? "Hide" : "View"}
                                                    {item.serialEntries?.length > 0 ? ` (${item.serialEntries.length})` : ""}
                                                </span>
                                            </button>

                                            {serialPanels[item.id] && (
                                                <div className="received-item-warning-block serial-entries-list">
                                                    {(item.serialEntries || []).map((serialEntry, serialIndex) => (
                                                        <div className="receive-form-section serial-entry-card" key={serialEntry.id}>
                                                            <div
                                                                className="photo-section-header"
                                                                style={{ justifyContent: "space-between", alignItems: "center", gap: "1rem" }}
                                                            >
                                                                <h4 className="received-item-title">Serial {serialIndex + 1}</h4>
                                                                {!item.isCompleted && (
                                                                    <button
                                                                        className="icon-button"
                                                                        type="button"
                                                                        aria-label={`Remove serial ${serialIndex + 1}`}
                                                                        title="Remove serial"
                                                                        onClick={() => handleRemoveSerialEntry(item.id, serialEntry.id)}
                                                                    >
                                                                        🗑
                                                                    </button>
                                                                )}
                                                            </div>

                                                            <label className="form-group">
                                                                <span className="form-label">Serial Number</span>
                                                                <input
                                                                    className={`form-input ${itemErrors[item.id]?.serialEntries ? "input-error" : ""}`}
                                                                    type="text"
                                                                    value={serialEntry.serialNumber}
                                                                    onChange={(e) =>
                                                                        handleSerialEntryChange(item.id, serialEntry.id, e.target.value)
                                                                    }
                                                                    placeholder="Enter serial number"
                                                                    readOnly={item.isCompleted}
                                                                />
                                                            </label>

                                                            <button
                                                                className="photo-section-toggle"
                                                                type="button"
                                                                onClick={() => toggleSerialPhotoPanel(item.id, serialEntry.id)}
                                                            >
                                                                <span className="photo-section-toggle-label">Label Photos</span>
                                                                <span className="photo-section-toggle-meta">
                                                                    {serialPhotoPanels[`${item.id}-${serialEntry.id}`] ? "Hide" : "View"}
                                                                    {(serialEntry.labelPhotos || []).length > 0
                                                                        ? ` (${(serialEntry.labelPhotos || []).length})`
                                                                        : ""}
                                                                </span>
                                                            </button>

                                                            <input
                                                                ref={(el) => {
                                                                    serialPhotoInputRefs.current[`${item.id}-${serialEntry.id}`] = el
                                                                }}
                                                                className="hidden-file-input"
                                                                type="file"
                                                                accept="image/*"
                                                                capture="environment"
                                                                multiple
                                                                onChange={(e) => handleSerialLabelPhotoSelect(item.id, serialEntry.id, e)}
                                                            />

                                                            {serialPhotoPanels[`${item.id}-${serialEntry.id}`] && (
                                                                <div className="photo-section-body">
                                                                    {(serialEntry.labelPhotos || []).length > 0 && (
                                                                        <div className="received-items-list">
                                                                            {serialEntry.labelPhotos.map((photo) => (
                                                                                <div className="scan-preview-card" key={photo.id}>
                                                                                    <div className="preview-card-header">
                                                                                        <p className="scan-preview-name">{photo.fileName}</p>
                                                                                        <button
                                                                                            className="icon-button"
                                                                                            type="button"
                                                                                            aria-label={`Remove ${photo.fileName}`}
                                                                                            title="Remove photo"
                                                                                            onClick={() =>
                                                                                                handleRemoveSerialLabelPhoto(item.id, serialEntry.id, photo.id)
                                                                                            }
                                                                                        >
                                                                                            🗑
                                                                                        </button>
                                                                                    </div>
                                                                                    <img
                                                                                        src={photo.previewUrl}
                                                                                        alt={photo.fileName}
                                                                                        className="scan-preview-image"
                                                                                    />
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}

                                                                    {!item.isCompleted && (
                                                                        <div className="photo-section-body-actions">
                                                                            <button
                                                                                className="text-button"
                                                                                type="button"
                                                                                onClick={() => handleAddSerialLabelPhotos(item.id, serialEntry.id)}
                                                                            >
                                                                                Add Label Photos
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}

                                                    {itemErrors[item.id]?.serialEntries && (
                                                        <span className="field-error">{itemErrors[item.id].serialEntries}</span>
                                                    )}

                                                    {!item.isCompleted && (
                                                        <button
                                                            className="text-button"
                                                            type="button"
                                                            onClick={() => handleAddSerialEntry(item.id)}
                                                        >
                                                            {(item.serialEntries || []).length > 0
                                                                ? "+ Add Another Serial"
                                                                : "+ Add Serial Number"}
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                            <hr className="receive-section-divider" />

                                            <button
                                                className="photo-section-toggle"
                                                type="button"
                                                onClick={() => toggleItemPhotoPanel(item.id)}
                                                style={{ marginTop: "1rem" }}
                                            >
                                                <span className="photo-section-toggle-label">Item Photos</span>
                                                <span className="photo-section-toggle-meta">
                                                    {itemPhotoPanels[item.id] ? "Hide" : "View"}
                                                    {(item.itemPhotos || []).length > 0 ? ` (${(item.itemPhotos || []).length})` : ""}
                                                </span>
                                            </button>

                                            <input
                                                ref={(el) => {
                                                    itemPhotoInputRefs.current[item.id] = el
                                                }}
                                                className="hidden-file-input"
                                                type="file"
                                                accept="image/*"
                                                capture="environment"
                                                multiple
                                                onChange={(e) => handleItemPhotoSelect(item.id, e)}
                                            />

                                            {itemPhotoPanels[item.id] && (
                                                <div className="photo-section-body">
                                                    {(item.itemPhotos || []).length > 0 && (
                                                        <div className="received-items-list">
                                                            {item.itemPhotos.map((photo) => (
                                                                <div className="scan-preview-card" key={photo.id}>
                                                                    <div className="preview-card-header">
                                                                        <p className="scan-preview-name">{photo.fileName}</p>
                                                                        <button
                                                                            className="icon-button"
                                                                            type="button"
                                                                            aria-label={`Remove ${photo.fileName}`}
                                                                            title="Remove photo"
                                                                            onClick={() => handleRemoveItemPhoto(item.id, photo.id)}
                                                                        >
                                                                            🗑
                                                                        </button>
                                                                    </div>
                                                                    <img
                                                                        src={photo.previewUrl}
                                                                        alt={photo.fileName}
                                                                        className="scan-preview-image"
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {!item.isCompleted && (
                                                        <div className="photo-section-body-actions">
                                                            <button
                                                                className="text-button"
                                                                type="button"
                                                                onClick={() => handleAddItemPhotos(item.id)}
                                                            >
                                                                Add Item Photos
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
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
                                    disabled={isSubmitting}
                                >
                                    Save Draft
                                </button>

                            <button className="primary-button" type="submit" disabled={isSubmitting}>
                                {isSubmitting ? "Confirming..." : "Confirm Receipt"}
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

export default ReceiveInventoryPage
