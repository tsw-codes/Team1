import { supabase, USE_MOCK } from '../lib/supabaseClient'
import { snakeToCamel, camelToSnake } from '../utils/caseUtils'
import { mockReceipts } from "../data/mockReceipts"

const receiptDataSource = {
  getAll() {
    return mockReceipts
  },

  findById(id) {
    return (
      mockReceipts.find((receipt) => String(receipt.id) === String(id)) || null
    )
  },

  insert(receipt) {
    mockReceipts.unshift(receipt)
    return receipt
  },
}

function generateReceiptId() {
  const prefix = "RC"

  const matchingIds = receiptDataSource
    .getAll()
    .filter((receipt) => receipt.id?.startsWith(`${prefix}-`))
    .map((receipt) => {
      const numericPart = Number(receipt.id.split("-")[1])
      return Number.isNaN(numericPart) ? 0 : numericPart
    })

  const nextNumber =
    matchingIds.length > 0 ? Math.max(...matchingIds) + 1 : 1001

  return `${prefix}-${nextNumber}`
}

function normalizeReceipt(record) {
  return {
    ...record,
    purchaseOrderId: record.purchaseOrderId || "",
    statusValue: record.statusValue || 'confirmed',
    status: record.status || 'Confirmed',
    locationValue: record.locationValue || '',
    location: record.location || '',
    projectValue: record.projectValue || '',
    project: record.project || '',
    hasDiscrepancy: Boolean(record.hasDiscrepancy),
    notes: record.notes || '',
    items: Array.isArray(record.items) ? record.items : [],
  }
}

async function mapReceiptsWithItems(rows) {
  if (!rows?.length) return []

  const receipts = snakeToCamel(rows)
  const receiptIds = receipts.map((row) => row.id)

  const { data: itemRows, error: itemError } = await supabase
    .from('receipt_items')
    .select('*')
    .in('receipt_id', receiptIds)
    .order('receipt_id')
    .order('id')

  if (itemError) throw new Error(itemError.message)

  const itemsByReceiptId = (snakeToCamel(itemRows) || []).reduce((acc, item) => {
    const receiptId = item.receiptId
    if (!acc[receiptId]) acc[receiptId] = []
    acc[receiptId].push(item)
    return acc
  }, {})

  return receipts.map((receipt) => ({
    ...receipt,
    items: itemsByReceiptId[receipt.id] || [],
  }))
}

export async function getAllReceipts() {
  if (USE_MOCK) {
    return receiptDataSource.getAll().map(normalizeReceipt)
  }

  const { data, error } = await supabase
    .from('receipts_view')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return mapReceiptsWithItems(data)
}

export async function findReceiptById(id) {
  if (!id) return null

  if (USE_MOCK) {
    const receipt = receiptDataSource.findById(id)
    return receipt ? normalizeReceipt(receipt) : null
  }

  const { data, error } = await supabase
    .from('receipts_view')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return (await mapReceiptsWithItems([data]))?.[0] || null
}

export function buildReceiptPayload({
  deliveryForm,
  receivedItems,
  selectedLocationLabel = "",
  selectedProjectLabel = "",
  hasDiscrepancy = false,
}) {
  const actionableItems = receivedItems.filter((item) => !item.isCompleted)

  return {
    purchaseOrderId: deliveryForm.selectedPurchaseOrderId || "",
    vendor: deliveryForm.vendor,
    poNumber: deliveryForm.poNumber,
    deliveryDate: deliveryForm.deliveryDate,
    receivedBy: deliveryForm.receivedBy,

    locationValue: deliveryForm.locationValue,
    location: selectedLocationLabel,

    projectValue: deliveryForm.projectValue,
    project: selectedProjectLabel,

    hasDiscrepancy,
    notes: deliveryForm.notes,

    items: actionableItems.map((item, index) => ({
      id: index + 1,
      purchaseOrderItemId: item.purchaseOrderItemId || null,
      materialName: item.materialName,
      sku: item.sku,
      category: item.category || "",
      orderedQuantity: Number(item.orderedQuantity || 0),
      packingSlipQuantity: Number(item.packingSlipQuantity || 0),
      receivedQuantity: Number(item.receivedQuantity || 0),
      unit: item.unit,
      condition: item.condition,
      varianceReason: item.varianceReason || "",
      source: item.source,
    })),
  }
}

export async function createReceipt(receiptData) {
  if (USE_MOCK) {
    const newReceipt = normalizeReceipt({
      id: generateReceiptId(),
      statusValue: "confirmed",
      status: "Confirmed",
      ...receiptData,
    })

    return receiptDataSource.insert(newReceipt)
  }

  const { items = [], ...receiptFields } = receiptData
  const snakeFields = camelToSnake(receiptFields)

  delete snakeFields.location
  delete snakeFields.project
  delete snakeFields.status

  if (!snakeFields.purchase_order_id) {
    snakeFields.purchase_order_id = null
  }

  const { data: receipt, error } = await supabase
    .from('receipts')
    .insert(snakeFields)
    .select()
    .single()

  if (error) throw new Error(error.message)

  if (items.length > 0) {
    const itemRows = items.map((item) => ({
      receipt_id: receipt.id,
      purchase_order_item_id: item.purchaseOrderItemId || null,
      material_name: item.materialName,
      sku: item.sku,
      category: item.category || '',
      ordered_quantity_snapshot: Number(item.orderedQuantity || 0),
      packing_slip_quantity: Number(item.packingSlipQuantity || 0),
      received_quantity: Number(item.receivedQuantity || 0),
      unit: item.unit,
      condition: item.condition,
      variance_reason: item.varianceReason || '',
    }))

    const { error: itemsError } = await supabase
      .from('receipt_items')
      .insert(itemRows)

    if (itemsError) throw new Error(itemsError.message)
  }

  return findReceiptById(receipt.id)
}
