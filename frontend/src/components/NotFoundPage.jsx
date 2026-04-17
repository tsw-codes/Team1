import { useNavigate } from 'react-router-dom'

function NotFoundPage() {
    const navigate = useNavigate()

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo-wrapper">
                    <img src="/mec2.png" alt="Company Logo" className="login-logo" />
                </div>

                <h2 className="account-header">Page Not Found</h2>
                <p className="form-label" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                    The page you're looking for doesn't exist.
                </p>

                <button className="primary-button" onClick={() => navigate('/home')}>
                    Go to Home
                </button>
            </div>
        </div>
    )
}

export default NotFoundPage
