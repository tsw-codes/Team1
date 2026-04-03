export const rolePermissions = {
    admin: [
        "view_inventory", 
        "view_material_cost",
        "receive_inventory",
        "receive_inventory_warehouse",
        "receive_inventory_site",
        "adjust_inventory",
        "transfer_inventory",
        "manifest_inventory",
        "request_material",
        "create_outbound_manifest",
        "create_return_manifest",
        "create_warehouse_transfer_manifest",
        "confirm_outbound_transfer",
        "complete_outbound_transfer",
        "confirm_return_transfer",
        "complete_return_transfer",
        "confirm_warehouse_transfer",
        "complete_warehouse_transfer",
        "transfer_to_job_site",
        "transfer_to_warehouse",
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
        "receive_inventory_warehouse",
        "adjust_inventory",
        "manifest_inventory",
        "create_outbound_manifest",
        "create_warehouse_transfer_manifest",
        "confirm_return_transfer",
        "complete_return_transfer",
        "confirm_warehouse_transfer",
        "complete_warehouse_transfer",
        "transfer_inventory",
        "transfer_to_warehouse",
        "track_shipment",
    ],
    logisticsAssociate: [
        "view_inventory", 
        "receive_inventory",
        "receive_inventory_site",
        "adjust_inventory",
        "manifest_inventory",
        "create_return_manifest",
        "confirm_outbound_transfer",
        "complete_outbound_transfer",
        "transfer_inventory",
        "transfer_to_job_site",
        "track_shipment",
    ],
}

export function getPermissionsForRole(role) {
    return rolePermissions[role] ?? [];
}

export function hasPermission(permissions, permission) {
    return permissions.includes(permission);
}