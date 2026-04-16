import { mockMaterials } from "../data/mockMaterials"
import { materialCategoryOptions } from "../data/materialCategories"

const materialDataSource = {
  getAll() {
    return mockMaterials
  },

  findById(id) {
    return (
      mockMaterials.find((material) => String(material.id) === String(id)) || null
    )
  },

  insert(material) {
    mockMaterials.unshift(material)
    return material
  },
}

function normalizeString(value) {
  return String(value || "").trim().toLowerCase()
}

function generateMaterialId() {
  const prefix = "MAT"

  const matchingIds = materialDataSource
    .getAll()
    .filter((material) => material.id?.startsWith(`${prefix}-`))
    .map((material) => {
      const numericPart = Number(material.id.split("-")[1])
      return Number.isNaN(numericPart) ? 0 : numericPart
    })

  const nextNumber =
    matchingIds.length > 0 ? Math.max(...matchingIds) + 1 : 1001

  return `${prefix}-${nextNumber}`
}

export function getAllMaterials() {
  return materialDataSource.getAll()
}

export function getMaterialCategoryOptions() {
  return materialCategoryOptions
}

export function findMaterialById(id) {
  return materialDataSource.findById(id)
}

export function findMaterialBySku(sku) {
  const normalizedSku = normalizeString(sku)
  if (!normalizedSku) return null

  return (
    materialDataSource
      .getAll()
      .find((material) => normalizeString(material.sku) === normalizedSku) || null
  )
}

export function findMaterialByName(name) {
  const normalizedName = normalizeString(name)
  if (!normalizedName) return null

  return (
    materialDataSource
      .getAll()
      .find((material) => normalizeString(material.name) === normalizedName) || null
  )
}

export function matchMaterial({ sku, materialName }) {
  const materialBySku = findMaterialBySku(sku)
  if (materialBySku) return materialBySku

  return findMaterialByName(materialName)
}

export function createMaterial({
  name,
  sku,
  category,
  unit,
  defaultUnitCost = 0,
}) {
  const newMaterial = {
    id: generateMaterialId(),
    name: String(name || "").trim(),
    sku: String(sku || "").trim(),
    category: String(category || "").trim(),
    unit: String(unit || "").trim(),
    defaultUnitCost: Number(defaultUnitCost || 0),
  }

  return materialDataSource.insert(newMaterial)
}

export function matchOrCreateMaterial({
  sku,
  materialName,
  category,
  unit,
  defaultUnitCost = 0,
}) {
  const existingMaterial = matchMaterial({ sku, materialName })
  if (existingMaterial) return existingMaterial

  return createMaterial({
    name: materialName,
    sku,
    category,
    unit,
    defaultUnitCost,
  })
}