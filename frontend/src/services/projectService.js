import { mockLocations } from "../data/mockLocations"

const projectDataSource = {
  getAllLocations() {
    return mockLocations
  },

  findLocationByValue(value) {
    return mockLocations.find((location) => location.value === value) || null
  },
}

export function getLocationOptions() {
  return projectDataSource.getAllLocations().map((location) => ({
    value: location.value,
    label: location.label,
  }))
}

export function getLocationByValue(value) {
  return projectDataSource.findLocationByValue(value)
}

export function getProjectOptionsForLocation(locationValue) {
  const location = projectDataSource.findLocationByValue(locationValue)
  return location?.projects || []
}

export function getProjectByValue(projectValue) {
  for (const location of projectDataSource.getAllLocations()) {
    const match =
      location.projects.find((project) => project.value === projectValue) || null

    if (match) return match
  }

  return null
}

export function getLocationOptionsForPermissions(permissions = []) {
  const canReceiveAtWarehouse = permissions.includes("receive_inventory_warehouse")
  const canReceiveAtSite = permissions.includes("receive_inventory_site")

  return projectDataSource
    .getAllLocations()
    .filter((location) => {
      if (location.type === "warehouse" && canReceiveAtWarehouse) return true
      if (location.type === "site" && canReceiveAtSite) return true
      return false
    })
    .map(({ value, label, type }) => ({
      value,
      label,
      type,
    }))
}

export function getSiteLocationOptions() {
  return projectDataSource
    .getAllLocations()
    .filter((location) => location.type === "site")
    .map(({ value, label, type }) => ({
      value,
      label,
      type,
    }))
}

export function getWarehouseLocationOptions() {
  return projectDataSource
    .getAllLocations()
    .filter((location) => location.type === "warehouse")
    .map(({ value, label, type }) => ({
      value,
      label,
      type,
    }))
}