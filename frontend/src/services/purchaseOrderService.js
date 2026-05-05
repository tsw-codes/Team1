import { supabase, USE_MOCK } from '../lib/supabaseClient'
import { snakeToCamel, camelToSnake } from '../utils/caseUtils'
import { mockPurchaseOrders } from "../data/mockPurchaseOrders"
import { mockReceipts } from "../data/mockReceipts"

const OPEN_PURCHASE_ORDER_STATUSES = ['entered', 'partially_received']
const PURCHASE_ORDER_STATUS_LABELS = {
  entered: 'Entered',
  partially_received: 'Partially Received',
  received: 'Received',
  closed_with_discrepancies: 'Closed with Discrepancies',
  cancelled: 'Cancelled',
}

const purchaseOrderDataSource = {
  getAll() {
    return mockPurchaseOrders
  },

  getOpen() {
    return mockPurchaseOrders.filter((purchaseOrder) =>
      OPEN_PURCHASE_ORDER_STATUSES.includes(purchaseOrder.statusValue)
    )
  },

  findById(id) {
    return (
      mockPurchaseOrders.find(
        (purchaseOrder) => String(purchaseOrder.id) === String(id)
      ) || null
    )
  },

  insert(purchaseOrder) {
    mockPurchaseOrders.unshift(purchaseOrder)
    return purchaseOrder
  },

  replaceById(id, updatedPurchaseOrder) {
    const index = mockPurchaseOrders.findIndex(
      (purchaseOrder) => String(purchaseOrder.id) === String(id)
    )

    if (index === -1) return null

    mockPurchaseOrders[index] = updatedPurchaseOrder
    return mockPurchaseOrders[index]
  },
}

let purchaseOrderListeners = []

export function subscribeToPurchaseOrders(listener) {
  purchaseOrderListeners.push(listener)

  return () => {
    purchaseOrderListeners = purchaseOrderListeners.filter((l) => l !== listener)
  }
}

function notifyPurchaseOrderChange() {
  purchaseOrderListeners.forEach((listener) => listener())
}

function generatePurchaseOrderId() {
  const prefix = "PO"

  const matchingIds = purchaseOrderDataSource
    .getAll()
    .filter((purchaseOrder) => purchaseOrder.id?.startsWith(`${prefix}-`))
    .map((purchaseOrder) => {
      const numericPart = Number(purchaseOrder.id.split("-")[1])
      return Number.isNaN(numericPart) ? 0 : numericPart
    })

  const nextNumber =
    matchingIds.length > 0 ? Math.max(...matchingIds) + 1 : 1001

  return `${prefix}-${nextNumber}`
}

function normalizePurchaseOrder(record) {
  return {
    ...record,
    statusValue: record.statusValue || 'entered',
    status: record.status || PURCHASE_ORDER_STATUS_LABELS[record.statusValue || 'entered'] || '',
    locationValue: record.locationValue || '',
    location: record.location || '',
    projectValue: record.projectValue || '',
    project: record.project || '',
    poDocumentName: record.poDocumentName || '',
    notes: record.notes || '',
    items: Array.isArray(record.items)
      ? record.items.map((item, index) => {
          const orderedQuantity = Number(item.orderedQuantity || 0)
          const receivedQuantityTotal = Number(item.receivedQuantityTotal || 0)
          const remainingQuantity =
            item.remainingQuantity !== undefined
              ? Number(item.remainingQuantity || 0)
              : Math.max(orderedQuantity - receivedQuantityTotal, 0)

          return {
            ...item,
            lineNumber: item.lineNumber || index + 1,
            orderedQuantity,
            unitCost: Number(item.unitCost || 0),
            receivedQuantityTotal,
            remainingQuantity,
            overReceivedQuantity: Number(item.overReceivedQuantity || 0),
            isFullyReceived:
              item.isFullyReceived !== undefined
                ? Boolean(item.isFullyReceived)
                : remainingQuantity <= 0,
          }
        })
      : [],
  }
}

