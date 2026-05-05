import { supabase, USE_MOCK } from '../lib/supabaseClient'
import { mockLocations } from '../data/mockLocations'

let mockLocationRecords = mockLocations.map((location) => ({
  ...location,
  projects: [...(location.projects || [])],
}))

const LOCATION_REFERENCE_CHECKS = [
  { table: 'projects', column: 'location_value', label: 'projects' },
  { table: 'inventory_items', column: 'location_value', label: 'inventory records' },
  { table: 'requests', column: 'location_value', label: 'requests' },
  { table: 'requests', column: 'source_warehouse_value', label: 'request source warehouses' },
  { table: 'manifests', column: 'location_value', label: 'manifests' },
  { table: 'manifests', column: 'source_location_value', label: 'manifest source locations' },
  { table: 'manifests', column: 'destination_location_value', label: 'manifest destination locations' },
  { table: 'transfers', column: 'location_value', label: 'transfers' },
  { table: 'transfers', column: 'source_location_value', label: 'transfer source locations' },
  { table: 'transfers', column: 'destination_location_value', label: 'transfer destination locations' },
  { table: 'purchase_orders', column: 'location_value', label: 'purchase orders' },
  { table: 'receipts', column: 'location_value', label: 'receipts' },
  { table: 'receipt_item_serials', column: 'location_value', label: 'serial records' },
]

function normalizeLocationInput(locationData = {}) {
  return {
    value: String(locationData.value || '').trim().toUpperCase(),
    label: String(locationData.label || '').trim(),
    type: String(locationData.type || '').trim(),
  }
}

function buildLocationCodeBase(label = '') {
  const words = String(label || '')
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean)

  if (words.length === 0) {
    return 'LOC'
  }

  const initials = words
    .map((word) => word[0])
    .join('')
    .toUpperCase()

  return initials || 'LOC'
}

function buildNextLocationCode(existingValues = [], label = '') {
  const prefix = buildLocationCodeBase(label)
  const matchingNumbers = existingValues
    .map((value) => String(value || '').trim().toUpperCase())
    .filter((value) => value.startsWith(`${prefix}-`))
    .map((value) => Number(value.split('-')[1]))
    .filter((value) => !Number.isNaN(value))

  const nextNumber = matchingNumbers.length > 0 ? Math.max(...matchingNumbers) + 1 : 1
  return `${prefix}-${String(nextNumber).padStart(3, '0')}`
}

function countMockLocationReferences(locationValue) {
  const location = mockLocationRecords.find((entry) => entry.value === locationValue)
  const projectCount = location?.projects?.length || 0

  return {
    canDelete: projectCount === 0,
    totalReferences: projectCount,
    references: projectCount > 0 ? [{ label: 'projects', count: projectCount }] : [],
  }
}

/**
 * Returns all locations as { value, label } options for dropdowns.
 */
export async function getLocationOptions() {
  if (USE_MOCK) {
    return mockLocationRecords.map((location) => ({
      value: location.value,
      label: location.label,
    }))
  }

  const { data, error } = await supabase
    .from('locations')
    .select('value, label')
    .order('value')

  if (error) throw new Error('Failed to load locations.')
  return data
}

/**
 * Finds a location by its value key.
 * Returns { value, label, type, projects: [...] } or null.
 */
export async function getLocationByValue(value) {
  if (!value) return null

  if (USE_MOCK) {
    return mockLocationRecords.find((location) => location.value === value) || null
  }

  const { data: location, error } = await supabase
    .from('locations')
    .select('value, label, type')
    .eq('value', value)
    .single()

  if (error) return null

  const { data: projects, error: projError } = await supabase
    .from('projects')
    .select('value, label')
    .eq('location_value', value)
    .order('value')

  if (projError) throw new Error('Failed to load projects for location.')

  return { ...location, projects: projects || [] }
}

/**
 * Returns project options for a given location value.
 */
export async function getProjectOptionsForLocation(locationValue) {
  if (!locationValue) return []

  if (USE_MOCK) {
    const location = mockLocationRecords.find((l) => l.value === locationValue)
    return location?.projects || []
  }

  const { data, error } = await supabase
    .from('projects')
    .select('value, label')
    .eq('location_value', locationValue)
    .order('value')

  if (error) throw new Error('Failed to load projects.')
  return data || []
}

