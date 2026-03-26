export const rolePermissions = {
    admin: [
        "view_inventory", 
        "view_material_cost",
        "receive_inventory",
        "adjust_inventory",
        "transfer_inventory",
        "manifest_inventory",
        "request_material",
        "create_shipment",
        "track_shipment",
        "manage_users",
        "manage_locations",
    ],
    projectManager: [
        "view_inventory", 
        "view_material_cost",
        "request_material",
        "track_shipment",
    ],
    warehouseManager: [
        "view_inventory", 
        "receive_inventory",
        "adjust_inventory",
        "manifest_inventory",
        "create_shipment",
        "track_shipment",
    ],
    logisticsAssociate: [
        "view_inventory", 
        "receive_inventory",
        "adjust_inventory",
        "transfer_inventory",
        "track_shipment",
    ],
}

export function getPermissionsForRole(role) {
    return rolePermissions[role] ?? [];
}

export function hasPermission(permissions, permission) {
    return permissions.includes(permission);
}