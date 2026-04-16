export const warehouseLocations = [
  "Warehouse A",
  "Warehouse B",
  "Warehouse C",
]

export const jobSiteLocations = [
  "South Garage",
  "West Tower",
  "Central Office",
  "North Annex",
]

export const allLocations = [...warehouseLocations, ...jobSiteLocations]

export function getAllowedSourceLocations(manifestMode) {
  switch (manifestMode) {
    case "return":
      return jobSiteLocations
    case "warehouse_transfer":
      return warehouseLocations
    case "outbound":
      return warehouseLocations
    default:
      return []
  }
}

export function getAllowedDestinationLocations(manifestMode) {
  switch (manifestMode) {
    case "return":
      return warehouseLocations
    case "warehouse_transfer":
      return warehouseLocations
    case "outbound":
      return jobSiteLocations
    default:
      return []
  }
}