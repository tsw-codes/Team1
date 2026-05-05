import PasswordInput from "./PasswordInput"

function LoginPage({ loginForm, loginErrors, onChange, onLogin}) {
    return(
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo-wrapper">
                    <img src="/mec2.png" alt="Company Logo" className="login-logo" />
                </div>

                <form className="login-form" onSubmit={onLogin}>
                    <label className="form-group">
                        <span className="form-label">Username</span>
                        <input
                            className="form-input"
                            type="text"
                            name="username"
                            value={loginForm.username}
                            onChange={onChange}
                            placeholder="Enter Username"
                        />  
                    </label>

                    <label className="form-group">
                        <span className="form-label">Password</span>

                        <PasswordInput
                            name="password"
                            value={loginForm.password}
                            onChange={onChange}
                            placeholder="Enter Password"
                        />
                    </label>

                    {loginErrors.username && <div className="login-error">{loginErrors.username}</div>}
                    {loginErrors.password && <div className="login-error">{loginErrors.password}</div>}
                    {loginErrors.general && <div className="login-error">{loginErrors.general}</div>}

                    <button className="primary-button" type="submit">Log In</button>
                </form>
            </div>
        </div>
    )
}

export default LoginPage