async function mapPurchaseOrdersWithItems(rows) {
  if (!rows?.length) return []

  const purchaseOrders = snakeToCamel(rows)
  const purchaseOrderIds = purchaseOrders.map((row) => row.id)

  const { data: itemRows, error: itemError } = await supabase
    .from('purchase_order_items_view')
    .select('*')
    .in('purchase_order_id', purchaseOrderIds)
    .order('purchase_order_id')
    .order('line_number')

  if (itemError) throw new Error(itemError.message)

  const itemsByOrderId = (snakeToCamel(itemRows) || []).reduce((acc, item) => {
    const orderId = item.purchaseOrderId
    if (!acc[orderId]) acc[orderId] = []
    acc[orderId].push(item)
    return acc
  }, {})

  return purchaseOrders.map((purchaseOrder) =>
    normalizePurchaseOrder({
      ...purchaseOrder,
      items: itemsByOrderId[purchaseOrder.id] || [],
    })
  )
}

export async function getAllPurchaseOrders() {
  if (USE_MOCK) {
    return purchaseOrderDataSource.getAll().map(normalizePurchaseOrder)
  }

  const { data, error } = await supabase
    .from('purchase_orders_view')
    .select('*')
    .order('entered_at', { ascending: false })

  if (error) throw new Error(error.message)
  return mapPurchaseOrdersWithItems(data)
}

export async function getOpenPurchaseOrders() {
  if (USE_MOCK) {
    return purchaseOrderDataSource.getOpen().map(normalizePurchaseOrder)
  }

  const { data, error } = await supabase
    .from('purchase_orders_view')
    .select('*')
    .in('status_value', OPEN_PURCHASE_ORDER_STATUSES)
    .order('entered_at', { ascending: false })

  if (error) throw new Error(error.message)
  return mapPurchaseOrdersWithItems(data)
}

export async function findPurchaseOrderById(id) {
  if (!id) return null

  if (USE_MOCK) {
    const purchaseOrder = purchaseOrderDataSource.findById(id)
    return purchaseOrder ? normalizePurchaseOrder(purchaseOrder) : null
  }

  const { data, error } = await supabase
    .from('purchase_orders_view')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return (await mapPurchaseOrdersWithItems([data]))?.[0] || null
}

export function buildPurchaseOrderPayload({
  poForm,
  poPreview,
  poItems,
  selectedLocationLabel = "",
  selectedProjectLabel = "",
}) {
  return {
    poNumber: poForm.poNumber.trim(),
    vendor: poForm.vendor.trim(),
    expectedDeliveryDate: poForm.expectedDeliveryDate,
    enteredBy: poForm.enteredBy,
    enteredAt: poForm.enteredAt,

    locationValue: poForm.locationValue,
    location: selectedLocationLabel,

    projectValue: poForm.projectValue,
    project: selectedProjectLabel,

    poDocumentName: poPreview?.filename || "",
    notes: poForm.notes.trim(),

    items: poItems.map((item, index) => ({
      id: index + 1,
      materialName: item.materialName.trim(),
      sku: item.sku.trim(),
      category: item.category?.trim() || "",
      orderedQuantity: Number(item.orderedQuantity || 0),
      unit: item.unit.trim(),
      unitCost: Number(item.unitCost || 0),
      source: item.source,
    })),
  }
}

export async function createPurchaseOrder(purchaseOrderData) {
  if (USE_MOCK) {
    const newPurchaseOrder = normalizePurchaseOrder({
      id: generatePurchaseOrderId(),
      statusValue: "entered",
      status: "Entered",
      ...purchaseOrderData,
    })

    const createdPurchaseOrder = purchaseOrderDataSource.insert(newPurchaseOrder)
    notifyPurchaseOrderChange()
    return createdPurchaseOrder
  }

  const { items = [], ...purchaseOrderFields } = purchaseOrderData
  const snakeFields = camelToSnake(purchaseOrderFields)

  delete snakeFields.location
  delete snakeFields.project
  delete snakeFields.status

  const { data: purchaseOrder, error } = await supabase
    .from('purchase_orders')
    .insert(snakeFields)
    .select()
    .single()

  if (error) throw new Error(error.message)

  if (items.length > 0) {
    const itemRows = items.map((item, index) => ({
      purchase_order_id: purchaseOrder.id,
      line_number: index + 1,
      material_name: item.materialName,
      sku: item.sku,
      category: item.category || '',
      ordered_quantity: Number(item.orderedQuantity || 0),
      unit: item.unit,
      unit_cost: Number(item.unitCost || 0),
    }))

    const { error: itemsError } = await supabase
      .from('purchase_order_items')
      .insert(itemRows)

    if (itemsError) throw new Error(itemsError.message)
  }

  const createdPurchaseOrder = await findPurchaseOrderById(purchaseOrder.id)
  notifyPurchaseOrderChange()
  return createdPurchaseOrder
}

