import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import './App.css'

import Navbar from './components/Navbar'
import LoginPage from './components/LoginPage'
import HomePage from './components/HomePage'
import AccountPage from './components/AccountPage'
import ChangePasswordPage from './components/ChangePasswordPage'
import InventoryPage from './components/InventoryPage'
import ReceiveInventoryPage from './components/ReceiveInventoryPage'
import RequestMaterialPage from './components/RequestMaterialPage'
import ManifestInventoryPage from './components/ManifestInventoryPage'
import TransferInventoryPage from './components/TransferInventoryPage'
import PendingRequestsPage from './components/PendingRequestsPage'
import ShipmentTrackingPage from './components/ShipmentTrackingPage'
import EnterPurchaseOrderPage from './components/EnterPurchaseOrderPage'
import ManageLocationsPage from './components/ManageLocationsPage'
import NotFoundPage from './components/NotFoundPage'

import { getPermissionsForRole } from './auth/permissions'
import {
  authenticateUser,
  updateUserPassword,
  signOut,
  getCurrentSession,
  onAuthStateChange,
} from './services/authService'
import {
  applyUiPreferences,
  getStoredUiPreferences,
  updateStoredUiPreferences,
} from './services/uiPreferencesService'

const pageVariants = {
  enter: (direction) => ({
    x: direction === 'back' ? '-100%' : '100%',
    opacity: 0.95,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction) => ({
    x: direction === 'back' ? '100%' : '-100%',
    opacity: 0.95,
  }),
}

function PageTransition({ children, direction }) {
  return (
    <motion.div
      className='route-page'
      custom={direction}
      variants={pageVariants}
      initial='enter'
      animate='center'
      exit='exit'
      transition={{ duration: 0.5, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  )
}

function App() {
  const navigate = useNavigate()
  const location = useLocation()

  const [accountToast, setAccountToast] = useState({ message: '', type: 'success' })

  const [navDirection, setNavDirection] = useState('forward')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState(null)

  const [uiPreferences, setUiPreferences] = useState(() => getStoredUiPreferences())

  const [loginForm, setLoginForm] = useState({
    username: '',
    password: '',
  })
  const [loginError, setLoginError] = useState('')

  const [changePasswordForm, setChangePasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
  })

  const [changePasswordError, setChangePasswordError] = useState('')
  const [changePasswordSuccess, setChangePasswordSuccess] = useState('')

  useEffect(() => {
    applyUiPreferences(uiPreferences)
  }, [uiPreferences])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined
    }

    if (uiPreferences.theme !== 'system') {
      return undefined
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleThemeChange = () => {
      applyUiPreferences(uiPreferences)
    }

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleThemeChange)
      return () => mediaQuery.removeEventListener('change', handleThemeChange)
    }

    mediaQuery.addListener(handleThemeChange)
    return () => mediaQuery.removeListener(handleThemeChange)
  }, [uiPreferences])

  // Restore session on page refresh
  useEffect(() => {
    getCurrentSession()
      .then((profile) => {
        if (profile) {
          setCurrentUser(profile)
          setIsLoggedIn(true)
        }
      })
      .finally(() => {
        setSessionLoading(false)
      })
  }, [])

  // Listen for auth state changes (token expiry, sign out from another tab)
  useEffect(() => {
    const unsubscribe = onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setIsLoggedIn(false)
        setCurrentUser(null)
        navigate('/login')
      }
    })
    return unsubscribe
  }, [navigate])

  function handleThemePreferenceChange(theme) {
    const next = updateStoredUiPreferences({ theme })
    setUiPreferences(next)
  }

  function handleStickyHeadersChange(stickyHeadersEnabled) {
    const next = updateStoredUiPreferences({ stickyHeadersEnabled })
    setUiPreferences(next)
  }

  function showAccountToast(message, type = 'success') {
    setAccountToast({ message, type })

    window.clearTimeout(showAccountToast.timeoutId)
    showAccountToast.timeoutId = window.setTimeout(() => {
      setAccountToast({ message: '', type: 'success' })
    }, 3000)
  }

  function handleChange(e) {
    const { name, value } = e.target
    setLoginForm((prev) => ({
      ...prev,
      [name]: value,
    }))

    if (loginError) {
      setLoginError('')
    }
  }

  async function handleLogin(e) {
    e.preventDefault()

    if (!loginForm.username.trim()) {
      setLoginError('Username is required.')
      return
    }

    if (!loginForm.password) {
      setLoginError('Password is required.')
      return
    }

    try {
      const validUser = await authenticateUser(loginForm.username, loginForm.password)

      if (validUser) {
        setCurrentUser(validUser)
        setLoginError('')
        setIsLoggedIn(true)
        setNavDirection('forward')
        navigate('/home')
        return
      }

      setLoginError('Invalid username or password.')
    } catch (err) {
      setLoginError(err.message || 'Something went wrong. Please try again.')
    }
  }

  async function handleLogout() {
    try {
      await signOut()
    } catch (err) {
      console.error('Sign out error:', err.message)
    }

    setIsLoggedIn(false)
    setCurrentUser(null)

    setLoginForm({
      username: '',
      password: '',
    })

    setChangePasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    })

    setLoginError('')
    setChangePasswordError('')
    setChangePasswordSuccess('')
    setNavDirection('back')

    navigate('/login')
  }

  function handleOpenAccount() {
    setNavDirection('forward')
    navigate('/account')
  }

  function handleOpenPage(path) {
    setNavDirection('forward')
    navigate(path)
  }

  function handleGoHome() {
    setNavDirection('back')
    navigate('/home')
  }

  function handleOpenChangePassword() {
    setChangePasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    })
    setChangePasswordError('')
    setChangePasswordSuccess('')
    setNavDirection('forward')
    navigate('/change-password')
  }

  function handleChangePasswordInput(e) {
    const { name, value } = e.target

    setChangePasswordForm((prev) => ({
      ...prev,
      [name]: value,
    }))

    if (changePasswordError) {
      setChangePasswordError('')
    }

    if (changePasswordSuccess) {
      setChangePasswordSuccess('')
    }
  }

  async function handleChangePasswordSubmit(e) {
    e.preventDefault()

    const { currentPassword, newPassword, confirmNewPassword } = changePasswordForm

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setChangePasswordSuccess('')
      setChangePasswordError('Please complete all password fields.')
      return
    }

    if (newPassword !== confirmNewPassword) {
      setChangePasswordSuccess('')
      setChangePasswordError('New password and confirmation do not match.')
      return
    }

    const hasMinLength = newPassword.length >= 8
    const hasUppercase = /[A-Z]/.test(newPassword)
    const hasNumber = /\d/.test(newPassword)
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword)

    if (!hasMinLength || !hasUppercase || !hasNumber || !hasSpecialChar) {
      setChangePasswordSuccess('')
      setChangePasswordError(
        'Password must be at least 8 characters and include a capital letter, number, and a special character.'
      )
      return
    }

    if (newPassword === currentPassword) {
      setChangePasswordSuccess('')
      setChangePasswordError('New password must be different from current password.')
      return
    }

    try {
      const updatedUser = await updateUserPassword(currentUser.id, currentPassword, newPassword)

      if (!updatedUser) {
        setChangePasswordSuccess('')
        setChangePasswordError('Current password is incorrect.')
        return
      }

      setCurrentUser(updatedUser)

      setChangePasswordError('')
      setChangePasswordSuccess('')

      setChangePasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmNewPassword: '',
      })

      showAccountToast('Password changed successfully.')
      setNavDirection('back')
      navigate('/account')
    } catch (err) {
      setChangePasswordSuccess('')
      setChangePasswordError(err.message || 'Unable to update password.')
    }
  }

  function handleBackToAccount() {
    setNavDirection('back')
    navigate('/account')
  }

  const permissions = currentUser ? getPermissionsForRole(currentUser.role) : []

  const showAccountIcon = isLoggedIn && location.pathname !== '/login'

  if (sessionLoading) return null

  return (
    <>
      <div className='orientation-block'>
        <div className='orientation-message'>
          <img src='/mec2.png' alt='Company Logo' className='orientation-logo' />

          <p>Please rotate your device back to portrait mode.</p>
        </div>
      </div>

      <div className='app-shell'>
        <Navbar
          isLoggedIn={showAccountIcon}
          onAccountClick={handleOpenAccount}
        />

        <main className='main-layout'>
          <section className='content-window'>
            <AnimatePresence mode='wait' custom={navDirection}>
              <Routes location={location} key={location.pathname}>
                <Route
                  path='/login'
                  element={
                    <PageTransition direction={navDirection}>
                      <LoginPage
                        loginForm={loginForm}
                        loginError={loginError}
                        onChange={handleChange}
                        onLogin={handleLogin}
                      />
                    </PageTransition>
                  }
                />

                <Route
                  path='/home'
                  element={
                    isLoggedIn ? (
                      <PageTransition direction={navDirection}>
                        <HomePage
                          name={currentUser?.name ?? ""}
                          permissions={permissions}
                          onOpenPage={handleOpenPage}
                        />
                      </PageTransition>
                    ) : (
                      <Navigate to='/login' replace />
                    )
                  }
                />

                <Route
                  path='/account'
                  element={
                    isLoggedIn ? (
                      <PageTransition direction={navDirection}>
                        <AccountPage
                          username={currentUser?.username ?? ''}
                          name={currentUser?.name ?? ''}
                          role={currentUser?.role ?? ''}
                          themePreference={uiPreferences.theme}
                          stickyHeadersEnabled={uiPreferences.stickyHeadersEnabled}
                          onThemeChange={handleThemePreferenceChange}
                          onStickyHeadersChange={handleStickyHeadersChange}
                          onChangePassword={handleOpenChangePassword}
                          onLogout={handleLogout}
                          onBack={handleGoHome}
                          toast={accountToast}
                          onCloseToast={() => setAccountToast({ message: '', type: 'success' })}
                        />
                      </PageTransition>
                    ) : (
                      <Navigate to='/login' replace />
                    )
                  }
                />

                <Route
                  path='/change-password'
                  element={
                    isLoggedIn ? (
                      <PageTransition direction={navDirection}>
                        <ChangePasswordPage
                          form={changePasswordForm}
                          error={changePasswordError}
                          success={changePasswordSuccess}
                          onChange={handleChangePasswordInput}
                          onSubmit={handleChangePasswordSubmit}
                          onBack={handleBackToAccount}
                        />
                      </PageTransition>
                    ) : (
                      <Navigate to='/login' replace />
                    )
                  }
                />

                <Route
                  path='/inventory'
                  element={
                    isLoggedIn ? (
                      <PageTransition direction={navDirection}>
                        <InventoryPage
                          permissions={permissions}
                          currentUser={currentUser}
                          onBack={handleGoHome}
                        />
                      </PageTransition>
                    ) : (
                      <Navigate to='/login' replace />
                    )
                  }
                />

                <Route
                  path='/receive-inventory'
                  element={
                    isLoggedIn ? (
                      <PageTransition direction={navDirection}>
                        <ReceiveInventoryPage
                          onBack={handleGoHome}
                          currentUser={currentUser}
                          permissions={permissions}
                        />
                      </PageTransition>
                    ) : (
                      <Navigate to='/login' replace />
                    )
                  }
                />

                <Route
                  path='/request-material'
                  element={
                    isLoggedIn ? (
                      <PageTransition direction={navDirection}>
                        <RequestMaterialPage
                          onBack={handleGoHome}
                          currentUser={currentUser}
                        />
                      </PageTransition>
                    ) : (
                      <Navigate to='/login' replace />
                    )
                  }
                />

                <Route
                  path='/manifest-inventory'
                  element={
                    isLoggedIn ? (
                      <PageTransition direction={navDirection}>
                        <ManifestInventoryPage
                          onBack={handleGoHome}
                          currentUser={currentUser}
                          permissions={permissions}
                        />
                      </PageTransition>
                    ) : (
                      <Navigate to='/login' replace />
                    )
                  }
                />

                <Route
                  path='/transfer-inventory'
                  element={
                    isLoggedIn ? (
                      <PageTransition direction={navDirection}>
                        <TransferInventoryPage
                          onBack={handleGoHome}
                          currentUser={currentUser}
                          permissions={permissions}
                        />
                      </PageTransition>
                    ) : (
                      <Navigate to='/login' replace />
                    )
                  }
                />

                <Route
                  path='/pending-requests'
                  element={
                    isLoggedIn ? (
                      <PageTransition direction={navDirection}>
                        <PendingRequestsPage
                          onBack={handleGoHome}
                          currentUser={currentUser}
                        />
                      </PageTransition>
                    ) : (
                      <Navigate to='/login' replace />
                    )
                  }
                />

                <Route
                  path='/shipment-tracking'
                  element={
                    isLoggedIn ? (
                      <PageTransition direction={navDirection}>
                        <ShipmentTrackingPage
                          onBack={handleGoHome}
                          permissions={permissions}
                        />
                      </PageTransition>
                    ) : (
                      <Navigate to='/login' replace />
                    )
                  }
                />

                <Route
                  path='/manage-locations'
                  element={
                    isLoggedIn && permissions.includes("manage_locations") ? (
                      <PageTransition direction={navDirection}>
                        <ManageLocationsPage
                          onBack={handleGoHome}
                        />
                      </PageTransition>
                    ) : (
                      <Navigate to='/login' replace />
                    )
                  }
                />

                <Route
                  path='/enter-purchase-order'
                  element={
                    isLoggedIn && permissions.includes("upload_purchase_orders") ? (
                      <PageTransition direction={navDirection}>
                        <EnterPurchaseOrderPage
                          onBack={handleGoHome}
                          currentUser={currentUser}
                        />
                      </PageTransition>
                    ) : (
                      <Navigate to='/login' replace />
                    )
                  }
                />

                <Route
                  path='*'
                  element={
                    <PageTransition direction={navDirection}>
                      <NotFoundPage />
                    </PageTransition>
                  }
                />
              </Routes>
            </AnimatePresence>
          </section>
        </main>
      </div>
    </>
  )
}

export default App
