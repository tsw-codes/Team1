function AccountPage({ username, onChangePassword, onLogout, onBack}) {
    return (
        <div className="account-page">
            <div className="account-card">
                <h1 className="account-header">Account Information</h1>
                <p className="account-subtext">Signed in as: {username || '-'}</p>

                <div className="account-actions">
                    <button className="primary-button" onClick={onChangePassword}>
                        Change Password
                    </button>

                    <button className="primary-button" onClick={onLogout} type="button">
                        Log Out
                    </button>

                    <button className="secondary-button" onClick={onBack}>Back</button>
                </div>
            </div>
        </div>
    )
}

export default AccountPage