/**
 * Converts a snake_case string to camelCase.
 * "status_value" → "statusValue"
 */
function toCamel(str) {
  return str.replace(/_([a-z])/g, (_, char) => char.toUpperCase())
}

/**
 * Converts a camelCase string to snake_case.
 * "statusValue" → "status_value"
 */
function toSnake(str) {
  return str.replace(/[A-Z]/g, (char) => '_' + char.toLowerCase())
}

/**
 * Recursively converts all keys in an object from snake_case to camelCase.
 * Handles nested objects and arrays.
 *
 * { status_value: "approved", request_items: [{ inventory_item_id: 1 }] }
 * → { statusValue: "approved", requestItems: [{ inventoryItemId: 1 }] }
 */
export function snakeToCamel(obj) {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(snakeToCamel)
  if (typeof obj !== 'object') return obj

  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      toCamel(key),
      snakeToCamel(value),
    ])
  )
}

/**
 * Recursively converts all keys in an object from camelCase to snake_case.
 * Handles nested objects and arrays.
 *
 * { statusValue: "approved", requestItems: [{ inventoryItemId: 1 }] }
 * → { status_value: "approved", request_items: [{ inventory_item_id: 1 }] }
 */
export function camelToSnake(obj) {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map(camelToSnake)
  if (typeof obj !== 'object') return obj

  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      toSnake(key),
      camelToSnake(value),
    ])
  )
}
