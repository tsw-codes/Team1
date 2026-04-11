function InfoHeader({
    title,
    subtitle,
    onBack,
    infoOpen,
    onToggleInfo,
    countText = "",
}) {
    return (
        <section className="page-section sticky-page-header shipment-header">
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
                    onClick={onToggleInfo}
                    aria-label={infoOpen ? "Hide info" : "Show info"}
                    title={infoOpen ? "Hide info" : "Show info"}
                >
                    <svg
                        className="filter-icon"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill={infoOpen ? "none" : "currentColor"}
                        aria-hidden="true"
                    >
                        {infoOpen ? (
                            <path
                                d="M6 6l12 12M18 6l-12 12"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        ) : (
                            <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 5.5a1.25 1.25 0 110 2.5 1.25 1.25 0 010-2.5zm1.25 9h-2.5v-1.5h.5v-3h-.5v-1.5h2v4.5h.5v1.5z" />
                        )}
                    </svg>

                    <span className="filter-label">Info</span>
                </button>
            </div>

            <h1 className="page-title shipment-header-title">{title}</h1>

            <div className="shipment-header-meta-row">
                <span />
                {countText ? (
                    <p className="shipment-results-count">{countText}</p>
                ) : (
                    <span />
                )}
            </div>

            <div className={`collapsible-header-content ${infoOpen ? "open" : ""}`}>
                {subtitle ? (
                    <p className="page-subtitle shipment-header-subtitle">{subtitle}</p>
                ) : null}
            </div>
        </section>
    )
}

export default InfoHeader