import { useEffect, useMemo, useState } from "react"
import { hasPermission } from "../auth/permissions"
import { formatCurrency } from "../utils/formatters"
import { 
    getInventoryItems, 
    createInventoryAdjustment,
    canAdjustInventoryItemForPermissions,
} from "../services/inventoryService"
import FilterHeader from "./FilterHeader"

function getStatusClass(status) {
    switch (status) {
        case "Available":
            return "status-badge available"
        case "Low Stock":
            return "status-badge low-stock"
        case "Out of Stock":
            return "status-badge out-of-stock"
        case "Reserved":
            return "status-badge reserved"
        case "In Transit":
            return "status-badge in-transit"
        default:
            return "status-badge"
    }
}

function InventoryDetailContent({
    item,
    onClose,
    showClose = false,
    canViewMaterialCost,
    canAdjustInventory,
    onAdjustInventory,
}) {
    if (!item) return null

    return (
        <>
            <div className="section-heading-row">
                <h2 className="section-title">Item Details</h2>
                {showClose && (
                    <button className="text-button" onClick={onClose}>Close</button>
                )}
            </div>

            <h3 className="inventory-item-title">{item.name}</h3>
            <p className="inventory-item-subtext">SKU: {item.sku}</p>
            <span className={getStatusClass(item.status)}>{item.status}</span>

            <div className="inventory-card-details detail-panel-grid">
                <div>
                    <span className="detail-label">Quantity: </span>
                    <span className="detail-value">{item.quantity} {item.unit}</span>
                </div>

                {canViewMaterialCost && (
                    <>
                        <div className="detail-row">
                            <span className="detail-label">Unit Cost: </span>
                            <span className="detail-value">
                                {formatCurrency(item.unitCost)} / {item.unit}
                            </span>
                        </div>

                        <div className="detail-row">
                            <span className="detail-label">Total Cost: </span>
                            <span className="detail-value">{formatCurrency(item.totalCost)}</span>
                        </div>
                    </>
                )}

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

                <div className="inventory-location-block">
                    <span className="detail-label">Location: </span>
                    <span className="detail-value">{item.location}</span>
                </div>
            </div>

            {canAdjustInventory && (
                <div className="detail-actions">
                    <button className="primary-button" onClick={onAdjustInventory}>
                        Adjust Inventory
                    </button>
                </div>
            )}
        </>
    )
}

function InventoryModal({
    item,
    onClose,
    canViewMaterialCost,
    canAdjustInventory,
    onAdjustInventory,
}) {
    if (!item) return null

    return (
        <div className="inventory-modal-overlay" onClick={onClose}>
            <div className="inventory-modal-card" onClick={(e) => e.stopPropagation()}>
                <InventoryDetailContent 
                    item={item}
                    onClose={onClose}
                    showClose={true}
                    canViewMaterialCost={canViewMaterialCost}
                    canAdjustInventory={canAdjustInventory}
                    onAdjustInventory={onAdjustInventory}
                />
            </div>
        </div>
    )
}

