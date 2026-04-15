import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { getRequestsPendingApproval, subscribeToRequests } from "../services/requestService"

function HomePage({ name, permissions, onOpenPage }) {
    const navigate = useNavigate()
    const groupRefs = useRef({})

    const [pendingRequestCount, setPendingRequestCount] = useState(0)

    const isAdminUser =
        permissions.includes("manage_users") ||
        permissions.includes("manage_locations") ||
        permissions.includes("manage_projects")

    const [openGroup, setOpenGroup] = useState("")

    useEffect(() => {
        async function updateCount() {
            const requests = await getRequestsPendingApproval()
            setPendingRequestCount(requests.length)
        }

        updateCount()

        const unsubscribe = subscribeToRequests(updateCount)

        return unsubscribe
    }, [])

    useEffect(() => {
        if (!isAdminUser || !openGroup) return

        const timeoutId = setTimeout(() => {
            const container = document.querySelector(".home-grid-wrap")
            const target = groupRefs.current[openGroup]

            if (!container || !target) return

            const containerRect = container.getBoundingClientRect()
            const targetRect = target.getBoundingClientRect()

            container.scrollTo({
                top: container.scrollTop + (targetRect.top - containerRect.top) - 12,
                behavior: "smooth",
            })
        }, 0)

        return () => clearTimeout(timeoutId)
    }, [isAdminUser, openGroup])

    function openPath(path) {
        if (!path) return
        onOpenPage ? onOpenPage(path) : navigate(path)
    }

    function handleGroupToggle(groupKey) {
        setOpenGroup((prev) => (prev === groupKey ? "" : groupKey))
    }

    const homeActions = [
        {
            key: "view_inventory",
            title: "View Inventory",
            description: "Check material quantities and locations.",
            icon: "📦",
            path: "/inventory",
            permission: "view_inventory",
        },
        {
            key: "request_material",
            title: "Request Material",
            description: "Submit a material request.",
            icon: "📝",
            path: "/request-material",
            permission: "request_material",
        },
        {
            key: "pending_requests",
            title: "Pending Requests",
            description: "Review and approve material requests.",
            icon: "✅",
            path: "/pending-requests",
            permission: "approve_requests",
            badgeCount: pendingRequestCount,
        },
        {
            key: "manifest_inventory",
            title: "Manifest Inventory",
            description: "Build a manifest from an approved request.",
            icon: "📋",
            path: "/manifest-inventory",
            permission: "manifest_inventory",
        },
        {
            key: "transfer_inventory",
            title: "Transfer Inventory",
            description: "Execute shipment and receipt for finalized manifests.",
            icon: "🔄",
            path: "/transfer-inventory",
            permission: "transfer_inventory",
        },
        {
            key: "receive_inventory",
            title: "Receive Inventory",
            description: "Log incoming materials.",
            icon: "🚚",
            path: "/receive-inventory",
            permission: "receive_inventory",
        },
        {
            key: "shipment_tracking",
            title: "Shipment Tracking",
            description: "Track request and shipment workflow status.",
            icon: "📉",
            path: "/shipment-tracking",
            permission: "track_shipment",
        },
        {
            key: "admin_tools",
            title: "Admin Tools",
            description: "Manage users and settings.",
            icon: "⚙️",
            path: "/admin-tools",
            permission: "manage_users",
        },
    ]

    const groupedActions = [
        {
            key: "operations",
            title: "Operations",
            icon: "🧰",
            items: [
                homeActions.find((action) => action.key === "view_inventory"),
                homeActions.find((action) => action.key === "request_material"),
                homeActions.find((action) => action.key === "pending_requests"),
            ].filter(Boolean),
        },
        {
            key: "inventory_tools",
            title: "Inventory Tools",
            icon: "🏗️",
            items: [
                homeActions.find((action) => action.key === "manifest_inventory"),
                homeActions.find((action) => action.key === "transfer_inventory"),
                homeActions.find((action) => action.key === "receive_inventory"),
            ].filter(Boolean),
        },
        {
            key: "reporting",
            title: "Reporting",
            icon: "📊",
            items: [
                homeActions.find((action) => action.key === "shipment_tracking"),
            ].filter(Boolean),
        },
        {
            key: "admin_tools",
            title: "Admin Tools",
            icon: "⚙️",
            items: [
                {
                    key: "manage_users",
                    title: "Manage Users",
                    description: "Create, update, and manage user access.",
                    icon: "👥",
                    path: "/manage-users",
                    permission: "manage_users",
                },
                {
                    key: "manage_locations",
                    title: "Manage Locations",
                    description: "Maintain warehouse and site locations.",
                    icon: "📌",
                    path: "/manage-locations",
                    permission: "manage_locations",
                },
                {
                    key: "manage_projects",
                    title: "Manage Projects",
                    description: "Maintain project records and assignments.",
                    icon: "🗂️",
                    path: "/manage-projects",
                    permission: "manage_projects",
                },
            ],
        },
    ]

    const allowedActions = homeActions.filter((action) =>
        permissions.includes(action.permission)
    )

    const allowedGroups = groupedActions
        .map((group) => ({
            ...group,
            items: group.items.filter((item) => permissions.includes(item.permission)),
        }))
        .filter((group) => group.items.length > 0)

    return (
        <div className="home-page">
            <div className="home-card">
                <div className="home-card-header">
                    <h1 className="home-title">Home</h1>
                    <p className="home-subtext">Welcome, {name || "User"}.</p>
                </div>

                <div className="home-grid-wrap">
                    {!isAdminUser ? (
                        <div className="home-grid">
                            {allowedActions.map((action) => (
                                <button
                                    key={action.key}
                                    className="home-tile"
                                    type="button"
                                    onClick={() => openPath(action.path)}
                                >
                                    {action.key === "pending_requests" && action.badgeCount > 0 && (
                                        <div
                                            key={action.badgeCount}
                                            className="home-tile-badge home-tile-badge-animate"
                                        >
                                            {action.badgeCount > 99 ? "99+" : action.badgeCount}
                                        </div>
                                    )}

                                    <div className="home-tile-header">
                                        <div className="home-tile-icon">{action.icon}</div>
                                        <div className="home-tile-title">{action.title}</div>
                                        <div className="home-tile-arrow">
                                            <svg
                                                width="18"
                                                height="18"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                aria-hidden="true"
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
                    ) : (
                        <div className="home-groups">
                            {allowedGroups.map((group) => {
                                const isOpen = openGroup === group.key

                                return (
                                    <div
                                        key={group.key}
                                        ref={(el) => {
                                            groupRefs.current[group.key] = el
                                        }}
                                        className={`home-group-card ${isOpen ? "open" : ""}`}
                                    >
                                        <button
                                            className="home-group-toggle"
                                            type="button"
                                            onClick={() => handleGroupToggle(group.key)}
                                            aria-expanded={isOpen}
                                        >
                                            <div className="home-group-left">
                                                <div className="home-group-icon">{group.icon}</div>
                                                <div className="home-group-title">{group.title}</div>
                                            </div>

                                            <div className={`home-group-chevron ${isOpen ? "open" : ""}`}>
                                                <svg
                                                    width="18"
                                                    height="18"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    aria-hidden="true"
                                                >
                                                    <path
                                                        d="M6 9l6 6 6-6"
                                                        stroke="currentColor"
                                                        strokeWidth="2"
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                    />
                                                </svg>
                                            </div>
                                        </button>

                                        {isOpen && (
                                            <div className="home-group-items">
                                                {group.items.map((action) => (
                                                    <button
                                                        key={action.key}
                                                        className="home-subtile"
                                                        type="button"
                                                        onClick={() => openPath(action.path)}
                                                    >
                                                        {action.key === "pending_requests" && action.badgeCount > 0 && (
                                                            <div
                                                                key={action.badgeCount}
                                                                className="home-tile-badge home-tile-badge-animate"
                                                            >
                                                                {action.badgeCount > 99 ? "99+" : action.badgeCount}
                                                            </div>
                                                        )}

                                                        <div className="home-tile-header">
                                                            <div className="home-tile-icon">{action.icon}</div>
                                                            <div className="home-tile-title">{action.title}</div>
                                                            <div className="home-tile-arrow">
                                                                <svg
                                                                    width="18"
                                                                    height="18"
                                                                    viewBox="0 0 24 24"
                                                                    fill="none"
                                                                    aria-hidden="true"
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
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default HomePage