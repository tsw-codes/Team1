function Navbar({ isLoggedIn, onAccountClick }) {
    return (
        <header className='topbar'>
            <div className='topbar-inner'>
                <div className='topbar-left'>
                    <img src='/mec2.png' alt='Company Logo' className='topbar-logo' />
                    <div className='topbar-title'>Inventory Management</div>
                </div>

                {isLoggedIn && (
                    <button className="account-button" onClick={onAccountClick} aria-label="account">
                        <img src='/account-icon.png' alt='Company Logo' className='account-icon' />
                    </button>
                )}
            </div>
        </header>
    )
}

export default Navbar