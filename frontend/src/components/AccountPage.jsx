import Toast from "./Toast"

function formatRole(role) {
    if (!role) return ""

    if (role === "admin") return "Admin"
    if (role === "projectManager") return "Project Manager"
    if (role === "warehouseManager") return "Warehouse Manager"
    if (role === "logisticsAssociate") return "Logistics Associate"
    if (role === "logisticsForeman") return "Logistics Foreman"

    return role
}

function AccountPage({
    username,
    name,
    role,
    themePreference,
    stickyHeadersEnabled,
    onThemeChange,
    onStickyHeadersChange,
    onChangePassword,
    onLogout,
    onBack,
    toast,
    onCloseToast,
}) {
    return (
        <>
            <div className="account-page">
                <div className="account-card">
                    <div className="account-header-row sticky-page-header">
                        <button className="text-button" onClick={onBack}>
                            ← Home
                        </button>
                        <h2 className="account-header">Account Info</h2>
                    </div>

                    <div className="account-info">
                        <p>
                            <span className="detail-label">Username: </span>
                            <span className="detail-value">{username || "-"}</span>
                        </p>

                        <p>
                            <span className="detail-label">Name: </span>
                            <span className="detail-value">{name || "-"}</span>
                        </p>

                        <p>
                            <span className="detail-label">Role: </span>
                            <span className="detail-value">{formatRole(role) || "-"}</span>
                        </p>
                    </div>

                    <section className="account-preferences-section">
                        <h3 className="account-section-title">Preferences</h3>

                        <div className="form-group">
                            <span className="form-label">Theme</span>

                            <div
                                className="account-radio-group"
                                role="radiogroup"
                                aria-label="Theme preference"
                            >
                                <label className="account-radio-option">
                                    <input
                                        type="radio"
                                        name="themePreference"
                                        value="system"
                                        checked={themePreference === "system"}
                                        onChange={(e) => onThemeChange(e.target.value)}
                                    />
                                    <span>System</span>
                                </label>

                                <label className="account-radio-option">
                                    <input
                                        type="radio"
                                        name="themePreference"
                                        value="light"
                                        checked={themePreference === "light"}
                                        onChange={(e) => onThemeChange(e.target.value)}
                                    />
                                    <span>Light</span>
                                </label>

                                <label className="account-radio-option">
                                    <input
                                        type="radio"
                                        name="themePreference"
                                        value="dark"
                                        checked={themePreference === "dark"}
                                        onChange={(e) => onThemeChange(e.target.value)}
                                    />
                                    <span>Dark</span>
                                </label>
                            </div>
                        </div>

                        <div className="account-toggle-row">
                            <span className="account-toggle-text">
                                <span className="form-label">Sticky Headers</span>
                                <span className="account-toggle-help">
                                    Keep page headers pinned while scrolling.
                                </span>
                            </span>

                            <button
                                type="button"
                                className={`account-switch ${stickyHeadersEnabled ? "on" : "off"}`}
                                aria-pressed={stickyHeadersEnabled}
                                aria-label={`Sticky headers ${stickyHeadersEnabled ? "enabled" : "disabled"}`}
                                onClick={() => onStickyHeadersChange(!stickyHeadersEnabled)}
                            >
                                <span className="account-switch-track">
                                    <span className="account-switch-thumb" />
                                </span>
                            </button>
                        </div>
                    </section>

                    <div className="account-actions">
                        <button className="secondary-button" onClick={onChangePassword}>
                            Change Password
                        </button>

                        <button className="primary-button" onClick={onLogout}>
                            Log Out
                        </button>
                    </div>
                </div>
            </div>

            <Toast
                message={toast?.message || ""}
                type={toast?.type || "success"}
                onClose={onCloseToast}
            />
        </>
    )
}

export default AccountPage