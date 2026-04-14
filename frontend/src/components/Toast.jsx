function Toast({ message, type = "success", onClose }) {
    if (!message) return null

    return (
        <div className={`toast toast-${type}`} role="status" aria-live="polite">
            <span className="toast-message">{message}</span>

            <button
                className="toast-close"
                type="button"
                onClick={onClose}
                aria-label="Close notification"
            >
                ×
            </button>
        </div>
    )
}

export default Toast