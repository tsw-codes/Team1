import { useState } from 'react'
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

import { getPermissionsForRole } from './auth/permissions'
import { authenticateUser, updateUserPassword } from './services/authService'

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
        transition={{ duration: 0.5, ease: 'easeInOut'}}
      >
        {children}
      </motion.div>
    )
  }

function App() {
  const navigate = useNavigate()
  const location = useLocation()

  const [navDirection, setNavDirection] = useState('forward')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)

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

  function handleLogin(e) {
    e.preventDefault()

    const validUser = authenticateUser(loginForm.username, loginForm.password)

    if (validUser) {
      setCurrentUser(validUser)
      setLoginError('')
      setIsLoggedIn(true)
      setNavDirection('forward')
      navigate('/home')
      return
    }

    setLoginError('Invalid username or password.')
  }

  function handleLogout() {
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

  function handleChangePasswordSubmit(e) {
    e.preventDefault()

    const { currentPassword, newPassword, confirmNewPassword } = changePasswordForm

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setChangePasswordSuccess('')
      setChangePasswordError('Please complete all password fields.')
      return
    }

    if (currentPassword !== currentUser.password) {
      setChangePasswordSuccess('')
      setChangePasswordError('Current password is incorrect.')
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

    const updatedUser = updateUserPassword(currentUser.id, newPassword)

    if (!updatedUser) {
      setChangePasswordSuccess('')
      setChangePasswordError('Unable to update password.')
      return
    }

    setCurrentUser(updatedUser)

    setLoginForm((prev) => ({
      ...prev,
      password: newPassword,
    }))

    setChangePasswordError('')
    setChangePasswordSuccess('Password changed successfully.')

    setChangePasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    })
  }

  function handleBackToAccount() {
    setNavDirection('back')
    navigate('/account')
  }

  const permissions = currentUser ? getPermissionsForRole(currentUser.role) : []

  const showAccountIcon = isLoggedIn && location.pathname !== '/login'

  return(
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
                          onChangePassword={handleOpenChangePassword}
                          onLogout={handleLogout}
                          onBack={handleGoHome}
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

                <Route path="*" element={<Navigate to='/login' replace />} />
              </Routes>
            </AnimatePresence>
          </section>
        </main>
      </div>
    </>
  )
}


export default App
