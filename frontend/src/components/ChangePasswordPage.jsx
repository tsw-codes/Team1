import { useState } from "react"
import PasswordInput from "./PasswordInput"

function ChangePasswordPage({ form, error, success, onChange, onSubmit, onBack }) {
    const [isNewPasswordFocused, setIsNewPasswordFocused] = useState(false)
    const { currentPassword, newPassword, confirmNewPassword } = form

    const hasMinLength = newPassword.length >= 8
    const hasUppercase = /[A-Z]/.test(newPassword)
    const hasNumber = /\d/.test(newPassword)
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword)

    const passwordsMatch = newPassword && confirmNewPassword && newPassword === confirmNewPassword

    const isNewPasswordValid = hasMinLength && hasUppercase && hasNumber && hasSpecialChar

    const canSave =
        currentPassword &&
        newPassword &&
        confirmNewPassword &&
        isNewPasswordValid &&
        passwordsMatch &&
        newPassword !== currentPassword

    const showPasswordRules = (isNewPasswordFocused || newPassword) && !isNewPasswordValid

    return (
        <div className="change-password-page">
            <div className="change-password-card">
                <h1 className="account-header">Change Password</h1>

                <form className="change-password-form" onSubmit={onSubmit}>
                    <div className="form-group">
                        <label className="form-label">Current Password</label>
                        <PasswordInput
                            name="currentPassword"
                            value={form.currentPassword}
                            onChange={onChange}
                            placeholder="Enter current password"
                            autoComplete="current-password"
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">New Password</label>
                        <PasswordInput
                            name="newPassword"
                            value={form.newPassword}
                            onChange={onChange}
                            placeholder="Enter new password"
                            onFocus={() => setIsNewPasswordFocused(true)}
                            onBlur={() => setIsNewPasswordFocused(false)}
                            autoComplete="new-password"
                        />
                    </div>

                    <div className={`password-rules ${showPasswordRules ? "visible" : "hidden"}`}>
                        <div className={`rule ${hasMinLength ? "valid" : ""}`}>
                            {hasMinLength ? "✔" : "•"} At least 8 characters
                        </div>

                        <div className={`rule ${hasUppercase ? "valid" : ""}`}>
                            {hasUppercase ? "✔" : "•"} One uppercase letter
                        </div>

                        <div className={`rule ${hasNumber ? "valid" : ""}`}>
                            {hasNumber ? "✔" : "•"} One number
                        </div>

                        <div className={`rule ${hasSpecialChar ? "valid" : ""}`}>
                            {hasSpecialChar ? "✔" : "•"} One special character
                        </div>
                    </div>

                    {isNewPasswordValid && (
                        <div className="rule valid">✔ Strong password</div>
                    )}

                    <div className="form-group">
                        <label className="form-label">Confirm New Password</label>
                        <PasswordInput
                            name="confirmNewPassword"
                            value={form.confirmNewPassword}
                            onChange={onChange}
                            placeholder="Confirm new password"
                            autoComplete="new-password"
                        />
                    </div>

                    {confirmNewPassword && (
                        <div className={`rule ${passwordsMatch ? "valid" : "invalid"}`}>
                            {passwordsMatch ? "✔" : "✖"} Passwords match
                        </div>
                    )}

                    {error && <div className="form-message form-message-error">{error}</div>}
                    {success && <div className="form-message form-message-success">{success}</div>}

                    <div className="change-password-actions">
                        <button className="primary-button" type="submit" disabled={!canSave}>
                            Save
                        </button>
                        <button className="secondary-button" type="button" onClick={onBack}>
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

export default ChangePasswordPage