/**
 * Finds a project by its value key.
 * Returns { value, label } or null.
 */
export async function getProjectByValue(projectValue) {
  if (!projectValue) return null

  if (USE_MOCK) {
    for (const location of mockLocationRecords) {
      const match = location.projects.find((project) => project.value === projectValue)
      if (match) return match
    }
    return null
  }

  const { data, error } = await supabase
    .from('projects')
    .select('value, label')
    .eq('value', projectValue)
    .single()

  if (error) return null
  return data
}

/**
 * Returns locations filtered by receive permissions.
 * Checks receive_inventory_warehouse and receive_inventory_site permissions.
 */
export async function getLocationOptionsForPermissions(permissions = []) {
  const canReceiveAtWarehouse = permissions.includes("receive_inventory_warehouse")
  const canReceiveAtSite = permissions.includes("receive_inventory_site")

  if (USE_MOCK) {
    return mockLocationRecords
      .filter((location) => {
        if (location.type === "warehouse" && canReceiveAtWarehouse) return true
        if (location.type === "site" && canReceiveAtSite) return true
        return false
      })
      .map(({ value, label, type }) => ({ value, label, type }))
  }

  const types = []
  if (canReceiveAtWarehouse) types.push('warehouse')
  if (canReceiveAtSite) types.push('site')

  if (types.length === 0) return []

  const { data, error } = await supabase
    .from('locations')
    .select('value, label, type')
    .in('type', types)
    .order('value')

  if (error) throw new Error('Failed to load locations.')
  return data || []
}

/**
 * Returns all site locations.
 */
export async function getSiteLocationOptions() {
  if (USE_MOCK) {
    return mockLocationRecords
      .filter((location) => location.type === "site")
      .map(({ value, label, type }) => ({ value, label, type }))
  }

  const { data, error } = await supabase
    .from('locations')
    .select('value, label, type')
    .eq('type', 'site')
    .order('value')

  if (error) throw new Error('Failed to load site locations.')
  return data || []
}

/**
 * Returns all warehouse locations.
 */
export async function getWarehouseLocationOptions() {
  if (USE_MOCK) {
    return mockLocationRecords
      .filter((location) => location.type === "warehouse")
      .map(({ value, label, type }) => ({ value, label, type }))
  }

  const { data, error } = await supabase
    .from('locations')
    .select('value, label, type')
    .eq('type', 'warehouse')
    .order('value')

  if (error) throw new Error('Failed to load warehouse locations.')
  return data || []
}

