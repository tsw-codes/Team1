import { useEffect, useMemo, useRef, useState } from "react"
import FilterHeader from "./FilterHeader"
import Toast from "./Toast"
import {
    createLocation,
    deleteLocation,
    generateNextLocationCode,
    getAllLocationsDetailed,
    getLocationDependencySummary,
    updateLocation,
} from "../services/projectService"

const EMPTY_FORM = {
    value: "",
    label: "",
    type: "warehouse",
}

function ManageLocationsPage({ onBack }) {
    const [filtersOpen, setFiltersOpen] = useState(() => window.innerWidth > 900)
    const [toast, setToast] = useState({ message: "", type: "success" })
    const [locations, setLocations] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [pageError, setPageError] = useState("")
    const [searchTerm, setSearchTerm] = useState("")
    const [typeFilter, setTypeFilter] = useState("All")
    const [formMode, setFormMode] = useState("")
    const [formValues, setFormValues] = useState(EMPTY_FORM)
    const [formError, setFormError] = useState("")
    const formCardRef = useRef(null)
    const nameInputRef = useRef(null)
    const codeRequestIdRef = useRef(0)

    useEffect(() => {
        loadLocations()
    }, [])

    async function loadLocations() {
        try {
            setIsLoading(true)
            setPageError("")
            const nextLocations = await getAllLocationsDetailed()
            setLocations(nextLocations)
        } catch (err) {
            setPageError(err.message || "Unable to load locations.")
        } finally {
            setIsLoading(false)
        }
    }

    function showToast(message, type = "success") {
        setToast({ message, type })

        window.clearTimeout(showToast.timeoutId)
        showToast.timeoutId = window.setTimeout(() => {
            setToast({ message: "", type: "success" })
        }, 3000)
    }

    function resetForm() {
        setFormMode("")
        setFormValues(EMPTY_FORM)
        setFormError("")
    }

    useEffect(() => {
        if (!formMode) return

        const frameId = window.requestAnimationFrame(() => {
            formCardRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            })
            nameInputRef.current?.focus()
        })

        return () => window.cancelAnimationFrame(frameId)
    }, [formMode])

    function handleCreateStart() {
        startCreateForm()
    }

    function handleEditStart(location) {
        setFormMode("edit")
        setFormValues({
            value: location.value,
            label: location.label,
            type: location.type,
        })
        setFormError("")
    }

    function handleFormChange(e) {
        const { name, value } = e.target

        if (formError) {
            setFormError("")
        }

        if (name === "label" && formMode === "create") {
            const nextLabel = value

            setFormValues((prev) => ({
                ...prev,
                label: nextLabel,
            }))

            void syncGeneratedLocationCode(nextLabel)
            return
        }

        setFormValues((prev) => ({
            ...prev,
            [name]: value,
        }))
    }

    async function syncGeneratedLocationCode(label) {
        const normalizedLabel = label.trim()

        if (!normalizedLabel) {
            setFormValues((prev) => ({
                ...prev,
                value: "",
            }))
            return
        }

        const requestId = codeRequestIdRef.current + 1
        codeRequestIdRef.current = requestId

        try {
            const nextCode = await generateNextLocationCode(normalizedLabel)
            if (requestId !== codeRequestIdRef.current) return
            setFormValues((prev) => ({
                ...prev,
                value: nextCode,
            }))
        } catch (err) {
            setFormError(err.message || "Unable to generate a location code.")
        }
    }

    async function startCreateForm() {
        setFormMode("create")
        setFormValues(EMPTY_FORM)
        setFormError("")
    }

    async function handleFormSubmit(e) {
        e.preventDefault()
        if (isSubmitting) return

        if (!formValues.value.trim()) {
            setFormError("Location code is required.")
            return
        }

        if (!formValues.label.trim()) {
            setFormError("Location label is required.")
            return
        }

        if (!formValues.type.trim()) {
            setFormError("Location type is required.")
            return
        }

        try {
            setIsSubmitting(true)

            if (formMode === "create") {
                const latestGeneratedCode = await generateNextLocationCode(formValues.label)
                await createLocation({
                    ...formValues,
                    value: latestGeneratedCode,
                })
                showToast(`Location ${latestGeneratedCode.trim().toUpperCase()} created.`)
            } else {
                await updateLocation(formValues.value, {
                    label: formValues.label,
                    type: formValues.type,
                })
                showToast(`Location ${formValues.value.trim().toUpperCase()} updated.`)
            }

            resetForm()
            await loadLocations()
        } catch (err) {
            setFormError(err.message || "Unable to save location.")
        } finally {
            setIsSubmitting(false)
        }
    }

    async function handleDelete(location) {
        if (isSubmitting) return

        try {
            setIsSubmitting(true)
            const dependencySummary = await getLocationDependencySummary(location.value)

            if (!dependencySummary.canDelete) {
                showToast(
                    `Delete blocked. ${location.value} is already in use. Deactivation is planned for a future update.`,
                    "warning"
                )
                return
            }

            const confirmed = window.confirm(
                `Delete ${location.value} - ${location.label}? This should only be used for mistaken entries with no dependencies.`
            )

            if (!confirmed) return

            await deleteLocation(location.value)

            if (formMode === "edit" && formValues.value === location.value) {
                resetForm()
            }

            showToast(`Location ${location.value} deleted.`)
            await loadLocations()
        } catch (err) {
            showToast(err.message || "Unable to delete location.", "error")
        } finally {
            setIsSubmitting(false)
        }
    }

    function handleDeactivatePlaceholder(location) {
        showToast(
            `${location.value} remains active for now. Activation/deactivation is planned but not implemented yet.`,
            "warning"
        )
    }

    const filteredLocations = useMemo(() => {
        const normalizedSearch = searchTerm.trim().toLowerCase()

        return locations.filter((location) => {
            const matchesSearch =
                !normalizedSearch ||
                location.value.toLowerCase().includes(normalizedSearch) ||
                location.label.toLowerCase().includes(normalizedSearch)

            const matchesType =
                typeFilter === "All" ||
                location.type === typeFilter

            return matchesSearch && matchesType
        })
    }, [locations, searchTerm, typeFilter])

    function renderLocationFormCard() {
        if (!formMode) return null

        return (
            <div
                className="inventory-card manage-location-card manage-location-form-card"
                ref={formCardRef}
                key={formMode === "create" ? "new-location-form" : `edit-${formValues.value}`}
            >
                <div className="inventory-card-top">
                    <div>
                        <h3 className="inventory-item-title">
                            {formMode === "create" ? "New Location" : "Edit Location"}
                        </h3>
                        <p className="inventory-item-subtext">
                            {formMode === "create"
                                ? "Add the location name first and the code will be generated from it."
                                : `Code: ${formValues.value}`}
                        </p>
                    </div>
                    <span className="status-badge available">Active</span>
                </div>

                <form className="receive-form-grid manage-location-form-grid" onSubmit={handleFormSubmit}>
                    <label className="form-group">
                        <span className="form-label">Location Name</span>
                        <input
                            ref={nameInputRef}
                            className="form-input"
                            name="label"
                            value={formValues.label}
                            onChange={handleFormChange}
                            placeholder="Central Office"
                        />
                    </label>

                    <label className="form-group">
                        <span className="form-label">Type</span>
                        <select
                            className="form-input"
                            name="type"
                            value={formValues.type}
                            onChange={handleFormChange}
                        >
                            <option value="warehouse">Warehouse</option>
                            <option value="site">Site</option>
                        </select>
                    </label>

                    <label className="form-group receive-form-span-2">
                        <span className="form-label">Location Code</span>
                        <input
                            className="form-input read-only-input"
                            name="value"
                            value={formValues.value}
                            onChange={handleFormChange}
                            placeholder="Auto-generated"
                            readOnly
                        />
                    </label>

                    {formError && (
                        <div className="login-error receive-form-span-2">
                            {formError}
                        </div>
                    )}

                    <div className="detail-actions manage-locations-actions receive-form-span-2">
                        <button
                            className="secondary-button"
                            type="button"
                            onClick={resetForm}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>

                        <button className="primary-button" type="submit" disabled={isSubmitting}>
                            {isSubmitting
                                ? "Saving..."
                                : formMode === "create"
                                ? "Create Location"
                                : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        )
    }

    return (
        <>
            <div className="inventory-page">
                <div className="inventory-page-scroll">
                    <FilterHeader
                        title="Manage Locations"
                        subtitle="Create and update warehouse and site locations. Deactivate/reactivate controls are visible for planning but not implemented yet."
                        onBack={onBack}
                        filtersOpen={filtersOpen}
                        onToggleFilters={() => setFiltersOpen((prev) => !prev)}
                        rightMetaText={`${filteredLocations.length} location${filteredLocations.length === 1 ? "" : "s"}`}
                    >
                        <input
                            className="inventory-search"
                            type="search"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search by code or location name"
                        />

                        <div className="filter-row">
                            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                                <option value="All">Type: All</option>
                                <option value="warehouse">Type: Warehouse</option>
                                <option value="site">Type: Site</option>
                            </select>
                        </div>

                        <div className="filter-actions manage-location-filter-actions">
                            <button
                                className="secondary-button"
                                type="button"
                                onClick={() => {
                                    setSearchTerm("")
                                    setTypeFilter("All")
                                }}
                            >
                                Clear Filters
                            </button>
                        </div>
                    </FilterHeader>

                    {pageError && (
                        <section className="page-section receive-form-section">
                            <div className="login-error">{pageError}</div>
                        </section>
                    )}

                    {isLoading && (
                        <section className="page-section receive-form-section">
                            <p className="section-subtext">Loading locations...</p>
                        </section>
                    )}

                    <section className="manage-location-content">
                        <div className="inventory-results">
                            <div className="inventory-card-list manage-location-card-list">
                            {formMode === "create" && renderLocationFormCard()}
                            {!isLoading && filteredLocations.length === 0 ? (
                                <div className="empty-state-message">
                                    No locations match the current filters.
                                </div>
                            ) : (
                                filteredLocations.map((location) => (
                                    formMode === "edit" && formValues.value === location.value ? (
                                        renderLocationFormCard()
                                    ) : (
                                    <div className="inventory-card manage-location-card" key={location.value}>
                                        <div className="inventory-card-top">
                                            <div>
                                                <h3 className="inventory-item-title">{location.label}</h3>
                                                <p className="inventory-item-subtext">Code: {location.value}</p>
                                            </div>
                                            <span className="status-badge available">{location.status}</span>
                                        </div>

                                        <div className="inventory-card-details manage-location-details">
                                            <div>
                                                <span className="detail-label">Type: </span>
                                                <span className="detail-value">{location.type === "warehouse" ? "Warehouse" : "Site"}</span>
                                            </div>

                                            <div>
                                                <span className="detail-label">Projects: </span>
                                                <span className="detail-value">{location.projectCount}</span>
                                            </div>
                                        </div>

                                        <div className="inventory-location-block manage-location-projects">
                                            <span className="detail-label">Associated Projects:</span>
                                            {location.projects?.length > 0 ? (
                                                <div className="manage-location-project-list">
                                                    {location.projects.map((project) => (
                                                        <div className="detail-value" key={project}>
                                                            {project}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="manage-location-project-list">
                                                    <div className="detail-value">No projects assigned</div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="manage-location-actions-row">
                                            <button
                                                className="secondary-button manage-action-button manage-action-edit"
                                                type="button"
                                                onClick={() => handleEditStart(location)}
                                            >
                                                Edit
                                            </button>

                                            <button
                                                className="secondary-button manage-action-button manage-action-deactivate"
                                                type="button"
                                                onClick={() => handleDeactivatePlaceholder(location)}
                                            >
                                                Deactivate
                                            </button>

                                            <button
                                                className="secondary-button manage-action-button manage-action-delete"
                                                type="button"
                                                onClick={() => handleDelete(location)}
                                                disabled={isSubmitting}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                    )
                                ))
                            )}
                            </div>
                        </div>
                    </section>

                    <div className="manage-location-sticky-actions">
                        <button
                            className="primary-button"
                            type="button"
                            onClick={handleCreateStart}
                        >
                            Add Location
                        </button>
                    </div>
                </div>
            </div>

            <Toast
                message={toast.message}
                type={toast.type}
                onClose={() => setToast({ message: "", type: "success" })}
            />
        </>
    )
}

export default ManageLocationsPage
