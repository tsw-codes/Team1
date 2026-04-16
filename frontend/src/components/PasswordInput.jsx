import { useState } from "react"

function PasswordInput({
    name,
    value,
    onChange,
    onFocus,
    onBlur,
    className = "",
    placeholder = "",
    autoComplete = "current-password",
    disabled = false,
}) {
    const [show, setShow] = useState(false)

    return (
        <div className="password-input-wrapper">
            <input
                type={show ? "text" : "password"}
                name={name}
                value={value}
                onChange={onChange}
                onFocus={onFocus}
                onBlur={onBlur}
                placeholder={placeholder}
                autoComplete={autoComplete}
                disabled={disabled}
                className={`form-input${className ? ` ${className}` : ""}`}
            />

            <button
                type="button"
                className="password-toggle"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShow((prev) => !prev)}
                aria-label={show ? "Hide password" : "Show password"}
                title={show ? "Hide password" : "Show password"}
                disabled={disabled}
            >
                {show ? (
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                    >
                        <path
                            d="M3 3l18 18"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                        />
                        <path
                            d="M10.58 10.58a2 2 0 102.83 2.83"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                        />
                        <path
                            d="M6.71 6.71C3.94 8.4 2 12 2 12s4 6 10 6c1.61 0 3.08-.33 4.4-.92"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                        />
                        <path
                            d="M9.88 5.08C10.56 5.03 11.27 5 12 5c6 0 10 7 10 7a21.8 21.8 0 01-3.34 4.34"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                        />
                    </svg>
                ) : (
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                    >
                        <path
                            d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                        />
                        <circle
                            cx="12"
                            cy="12"
                            r="3"
                            stroke="currentColor"
                            strokeWidth="3"
                        />
                    </svg>
                )}
            </button>
        </div>
    )
}

export default PasswordInput