export async function getAllLocationsDetailed() {
  if (USE_MOCK) {
    return mockLocationRecords
      .map((location) => ({
        value: location.value,
        label: location.label,
        type: location.type,
        createdAt: null,
        projectCount: location.projects?.length || 0,
        projects: (location.projects || []).map((project) => project.label),
        status: 'Active',
      }))
      .sort((a, b) => a.value.localeCompare(b.value))
  }

  const [{ data: locations, error: locationError }, { data: projects, error: projectError }] =
    await Promise.all([
      supabase.from('locations').select('value, label, type, created_at').order('value'),
      supabase.from('projects').select('value, label, location_value'),
    ])

  if (locationError) throw new Error('Failed to load locations.')
  if (projectError) throw new Error('Failed to load project counts.')

  const projectCountByLocation = (projects || []).reduce((acc, project) => {
    const key = project.location_value
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const projectLabelsByLocation = (projects || []).reduce((acc, project) => {
    const key = project.location_value
    if (!acc[key]) acc[key] = []
    acc[key].push(project.label || project.value)
    return acc
  }, {})

  return (locations || []).map((location) => ({
    value: location.value,
    label: location.label,
    type: location.type,
    createdAt: location.created_at,
    projectCount: projectCountByLocation[location.value] || 0,
    projects: projectLabelsByLocation[location.value] || [],
    status: 'Active',
  }))
}

export async function generateNextLocationCode(label = '') {
  if (USE_MOCK) {
    return buildNextLocationCode(
      mockLocationRecords.map((location) => location.value),
      label
    )
  }

  const { data, error } = await supabase
    .from('locations')
    .select('value')

  if (error) throw new Error('Failed to generate a new location code.')
  return buildNextLocationCode((data || []).map((entry) => entry.value), label)
}

export async function createLocation(locationData) {
  const normalized = normalizeLocationInput(locationData)

  if (!normalized.value || !normalized.label || !normalized.type) {
    throw new Error('Location code, label, and type are required.')
  }

  if (USE_MOCK) {
    const existing = mockLocationRecords.find((location) => location.value === normalized.value)
    if (existing) throw new Error('A location with that code already exists.')

    const createdLocation = {
      ...normalized,
      projects: [],
    }

    mockLocationRecords = [...mockLocationRecords, createdLocation]
    return { ...createdLocation, projectCount: 0, status: 'Active' }
  }

  const { data, error } = await supabase
    .from('locations')
    .insert(normalized)
    .select('value, label, type, created_at')
    .single()

  if (error) throw new Error(error.message)

  return {
    value: data.value,
    label: data.label,
    type: data.type,
    createdAt: data.created_at,
    projectCount: 0,
    status: 'Active',
  }
}

export async function updateLocation(locationValue, updates) {
  const normalizedUpdates = normalizeLocationInput({
    value: locationValue,
    label: updates.label,
    type: updates.type,
  })

  if (!locationValue) throw new Error('Location code is required.')
  if (!normalizedUpdates.label || !normalizedUpdates.type) {
    throw new Error('Location label and type are required.')
  }

  if (USE_MOCK) {
    const index = mockLocationRecords.findIndex((location) => location.value === locationValue)
    if (index === -1) throw new Error('Location not found.')

    mockLocationRecords[index] = {
      ...mockLocationRecords[index],
      label: normalizedUpdates.label,
      type: normalizedUpdates.type,
    }

    return {
      value: mockLocationRecords[index].value,
      label: mockLocationRecords[index].label,
      type: mockLocationRecords[index].type,
      createdAt: null,
      projectCount: mockLocationRecords[index].projects?.length || 0,
      status: 'Active',
    }
  }

  const { data, error } = await supabase
    .from('locations')
    .update({
      label: normalizedUpdates.label,
      type: normalizedUpdates.type,
    })
    .eq('value', locationValue)
    .select('value, label, type, created_at')
    .single()

  if (error) throw new Error(error.message)

  const projects = await getProjectOptionsForLocation(data.value)

  return {
    value: data.value,
    label: data.label,
    type: data.type,
    createdAt: data.created_at,
    projectCount: projects.length,
    status: 'Active',
  }
}

export async function getLocationDependencySummary(locationValue) {
  if (!locationValue) {
    return { canDelete: false, totalReferences: 0, references: [] }
  }

  if (USE_MOCK) {
    return countMockLocationReferences(locationValue)
  }

  const results = await Promise.all(
    LOCATION_REFERENCE_CHECKS.map(async ({ table, column, label }) => {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq(column, locationValue)

      if (error) {
        throw new Error(`Failed to check location dependencies: ${error.message}`)
      }

      return { label, count: count || 0 }
    })
  )

  const references = results.filter((entry) => entry.count > 0)
  const totalReferences = references.reduce((sum, entry) => sum + entry.count, 0)

  return {
    canDelete: totalReferences === 0,
    totalReferences,
    references,
  }
}

export async function deleteLocation(locationValue) {
  if (!locationValue) throw new Error('Location code is required.')

  const dependencySummary = await getLocationDependencySummary(locationValue)

  if (!dependencySummary.canDelete) {
    const dependencyLabels = dependencySummary.references.map((entry) => entry.label).join(', ')
    throw new Error(
      `Location cannot be deleted because it is used by ${dependencyLabels}. Deactivation is planned for a future update.`
    )
  }

  if (USE_MOCK) {
    mockLocationRecords = mockLocationRecords.filter((location) => location.value !== locationValue)
    return true
  }

  const { error } = await supabase
    .from('locations')
    .delete()
    .eq('value', locationValue)

  if (error) throw new Error(error.message)
  return true
}
