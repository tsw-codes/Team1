import { supabase, USE_MOCK } from '../lib/supabaseClient'
import { snakeToCamel, camelToSnake } from '../utils/caseUtils'

let mockReceiptItemSerials = []

const receiptItemSerialDataSource = {
  getAll() {
    return mockReceiptItemSerials
  },

  findById(id) {
    return (
      mockReceiptItemSerials.find((serial) => String(serial.id) === String(id)) || null
    )
  },

  insert(serial) {
    mockReceiptItemSerials.unshift(serial)
    return serial
  },

  insertMany(serials) {
    const normalized = Array.isArray(serials) ? serials : []
    mockReceiptItemSerials = [...normalized, ...mockReceiptItemSerials]
    return normalized
  },

  replaceById(id, updatedSerial) {
    const index = mockReceiptItemSerials.findIndex(
      (serial) => String(serial.id) === String(id)
    )

    if (index === -1) return null

    mockReceiptItemSerials[index] = updatedSerial
    return mockReceiptItemSerials[index]
  },

  removeById(id) {
    const existing = this.findById(id)
    if (!existing) return null

    mockReceiptItemSerials = mockReceiptItemSerials.filter(
      (serial) => String(serial.id) !== String(id)
    )

    return existing
  },
}

function generateReceiptItemSerialId() {
  const numericIds = receiptItemSerialDataSource
    .getAll()
    .map((serial) => Number(serial.id))
    .filter((id) => !Number.isNaN(id))

  return numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1
}

function normalizeReceiptItemSerial(record) {
  return {
    ...record,
    receiptId: record.receiptId || '',
    receiptItemId: Number(record.receiptItemId || 0),
    purchaseOrderItemId: record.purchaseOrderItemId ?? null,
    projectValue: record.projectValue || '',
    locationValue: record.locationValue || '',
    serialNumber: String(record.serialNumber || '').trim(),
    labelPhotoAttachmentId: record.labelPhotoAttachmentId ?? null,
  }
}

export function buildReceiptItemSerialPayload({
  receiptId,
  receiptItemId,
  purchaseOrderItemId = null,
  projectValue = '',
  locationValue = '',
  serialNumber,
  labelPhotoAttachmentId = null,
}) {
  return {
    receiptId,
    receiptItemId: Number(receiptItemId),
    purchaseOrderItemId,
    projectValue,
    locationValue,
    serialNumber: String(serialNumber || '').trim(),
    labelPhotoAttachmentId,
  }
}

export function groupSerialsByReceiptItem(serialRows = []) {
  return serialRows.reduce((acc, serial) => {
    const receiptItemId = Number(serial.receiptItemId || 0)
    if (!acc[receiptItemId]) acc[receiptItemId] = []
    acc[receiptItemId].push(serial)
    return acc
  }, {})
}

export async function getReceiptSerialsForReceipt(receiptId) {
  if (!receiptId) return []

  if (USE_MOCK) {
    return receiptItemSerialDataSource
      .getAll()
      .filter((serial) => String(serial.receiptId) === String(receiptId))
      .map(normalizeReceiptItemSerial)
  }

  const { data, error } = await supabase
    .from('receipt_item_serials')
    .select('*')
    .eq('receipt_id', receiptId)
    .order('id')

  if (error) throw new Error(error.message)
  return snakeToCamel(data || [])
}

export async function getReceiptItemSerials(receiptItemId) {
  if (!receiptItemId) return []

  if (USE_MOCK) {
    return receiptItemSerialDataSource
      .getAll()
      .filter((serial) => String(serial.receiptItemId) === String(receiptItemId))
      .map(normalizeReceiptItemSerial)
  }

  const { data, error } = await supabase
    .from('receipt_item_serials')
    .select('*')
    .eq('receipt_item_id', receiptItemId)
    .order('id')

  if (error) throw new Error(error.message)
  return snakeToCamel(data || [])
}

export async function createReceiptItemSerial(serialData) {
  if (USE_MOCK) {
    const createdSerial = normalizeReceiptItemSerial({
      id: generateReceiptItemSerialId(),
      ...serialData,
    })

    return receiptItemSerialDataSource.insert(createdSerial)
  }

  const snakeFields = camelToSnake(serialData)
  const { data, error } = await supabase
    .from('receipt_item_serials')
    .insert(snakeFields)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return snakeToCamel(data)
}

export async function createReceiptItemSerials(serialRows = []) {
  if (!Array.isArray(serialRows) || serialRows.length === 0) return []

  if (USE_MOCK) {
    const createdSerials = serialRows.map((serialData) =>
      normalizeReceiptItemSerial({
        id: generateReceiptItemSerialId(),
        ...serialData,
      })
    )

    return receiptItemSerialDataSource.insertMany(createdSerials)
  }

  const snakeRows = camelToSnake(serialRows)
  const { data, error } = await supabase
    .from('receipt_item_serials')
    .insert(snakeRows)
    .select()

  if (error) throw new Error(error.message)
  return snakeToCamel(data || [])
}

export async function updateReceiptItemSerial(id, updates) {
  if (!id) return null

  if (USE_MOCK) {
    const existing = receiptItemSerialDataSource.findById(id)
    if (!existing) return null

    return receiptItemSerialDataSource.replaceById(
      id,
      normalizeReceiptItemSerial({
        ...existing,
        ...updates,
      })
    )
  }

  const snakeUpdates = camelToSnake(updates)
  const { data, error } = await supabase
    .from('receipt_item_serials')
    .update(snakeUpdates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return snakeToCamel(data)
}

export async function deleteReceiptItemSerial(id) {
  if (!id) return null

  if (USE_MOCK) {
    return receiptItemSerialDataSource.removeById(id)
  }

  const { data, error } = await supabase
    .from('receipt_item_serials')
    .delete()
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return snakeToCamel(data)
}
