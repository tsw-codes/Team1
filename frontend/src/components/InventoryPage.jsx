import { useMemo, useState } from "react"
import { hasPermission } from "../auth/permissions"

import { mockInventory } from "../data/mockInventory"

const isMobile = window.innerWidth <= 900

const inventoryData = mockInventory

function getStatusClass(status) {
    switch (status) {
        case "Available":
            return "status-badge available"
        case "Low Stock":
            return "status-badge low-stock"
        case "Reserved":
            return "status-badge reserved"
        case "In Transit":
            return "status-badge in-transit"
        default:
            return "status-badge"
    }
}

function InventoryModal({
    item,
    onClose,
    canViewMaterialCost,
    canAdjustInventory,
    canTransferInventory,
    canCreateShipment,
}) {
    if (!item) return null

    return (
        <div className="inventory-modal-overlay" onClick={onClose}>
            <div className="inventory-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="section-heading-row">
                    <h2 className="section-title">Item Details</h2>
                    <button className="text-button" onClick={onClose}>Close</button>
                </div>

                <h3 className="inventory-item-title">{item.name}</h3>
                <p className="inventory-item-subtext">SKU: {item.sku}</p>
                <span className={getStatusClass(item.status)}>{item.status}</span>

                <div className="inventory-card-details detail-panel-grid">
                    <div>
                        <span className="detail-label">Quantity</span>
                        <span className="detail-value">{item.quantity} {item.unit}</span>
                    </div>

                    {canViewMaterialCost && (
                        <>
                            <div className="detail-row">
                                <span className="detail-label">Unit Cost: </span>
                                <span className="detail-value">{item.unitCost} / {item.unit}</span>
                            </div>

                            <div className="detail-row">
                                <span className="detail-label">Total Cost: </span>
                                <span className="detail-value">{item.totalCost}</span>
                            </div>
                        </>
                    )}

                    <div>
                        <span className="detail-label">Category</span>
                        <span className="detail-value">{item.category}</span>
                    </div>

                    <div>
                        <span className="detail-label">Project</span>
                        <span className="detail-value">{item.project}</span>
                    </div>

                    <div>
                        <span className="detail-label">Updated</span>
                        <span className="detail-value">{item.updatedAt}</span>
                    </div>

                </div>

                <div className="inventory-location-block">
                    <span className="detail-label">Location</span>
                    <span className="detail-value">{item.location}</span>
                </div>

                {(canAdjustInventory || canTransferInventory || canCreateShipment) && (
                    <div className="detail-actions">
                        {canAdjustInventory && (
                            <button className="primary-button">Adjust Inventory</button>
                        )}

                        {canTransferInventory && (
                            <button className="secondary-button">Transfer Inventory</button>
                        )}
                        
                        {canCreateShipment && (
                            <button className="secondary-button">Create Shipment</button>
                        )}
                    </div>
                )} 
            </div>
        </div>
    )
}

