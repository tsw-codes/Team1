import { supabase, USE_MOCK } from '../lib/supabaseClient'
import { mockUsers } from '../auth/mockUsers'

const EMAIL_DOMAIN = 'coolsys.com'

/**
 * Returns all user profiles. Mock mode returns the local mock users array.
 */
export async function getAllUsers() {
  if (USE_MOCK) {
    return mockUsers.map(({ id, username, name, role }) => ({ id, username, name, role }))
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, name, role')

  if (error) throw new Error(`Failed to load users: ${error.message}`)
  return data
}

/**
 * Authenticates a user by username and password.
 * Returns { id, username, name, role } or null if invalid.
 */
export async function authenticateUser(username, password) {
  if (USE_MOCK) {
    const user = mockUsers.find(
      (u) => u.username === username && u.password === password
    )
    return user ? { id: user.id, username: user.username, name: user.name, role: user.role } : null
  }

  const email = `${username}@${EMAIL_DOMAIN}`

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) return null

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, name, role')
    .eq('id', data.user.id)
    .single()

  if (profileError) throw new Error(`Failed to load user profile: ${profileError.message}`)

  return profile
}

/**
 * Finds a user profile by their ID.
 */
export async function findUserById(id) {
  if (USE_MOCK) {
    const user = mockUsers.find((u) => u.id === id)
    return user ? { id: user.id, username: user.username, name: user.name, role: user.role } : null
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, name, role')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

/**
 * Finds a user profile by their username.
 */
export async function findUserByUsername(username) {
  if (USE_MOCK) {
    const user = mockUsers.find((u) => u.username === username)
    return user ? { id: user.id, username: user.username, name: user.name, role: user.role } : null
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, name, role')
    .eq('username', username)
    .single()

  if (error) return null
  return data
}

/**
 * Updates the current user's password.
 * Verifies the current password first, then sets the new one.
 * Returns the updated profile or null on failure.
 */
export async function updateUserPassword(userId, currentPassword, newPassword) {
  if (USE_MOCK) {
    const index = mockUsers.findIndex((u) => u.id === userId)
    if (index === -1) return null

    if (mockUsers[index].password !== currentPassword) return null

    mockUsers[index] = { ...mockUsers[index], password: newPassword }
    return { id: mockUsers[index].id, username: mockUsers[index].username, name: mockUsers[index].name, role: mockUsers[index].role }
  }

  // Verify current password by attempting sign-in
  const { data: session } = await supabase.auth.getSession()
  if (!session?.session?.user?.email) {
    throw new Error('No active session. Please log in again.')
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: session.session.user.email,
    password: currentPassword,
  })

  if (verifyError) return null

  // Update to new password
  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  })

  if (updateError) throw new Error(`Failed to update password: ${updateError.message}`)

  // Return the profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, name, role')
    .eq('id', userId)
    .single()

  return profile
}

/**
 * Signs out the current user.
 */
export async function signOut() {
  if (USE_MOCK) return

  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(`Failed to sign out: ${error.message}`)
}

/**
 * Gets the current session and profile.
 * Returns { id, username, name, role } if a valid session exists, null otherwise.
 * Used on app mount to restore login state after page refresh.
 */
export async function getCurrentSession() {
  if (USE_MOCK) return null

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, username, name, role')
    .eq('id', session.user.id)
    .single()

  if (error) return null
  return profile
}

/**
 * Subscribes to auth state changes (token refresh, expiry, sign out).
 * Returns an unsubscribe function.
 *
 * Usage in App.jsx:
 *   useEffect(() => {
 *     const unsub = onAuthStateChange((event) => {
 *       if (event === 'SIGNED_OUT') handleLogout()
 *     })
 *     return unsub
 *   }, [])
 */
export function onAuthStateChange(callback) {
  if (USE_MOCK) return () => {}

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    callback(event)
  })

  return () => subscription.unsubscribe()
}
