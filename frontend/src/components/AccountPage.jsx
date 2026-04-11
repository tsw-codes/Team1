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
                    <div className="account-header-row">
                        <button className="text-button" onClick={onBack}>
                            ← Home
                        </button>
                        <h2 className="account-header">Account Info</h2>
                    </div>

                    <div className="account-info">
                        <p>
                            <span className="detail-label">Username: </span>
                            <span className="detail-value">{username || '-'}</span>
                        </p>

                        <p>
                            <span className="detail-label">Name: </span>
                            <span className="detail-value">{name || '-'}</span>
                        </p>

                        <p>
                            <span className="detail-label">Role: </span>
                            <span className="detail-value">{formatRole(role) || '-'}</span>
                        </p>
                    </div>

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