function computeMockPurchaseOrderStatus(purchaseOrderId, hasDiscrepancies = false) {
  const purchaseOrder = purchaseOrderDataSource.findById(purchaseOrderId)
  if (!purchaseOrder) return null

  const purchaseOrderItems = purchaseOrder.items || []
  const relatedReceipts = mockReceipts.filter(
    (receipt) => String(receipt.purchaseOrderId) === String(purchaseOrderId)
  )

  if (relatedReceipts.length === 0) {
    return {
      statusValue: 'entered',
      status: PURCHASE_ORDER_STATUS_LABELS.entered,
    }
  }

  const receiptDiscrepancyExists =
    hasDiscrepancies ||
    relatedReceipts.some((receipt) => receipt.hasDiscrepancy)

  const totalsByLineId = new Map()

  relatedReceipts.forEach((receipt) => {
    ;(receipt.items || []).forEach((item, index) => {
      const lineId = item.purchaseOrderItemId ?? index + 1
      const previous = totalsByLineId.get(lineId) || 0
      totalsByLineId.set(lineId, previous + Number(item.receivedQuantity || 0))
    })
  })

  const totalOrdered = purchaseOrderItems.reduce(
    (sum, item) => sum + Number(item.orderedQuantity || 0),
    0
  )
  const totalReceived = Array.from(totalsByLineId.values()).reduce(
    (sum, quantity) => sum + quantity,
    0
  )

  const hasOverReceipt = purchaseOrderItems.some((item, index) => {
    const lineId = item.id ?? index + 1
    return (totalsByLineId.get(lineId) || 0) > Number(item.orderedQuantity || 0)
  })

  if (totalReceived === 0) {
    return {
      statusValue: 'entered',
      status: PURCHASE_ORDER_STATUS_LABELS.entered,
    }
  }

  if (totalReceived < totalOrdered) {
    return {
      statusValue: 'partially_received',
      status: PURCHASE_ORDER_STATUS_LABELS.partially_received,
    }
  }

  if (receiptDiscrepancyExists || hasOverReceipt) {
    return {
      statusValue: 'closed_with_discrepancies',
      status: PURCHASE_ORDER_STATUS_LABELS.closed_with_discrepancies,
    }
  }

  return {
    statusValue: 'received',
    status: PURCHASE_ORDER_STATUS_LABELS.received,
  }
}

export async function completePurchaseOrder(purchaseOrderId, hasDiscrepancies = false) {
  if (!purchaseOrderId) return null

  if (USE_MOCK) {
    const purchaseOrder = purchaseOrderDataSource.findById(purchaseOrderId)
    if (!purchaseOrder) return null

    const nextStatus = computeMockPurchaseOrderStatus(purchaseOrderId, hasDiscrepancies)
    const updatedPurchaseOrder = normalizePurchaseOrder({
      ...purchaseOrder,
      ...nextStatus,
    })

    const completedPurchaseOrder = purchaseOrderDataSource.replaceById(
      purchaseOrderId,
      updatedPurchaseOrder
    )

    notifyPurchaseOrderChange()
    return completedPurchaseOrder
  }

  const purchaseOrder = await findPurchaseOrderById(purchaseOrderId)
  notifyPurchaseOrderChange()
  return purchaseOrder
}
