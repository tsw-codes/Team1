import { supabase, USE_MOCK } from '../lib/supabaseClient'
import { snakeToCamel, camelToSnake } from '../utils/caseUtils'

const ATTACHMENT_TYPES = ['delivery_photo', 'item_photo', 'label_photo']

let mockReceiptAttachments = []

const receiptAttachmentDataSource = {
  getAll() {
    return mockReceiptAttachments
  },

  findById(id) {
    return (
      mockReceiptAttachments.find((attachment) => String(attachment.id) === String(id)) || null
    )
  },

  insert(attachment) {
    mockReceiptAttachments.unshift(attachment)
    return attachment
  },

  insertMany(attachments) {
    const normalized = Array.isArray(attachments) ? attachments : []
    mockReceiptAttachments = [...normalized, ...mockReceiptAttachments]
    return normalized
  },

  removeById(id) {
    const existing = this.findById(id)
    if (!existing) return null

    mockReceiptAttachments = mockReceiptAttachments.filter(
      (attachment) => String(attachment.id) !== String(id)
    )

    return existing
  },
}

function generateReceiptAttachmentId() {
  const numericIds = receiptAttachmentDataSource
    .getAll()
    .map((attachment) => Number(attachment.id))
    .filter((id) => !Number.isNaN(id))

  return numericIds.length > 0 ? Math.max(...numericIds) + 1 : 1
}

function normalizeReceiptAttachment(record) {
  return {
    ...record,
    receiptId: record.receiptId || '',
    receiptItemId: record.receiptItemId ?? null,
    receiptItemSerialId: record.receiptItemSerialId ?? null,
    attachmentType: record.attachmentType || 'delivery_photo',
    fileName: record.fileName || '',
    filePath: record.filePath || '',
    contentType: record.contentType || '',
  }
}

export function buildReceiptAttachmentPayload({
  receiptId,
  receiptItemId = null,
  receiptItemSerialId = null,
  attachmentType,
  fileName,
  filePath,
  contentType = '',
}) {
  return {
    receiptId,
    receiptItemId,
    receiptItemSerialId,
    attachmentType,
    fileName: String(fileName || '').trim(),
    filePath: String(filePath || '').trim(),
    contentType: String(contentType || '').trim(),
  }
}

export function groupAttachmentsByScope(attachmentRows = []) {
  return attachmentRows.reduce(
    (acc, attachment) => {
      if (attachment.receiptItemSerialId) {
        if (!acc.bySerialId[attachment.receiptItemSerialId]) {
          acc.bySerialId[attachment.receiptItemSerialId] = []
        }
        acc.bySerialId[attachment.receiptItemSerialId].push(attachment)
        return acc
      }

      if (attachment.receiptItemId) {
        if (!acc.byReceiptItemId[attachment.receiptItemId]) {
          acc.byReceiptItemId[attachment.receiptItemId] = []
        }
        acc.byReceiptItemId[attachment.receiptItemId].push(attachment)
        return acc
      }

      acc.deliveryLevel.push(attachment)
      return acc
    },
    {
      deliveryLevel: [],
      byReceiptItemId: {},
      bySerialId: {},
    }
  )
}

function validateAttachmentType(attachmentType) {
  if (!ATTACHMENT_TYPES.includes(attachmentType)) {
    throw new Error(`Unsupported attachment type: ${attachmentType}`)
  }
}

export async function getReceiptAttachments(receiptId) {
  if (!receiptId) return []

  if (USE_MOCK) {
    return receiptAttachmentDataSource
      .getAll()
      .filter((attachment) => String(attachment.receiptId) === String(receiptId))
      .map(normalizeReceiptAttachment)
  }

  const { data, error } = await supabase
    .from('receipt_attachments')
    .select('*')
    .eq('receipt_id', receiptId)
    .order('id')

  if (error) throw new Error(error.message)
  return snakeToCamel(data || [])
}

export async function getReceiptItemAttachments(receiptItemId) {
  if (!receiptItemId) return []

  if (USE_MOCK) {
    return receiptAttachmentDataSource
      .getAll()
      .filter((attachment) => String(attachment.receiptItemId) === String(receiptItemId))
      .map(normalizeReceiptAttachment)
  }

  const { data, error } = await supabase
    .from('receipt_attachments')
    .select('*')
    .eq('receipt_item_id', receiptItemId)
    .order('id')

  if (error) throw new Error(error.message)
  return snakeToCamel(data || [])
}

export async function getReceiptSerialAttachments(receiptItemSerialId) {
  if (!receiptItemSerialId) return []

  if (USE_MOCK) {
    return receiptAttachmentDataSource
      .getAll()
      .filter(
        (attachment) =>
          String(attachment.receiptItemSerialId) === String(receiptItemSerialId)
      )
      .map(normalizeReceiptAttachment)
  }

  const { data, error } = await supabase
    .from('receipt_attachments')
    .select('*')
    .eq('receipt_item_serial_id', receiptItemSerialId)
    .order('id')

  if (error) throw new Error(error.message)
  return snakeToCamel(data || [])
}

export async function createReceiptAttachment(attachmentData) {
  validateAttachmentType(attachmentData.attachmentType)

  if (USE_MOCK) {
    const createdAttachment = normalizeReceiptAttachment({
      id: generateReceiptAttachmentId(),
      ...attachmentData,
    })

    return receiptAttachmentDataSource.insert(createdAttachment)
  }

  const snakeFields = camelToSnake(attachmentData)
  const { data, error } = await supabase
    .from('receipt_attachments')
    .insert(snakeFields)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return snakeToCamel(data)
}

export async function createReceiptAttachments(attachmentRows = []) {
  if (!Array.isArray(attachmentRows) || attachmentRows.length === 0) return []

  attachmentRows.forEach((attachment) => validateAttachmentType(attachment.attachmentType))

  if (USE_MOCK) {
    const createdAttachments = attachmentRows.map((attachmentData) =>
      normalizeReceiptAttachment({
        id: generateReceiptAttachmentId(),
        ...attachmentData,
      })
    )

    return receiptAttachmentDataSource.insertMany(createdAttachments)
  }

  const snakeRows = camelToSnake(attachmentRows)
  const { data, error } = await supabase
    .from('receipt_attachments')
    .insert(snakeRows)
    .select()

  if (error) throw new Error(error.message)
  return snakeToCamel(data || [])
}

export async function deleteReceiptAttachment(id) {
  if (!id) return null

  if (USE_MOCK) {
    return receiptAttachmentDataSource.removeById(id)
  }

  const { data, error } = await supabase
    .from('receipt_attachments')
    .delete()
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return snakeToCamel(data)
}
