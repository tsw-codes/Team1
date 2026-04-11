function FilterHeader({
    title,
    subtitle,
    onBack,
    filtersOpen,
    onToggleFilters,
    leftMetaLabel = "",
    leftMetaValue = "",
    rightMetaText = "",
    children,
}) {
    return (
        <section className="page-section inventory-header sticky-page-header shipment-header">
            <div className="shipment-header-top-row">
                <button
                    className="text-button back-button"
                    type="button"
                    onClick={onBack}
                >
                    ← Home
                </button>

                <span />

                <button
                    className="text-button filter-toggle-button"
                    type="button"
                    onClick={onToggleFilters}
                    aria-label={filtersOpen ? "Hide filters" : "Show filters"}
                    title={filtersOpen ? "Hide filters" : "Show filters"}
                >
                    <svg
                        className="filter-icon"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill={filtersOpen ? "none" : "currentColor"}
                        aria-hidden="true"
                    >
                        {filtersOpen ? (
                            <path
                                d="M6 6l12 12M18 6l-12 12"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        ) : (
                            <path d="M3 5h18l-7 8v5l-4 2v-7L3 5z" />
                        )}
                    </svg>

                    <span className="filter-label">Filter</span>
                </button>
            </div>

            <h1 className="page-title shipment-header-title">{title}</h1>

            <div className="shipment-header-meta-row">
                {leftMetaLabel && leftMetaValue ? (
                    <p className="shipment-filtered-cost">
                        <span className="shipment-filtered-cost-label">{leftMetaLabel}</span>
                        <span className="shipment-filtered-cost-value">{leftMetaValue}</span>
                    </p>
                ) : (
                    <span />
                )}

                {rightMetaText ? (
                    <p className="shipment-results-count">{rightMetaText}</p>
                ) : (
                    <span />
                )}
            </div>

            <div className={`collapsible-header-content ${filtersOpen ? "open" : ""}`}>
                {subtitle ? (
                    <p className="page-subtitle shipment-header-subtitle">{subtitle}</p>
                ) : null}

                <section className="inventory-filters inventory-filters-embedded">
                    {children}
                </section>
            </div>
        </section>
    )
}

export default FilterHeader