function InventoryPage({ permissions = [], onBack }) {
    const [searchTerm, setSearchTerm] = useState("")
    const [projectFilter, setProjectFilter] = useState("All")
    const [categoryFilter, setCategoryFilter] = useState("All")
    const [statusFilter, setStatusFilter] = useState("All")
    const [selectedItem, setSelectedItem] = useState(null)

    const canViewMaterialCost = hasPermission(permissions, "view_material_cost")
    const canAdjustInventory = hasPermission(permissions, "adjust_inventory")
    const canTransferInventory = hasPermission(permissions, "transfer_inventory")
    const canCreateShipment = hasPermission(permissions, "create_shipment")

    const projects = ["All", ...new Set(inventoryData.map((item) => item.project))]
    const categories = ["All", ...new Set(inventoryData.map((item) => item.category))]
    const statuses = ["All", ...new Set(inventoryData.map((item) => item.status))]

    const filteredItems = useMemo(() => {
        return inventoryData.filter((item) => {
            const search = searchTerm.toLowerCase()

            const matchesSearch = 
                item.name.toLowerCase().includes(search) ||
                item.sku.toLowerCase().includes(search) ||
                item.project.toLowerCase().includes(search) ||
                item.location.toLowerCase().includes(search)

            const matchesProject = projectFilter === "All" || item.project === projectFilter
            const matchesCategory = categoryFilter === "All" || item.category === categoryFilter
            const matchesStatus = statusFilter === "All" || item.status === statusFilter

            return matchesSearch && matchesProject && matchesCategory && matchesStatus
        })
    }, [searchTerm, projectFilter, categoryFilter, statusFilter])

    const summary = useMemo(() => {
        return {
            totalItems: inventoryData.length,
            lowStock: inventoryData.filter((item) => item.status === "Low Stock").length,
            inTransit: inventoryData.filter((item) => item.status === "In Transit").length,
            updatedToday: inventoryData.filter((item) => item.updatedAt === "Mar 24, 2026").length,
        }
    }, [])

    return (
        <div className="inventory-page">
            <div className="inventory-page-scroll">
                <section className="page-section inventory-header">
                    <div className="inventory-header-bar">
                        <button className="text-button back-button" onClick={onBack}>
                        ← Home
                        </button>

                        <h1 className="page-title inventory-title">Inventory</h1>
                    </div>

                    <p className="page-subtitle">
                        View material quantities, locations, and current status across projects.
                    </p>
                </section>

                <section className="inventory-summary-grid">
                    <div className="summary-card">
                        <div className="summary-row">
                            <span className="summary-label">Total Items: </span>
                            <span className="summary-value">{summary.totalItems}</span>
                        </div>
                    </div>

                    <div className="summary-card">
                        <div className="summary-row">
                            <span className="summary-label">Low Stock: </span>
                            <span className="summary-value">{summary.lowStock}</span>
                        </div>
                    </div>

                    <div className="summary-card">
                        <div className="summary-row">
                            <span className="summary-label">In Transit: </span>
                            <span className="summary-value">{summary.inTransit}</span>
                        </div>
                    </div>

                    <div className="summary-card">
                        <div className="summary-row">
                            <span className="summary-label">Updated Today: </span>
                            <span className="summary-value">{summary.updatedToday}</span>
                        </div>
                    </div>
                </section>

                <section className="page-section inventory-filters">
                    <input 
                        type="text"
                        className="inventory-search"
                        placeholder="Search by material, SKU, project, or location..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />

                    <div className="filter-row">
                        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
                            {projects.map((project) => (
                                <option key={project} value={project}>
                                    Project: {project}
                                </option>
                            ))}
                        </select>

                        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                            {categories.map((category) => (
                                <option key={category} value={category}>
                                    Category: {category}
                                </option>
                            ))}
                        </select>

                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                            {statuses.map((status) => (
                                <option key={status} value={status}>
                                    Status: {status}
                                </option>
                            ))}
                        </select>
                    </div>
                </section>

                <section className="inventory-content">
                    <div className="inventory-results">
                        <div className="section-heading-row">
                            <h2 className="section-title">Inventory Results</h2>
                            <p className="results-count">{filteredItems.length} items</p>
                        </div>

                        <div className="inventory-card-list">
                            {filteredItems.map((item) => (
                                <div className="inventory-card" key={item.id}>
                                    <div className="inventory-card-top">
                                        <div>
                                            <h3 className="inventory-item-title">{item.name}</h3>
                                            <p className="inventory-item-subtext">SKU: {item.sku}</p>
                                        </div>

                                        <span className={getStatusClass(item.status)}>{item.status}</span>
                                    </div>

                                    <div className="inventory-card-details">
                                        <div>
                                            <span className="detail-label">Quantity: </span>
                                            <span className="detail-value">{item.quantity} {item.unit}</span>
                                        </div>

                                        <div>
                                            <span className="detail-label">Category: </span>
                                            <span className="detail-value">{item.category}</span>
                                        </div>

                                        <div>
                                            <span className="detail-label">Project: </span>
                                            <span className="detail-value">{item.project}</span>
                                        </div>

                                        <div>
                                            <span className="detail-label">Updated: </span>
                                            <span className="detail-value">{item.updatedAt}</span>
                                        </div>
                                    </div>

                                    <div className="inventory-location-block">
                                        <span className="detail-label">Location: </span>
                                        <span className="detail-value">{item.location}</span>
                                    </div>

                                    <button
                                        className="secondary-button"
                                        onClick={() => setSelectedItem(item)}
                                    >
                                        View Details
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <aside className="inventory-detail-panel">
                        {selectedItem ? (
                            <>
                                <div className="section-heading-row">
                                    <h2 className="section-title">Item Details</h2>
                                    <button
                                        className="text-button"
                                        onClick={() => setSelectedItem(null)}
                                    >
                                        Close
                                    </button>
                                </div>

                                <h3 className="inventory-item-title">{selectedItem.name}</h3>
                                <p className="inventory-item-subtext">SKU: {selectedItem.sku}</p>
                                <span className={getStatusClass(selectedItem.status)}>{selectedItem.status}</span>

                                <div className="inventory-card-details detail-panel-grid">
                                    <div>
                                        <span className="detail-label">Quantity</span>
                                        <span className="detail-value">{selectedItem.quantity} {selectedItem.unit}</span>
                                    </div>

                                    {canViewMaterialCost && (
                                            <>
                                                <div className="detail-row">
                                                    <span className="detail-label">Unit Cost: </span>
                                                    <span className="detail-value">{selectedItem.unitCost} / {selectedItem.unit}</span>
                                                </div>

                                                <div className="detail-row">
                                                    <span className="detail-label">Total Cost: </span>
                                                    <span className="detail-value">{selectedItem.totalCost}</span>
                                                </div>
                                            </>
                                        )}

                                    <div>
                                        <span className="detail-label">Category</span>
                                        <span className="detail-value">{selectedItem.category}</span>
                                    </div>

                                    <div>
                                        <span className="detail-label">Project</span>
                                        <span className="detail-value">{selectedItem.project}</span>
                                    </div>

                                    <div>
                                        <span className="detail-label">Updated</span>
                                        <span className="detail-value">{selectedItem.updatedAt}</span>
                                    </div>
                                </div>

                                <div className="inventory-location-block">
                                    <span className="detail-label">Location</span>
                                    <span className="detail-value">{selectedItem.location}</span>
                                </div>

                                {(canAdjustInventory || canTransferInventory || canCreateShipment) && (
                                    <div className="detail-actions">
                                        {canAdjustInventory && (
                                            <button className="primary-button">Adjust Inventory</button>
                                        )}

                                        {canTransferInventory && (
                                            <button className="secondary-button">Transfer Inventory</button>
                                        )}
                                        
                                        {canCreateShipment && (
                                            <button className="secondary-button">Create Shipment</button>
                                        )}
                                    </div>
                                )}   
                            </>
                        ) : (
                            <div className="detail-panel-empty">
                                <p>Select an inventory item to view more details.</p>
                            </div>
                        )}
                    </aside>
                </section>

                {isMobile && (
                    <InventoryModal 
                        item={selectedItem}
                        onClose={() => setSelectedItem(null)}
                        canViewMaterialCost={canViewMaterialCost}
                        canAdjustInventory={canAdjustInventory}
                        canTransferInventory={canTransferInventory}
                        canCreateShipment={canCreateShipment}
                    />
                )}
            </div>
        </div>
    )
}

export default InventoryPage