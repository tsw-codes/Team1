const mockLocations = [
  {
    value: "WH-A",
    label: "Warehouse A",
    type: "warehouse",
    projects: [
      { value: "WH-A-001", label: "Warehouse A - Inventory"},
    ],
  },
  {
    value: "WH-B",
    label: "Warehouse B",
    type: "warehouse",
    projects: [
      { value: "WH-B-001", label: "Warehouse B - Inventory"},
    ],
  },
  {
    value: "WH-C",
    label: "Warehouse C",
    type: "warehouse",
    projects: [
      { value: "WH-C-001", label: "Warehouse C - Inventory"},
    ],
  },
  {
    value: "SG",
    label: "South Garage",
    type: "site",
    projects: [
      { value: "SG-001", label: "South Garage - Phase 1" },
      { value: "SG-002", label: "South Garage - Rough-In" },
    ],
  },
  {
    value: "WT",
    label: "West Tower",
    type: "site",
    projects: [
      { value: "WT-001", label: "West Tower - Core Buildout" },
      { value: "WT-002", label: "West Tower - HVAC Upgrade" },
    ],
  },
  {
    value: "CO",
    label: "Central Office",
    type: "site",
    projects: [
      { value: "CO-001", label: "Central Office - Renovation" },
    ],
  },
  {
    value: "NA",
    label: "North Annex",
    type: "site",
    projects: [
      { value: "NA-001", label: "North Annex - Expansion" },
    ],
  },
]

export function getLocationOptions() {
  return mockLocations.map((location) => ({
    value: location.value,
    label: location.label,
  }))
}

export function getLocationByValue(value) {
  return mockLocations.find((location) => location.value === value) || null
}

export function getProjectOptionsForLocation(locationValue) {
  const location = getLocationByValue(locationValue)
  return location?.projects || []
}

export function getProjectByValue(projectValue) {
  for (const location of mockLocations) {
    const match = location.projects.find((project) => project.value === projectValue)
    if (match) return match
  }

  return null
}

export function getLocationOptionsForPermissions(permissions = []) {
  const canReceiveAtWarehouse = permissions.includes("receive_inventory_warehouse")
  const canReceiveAtSite = permissions.includes("receive_inventory_site")

  return mockLocations
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
  return mockLocations
    .filter((location) => location.type === "site")
    .map(({ value, label, type }) => ({
      value, 
      label,
      type,
    }))
}

export function getWarehouseLocationOptions() {
  return mockLocations
    .filter((location) => location.type === "warehouse")
    .map(({ value, label, type }) => ({
      value, 
      label,
      type,
    }))
}