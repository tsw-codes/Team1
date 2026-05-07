export const rolePermissions = {
    admin: [
        "view_inventory",
        "view_material_cost",
        "receive_inventory",
        "receive_inventory_warehouse",
        "receive_inventory_site",
        "adjust_inventory",
        "adjust_inventory_warehouse",
        "adjust_inventory_site",
        "transfer_inventory",
        "manifest_inventory",
        "request_material",
        "approve_requests",
        "view_pending_requests",
        "upload_purchase_orders",
        "match_purchase_orders",
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
        "manage_projects",
        "view_audit_log",
    ],

    projectManager: [
        "view_inventory",
        "view_material_cost",
        "approve_requests",
        "view_pending_requests",
        "upload_purchase_orders",
        "match_purchase_orders",
        "track_shipment",
    ],

    warehouseManager: [
        "view_inventory",
        "receive_inventory",
        "receive_inventory_warehouse",
        "adjust_inventory",
        "adjust_inventory_warehouse",
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
        "adjust_inventory_site",
        "manifest_inventory",
        "create_return_manifest",
        "confirm_outbound_transfer",
        "complete_outbound_transfer",
        "transfer_inventory",
        "transfer_to_job_site",
        "track_shipment",
    ],

    logisticsForeman: [
        "view_inventory",
        "request_material",
        "track_shipment",
    ],

    readonly: [
        "view_inventory",
        "view_material_cost",
        "track_shipment",
        "view_audit_log",
    ],
}

export function getPermissionsForRole(role) {
    return rolePermissions[role] ?? []
}

export function hasPermission(permissions, permission) {
    return permissions.includes(permission)
}