import { supabase, USE_MOCK } from '../lib/supabaseClient'
import { mockLocations } from '../data/mockLocations'

/**
 * Returns all locations as { value, label } options for dropdowns.
 */
export async function getLocationOptions() {
  if (USE_MOCK) {
    return mockLocations.map((location) => ({
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
    return mockLocations.find((location) => location.value === value) || null
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
    const location = mockLocations.find((l) => l.value === locationValue)
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
    for (const location of mockLocations) {
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
    return mockLocations
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
    return mockLocations
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
    return mockLocations
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
