import { useNavigate } from "react-router-dom"

function HomePage({ name, permissions, onOpenInventory, onOpenPage }) {
    const navigate = useNavigate()

    const homeActions = [
        {
            key: 'view_inventory',
            title: 'View Inventory',
            description: 'Check material quantities and locations.',
            icon: '📦',
            path: '/inventory',
            permission: 'view_inventory',
        },
        {
            key: 'request_material',
            title: 'Request Material',
            description: 'Submit a material request.',
            icon: '📝',
            path: '/request-material',
            permission: 'request_material',
        },
        {
            key: 'receive_inventory',
            title: 'Receive Inventory',
            description: 'Log incoming materials.',
            icon: '🚚',
            path: '/receive-inventory',
            permission: 'receive_inventory',
        },
        {
            key: 'admin_tools',
            title: 'Admin Tools',
            description: 'Manage users and settings.',
            icon: '⚙️',
            path: '/admin-tools',
            permission: 'manage_users',
        },
    ]

    const allowedActions = homeActions.filter((action) =>
        permissions.includes(action.permission)
    )
    return (
        <div className="home-page">
            <div className="home-card">
                <div className="home-card-header">
                    <h1 className="home-title">Home</h1>
                    <p className="home-subtext">Welcome, {name || 'User'}.</p>
                </div>

                <div className="home-grid-wrap">
                    <div className="home-grid">
                        {allowedActions.map((action) => (
                            <button
                                key={action.key}
                                className="home-tile"
                                type="button"
                                onClick={() =>
                                    onOpenPage ? onOpenPage(action.path) : navigate(action.path)
                                }
                            >
                                <div className="home-tile-header">
                                    <div className="home-tile-icon">{action.icon}</div>
                                    <div className="home-tile-title">{action.title}</div>
                                    <div className="home-tile-arrow">
                                        <svg
                                            width="18"
                                            height="18"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                        >
                                            <path 
                                                d="M9 6l6 6-6 6"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                        </svg>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default HomePage