function AdjustInventoryModal({
    item,
    form,
    error,
    onClose,
    onChange,
    onSubmit
}) {
    if (!item) return null

    return (
        <div className="inventory-modal-overlay" onClick={onClose}>
            <div className="inventory-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="section-heading-row">
                    <h2 className="section-title">Adjust Inventory</h2>
                    <button className="text-button" onClick={onClose}>
                        Close
                    </button>
                </div>

                <div className="inventory-card-details">
                    <div>
                        <span className="detail-label">Material: </span>
                        <span className="detail-value">{item.name}</span>
                    </div>

                    <div>
                        <span className="detail-label">SKU: </span>
                        <span className="detail-value">{item.sku}</span>
                    </div>

                    <div>
                        <span className="detail-label">Current Quantity: </span>
                        <span className="detail-value">{item.quantity} {item.unit}</span>
                    </div>

                    <form className="receive-form" onSubmit={onSubmit}>
                        <label className="form-group">
                            <span className="form-label">Adjustment Type</span>
                            <select
                                className="form-input"
                                name="adjustmentType"
                                value={form.adjustmentType}
                                onChange={onChange}
                            >
                                <option value="">Select adjustment type</option>
                                <option value="increase">Increase</option>
                                <option value="decrease">Decrease</option>
                                <option value="set">Set Quantity</option>
                            </select>
                        </label>

                        <label className="form-group">
                            <span className="form-label">
                                {form.adjustmentType === "set" ? "New Quantity" : "Quantity Change"}
                            </span>
                            <input 
                                className="form-input"
                                type="number"
                                min="0"
                                name="quantityValue"
                                value={form.quantityValue}
                                onChange={onChange}
                                placeholder="0"
                            />
                        </label>

                        <label className="form-group">
                            <span className="form-label">Reason</span>
                            <textarea 
                                className="form-textarea"
                                name="reason"
                                value={form.reason}
                                onChange={onChange}
                                placeholder="Enter adjustment reason"
                            />
                        </label>

                        {error && <div className="login-error">{error}</div>}

                        <div className="receive-actions">
                            <button
                                className="secondary-button"
                                type="button"
                                onClick={onClose}
                            >
                                Cancel
                            </button>

                            <button className="primary-button" type="submit">
                                Save Adjustment
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

function InventoryPage({ permissions = [], currentUser, onBack }) {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 900)

    const [filtersOpen, setFiltersOpen] = useState(() => window.innerWidth > 900)

    const [searchTerm, setSearchTerm] = useState("")
    const [projectFilter, setProjectFilter] = useState("All")
    const [categoryFilter, setCategoryFilter] = useState("All")
    const [statusFilter, setStatusFilter] = useState("All")
    const [selectedItem, setSelectedItem] = useState(null)

    const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false)
    const [adjustForm, setAdjustForm] = useState({
        adjustmentType: "",
        quantityValue: "",
        reason: "",
    })
    const [adjustError, setAdjustError] = useState("")

    const canViewMaterialCost = hasPermission(permissions, "view_material_cost")
    const canAdjustSelectedItem = canAdjustInventoryItemForPermissions(selectedItem, permissions)

    const [inventoryData, setInventoryData] = useState(() => [...getInventoryItems()])

    const filterOptions = useMemo(() => {
        return {
            projects: ["All", ...new Set(inventoryData.map((item) => item.project))],
            categories: ["All", ...new Set(inventoryData.map((item) => item.category))],
            statuses: ["All", ...new Set(inventoryData.map((item) => item.status))],
        }
    }, [inventoryData])

    const summary = useMemo(() => {
        return {
            totalItems: inventoryData.length,
            lowStock: inventoryData.filter((item) => item.status === "Low Stock").length,
            outOfStock: inventoryData.filter((item) => item.status === "Out of Stock").length,
            inTransit: inventoryData.filter((item) => item.status === "In Transit").length,
        }
    }, [inventoryData])

    const { projects, categories, statuses } = filterOptions

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
    }, [inventoryData, searchTerm, projectFilter, categoryFilter, statusFilter])

    const filteredCost = useMemo(() => {
        if (!canViewMaterialCost) return 0

        return filteredItems.reduce(
            (sum, item) => sum + Number(item.totalCost || 0),
            0
        )
    }, [filteredItems, canViewMaterialCost])

    useEffect(() => {
        function handleResize() {
            setIsMobile(window.innerWidth <= 900)
        }

        window.addEventListener("resize", handleResize)

        return () => window.removeEventListener("resize", handleResize)
    }, [])

    function handleClearFilters() {
        setSearchTerm("")
        setProjectFilter("All")
        setCategoryFilter("All")
        setStatusFilter("All")
    }

    function handleAdjustInventory() {
        if (!canAdjustInventoryItemForPermissions(selectedItem, permissions)) {
            return
        }

        setAdjustForm({
            adjustmentType: "",
            quantityValue: "",
            reason: "",
        })
        setAdjustError("")
        setIsAdjustModalOpen(true)
    }

    function handleAdjustFormChange(e) {
        const { name, value } = e.target

        setAdjustForm((prev) => ({
            ...prev,
            [name]: value,
        }))
 
        if (adjustError) {
            setAdjustError("")
        }
    }

    function handleSubmitAdjustment(e) {
        e.preventDefault()

        if (!selectedItem) return

        const { adjustmentType, quantityValue, reason } = adjustForm

        if (!adjustmentType) {
            setAdjustError("Adjustment type is required.")
            return
        }

        if (quantityValue === "" || Number(quantityValue) < 0) {
            setAdjustError("Quantity must be 0 or greater.")
            return
        }

        if (!reason.trim()) {
            setAdjustError("Reason is required.")
            return
        }

        const result = createInventoryAdjustment({
            inventoryItemId: selectedItem.id,
            adjustmentType,
            quantityValue,
            reason,
            adjustedBy: currentUser?.username || "unknown",
            permissions,
        })

        if (!result) {
            setAdjustError("You are not allowed to adjust this inventory item.")
            return
        }

        const refreshedInventory = [...getInventoryItems()]
        setInventoryData(refreshedInventory)
        setSelectedItem(
            refreshedInventory.find((item) => String(item.id) === String(result.updatedItem.id)) || result.updatedItem
        )
        setAdjustError("")
        setIsAdjustModalOpen(false)
    }

    return (
        <div className="inventory-page">
            <div className="inventory-page-scroll">
                <FilterHeader
                    title="Inventory"
                    subtitle="View material quantities, locations, and current status across projects."
                    onBack={onBack}
                    filtersOpen={filtersOpen}
                    onToggleFilters={() => setFiltersOpen((prev) => !prev)}
                    leftMetaLabel={canViewMaterialCost ? "Cost:" : ""}
                    leftMetaValue={canViewMaterialCost ? formatCurrency(filteredCost) : ""}
                    rightMetaText={`${filteredItems.length} item${filteredItems.length !== 1 ? "s" : ""}`}
                >
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

                    <div className="filter-actions">
                        <button
                            className="secondary-button"
                            type="button"
                            onClick={handleClearFilters}
                        >
                            Clear Filters
                        </button>
                    </div>
                </FilterHeader>

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
                            <span className="summary-label">Out of Stock</span>
                            <span className="summary-value">{summary.outOfStock}</span>
                        </div>
                    </div>
                </section>

                <section className="inventory-content">
                    <div className="inventory-results">
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

                                    <div className="inventory-card-button">
                                        <button
                                            className="secondary-button"
                                            onClick={() => setSelectedItem(item)}
                                        >
                                            View Details
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <aside className="inventory-detail-panel">
                        {selectedItem ? (
                            <InventoryDetailContent 
                                item={selectedItem}
                                onClose={() => setSelectedItem(null)}
                                showClose={true}
                                canViewMaterialCost={canViewMaterialCost}
                                canAdjustInventory={canAdjustSelectedItem}
                                onAdjustInventory={handleAdjustInventory}
                            />
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
                        canAdjustInventory={canAdjustSelectedItem}
                        onAdjustInventory={handleAdjustInventory}
                    />
                )}

                {isAdjustModalOpen && selectedItem && (
                    <AdjustInventoryModal 
                        item={selectedItem}
                        form={adjustForm}
                        error={adjustError}
                        onClose={() => {
                            setIsAdjustModalOpen(false)
                            setAdjustError("")
                        }}
                        onChange={handleAdjustFormChange}
                        onSubmit={handleSubmitAdjustment}
                    />
                )}
            </div>
        </div>
    )
}

export default InventoryPage