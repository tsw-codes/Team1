import { supabase, USE_MOCK } from "../lib/supabaseClient"
import { mockUsers } from "../auth/mockUsers"

export const MANAGE_USER_ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "projectManager", label: "Project Manager" },
  { value: "warehouseManager", label: "Warehouse Manager" },
  { value: "logisticsAssociate", label: "Logistics Associate" },
  { value: "logisticsForeman", label: "Logistics Foreman" },
]

const ROLE_LABELS = Object.fromEntries(
  MANAGE_USER_ROLE_OPTIONS.map((option) => [option.value, option.label]),
)

function splitDisplayName(name = "") {
  const normalized = String(name || "").trim()
  if (!normalized) return { firstName: "", lastName: "" }

  const [firstName, ...rest] = normalized.split(/\s+/)
  return {
    firstName: firstName || "",
    lastName: rest.join(" ").trim(),
  }
}

function normalizeNamePart(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".")
}

function buildFullName(firstName = "", lastName = "") {
  return [String(firstName || "").trim(), String(lastName || "").trim()]
    .filter(Boolean)
    .join(" ")
    .trim()
}

function defaultEmailForName(firstName = "", lastName = "") {
  const username = buildBaseUsername(firstName, lastName)
  return username ? `${username}@coolsys.com` : ""
}

function buildBaseUsername(firstName = "", lastName = "") {
  return [normalizeNamePart(firstName), normalizeNamePart(lastName)]
    .filter(Boolean)
    .join(".")
}

function buildUniqueUsername(firstName, lastName, users = [], excludeUserId = "") {
  const base = buildBaseUsername(firstName, lastName) || "user"
  const takenUsernames = new Set(
    users
      .filter((user) => String(user.id) !== String(excludeUserId))
      .map((user) => String(user.username || "").toLowerCase()),
  )

  let counter = 1
  while (counter < 1000) {
    const candidate = counter === 1 ? base : `${base}${counter}`
    if (!takenUsernames.has(candidate.toLowerCase())) {
      return candidate
    }
    counter += 1
  }

  return `${base}${Date.now()}`
}

function formatRoleLabel(role) {
  return ROLE_LABELS[role] || role || ""
}

function mapUserRecord(record) {
  const derivedNames = splitDisplayName(record.name)
  const firstName = record.firstName ?? record.first_name ?? derivedNames.firstName
  const lastName = record.lastName ?? record.last_name ?? derivedNames.lastName
  const email = record.email || defaultEmailForName(firstName, lastName)

  return {
    id: record.id,
    firstName,
    lastName,
    name: buildFullName(firstName, lastName) || record.name || "",
    username: record.username || buildBaseUsername(firstName, lastName),
    email,
    role: record.role,
    roleLabel: formatRoleLabel(record.role),
    isActive: record.isActive ?? record.is_active ?? true,
    lastLoginAt: record.lastLoginAt ?? record.last_login_at ?? null,
    createdAt: record.createdAt ?? record.created_at ?? null,
  }
}

async function invokeManageUsers(action, payload = {}) {
  const { data, error } = await supabase.functions.invoke("admin-manage-users", {
    body: {
      action,
      ...payload,
    },
  })

  if (error) {
    throw new Error(error.message || "Unable to complete the user admin request.")
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}

function ensureEdgeFunctionAvailableMessage(err, fallbackMessage) {
  const message = err?.message || fallbackMessage
  if (
    /Failed to send a request to the Edge Function/i.test(message) ||
    /FunctionsHttpError/i.test(message) ||
    /non-2xx status code/i.test(message)
  ) {
    return "The admin-manage-users Edge Function is not deployed yet. Deploy it before using Manage Users actions."
  }
  return message || fallbackMessage
}

async function getManageUsersBase() {
  if (USE_MOCK) {
    return mockUsers.map((user) => {
      const { firstName, lastName } = splitDisplayName(user.name)
      return mapUserRecord({
        ...user,
        firstName,
        lastName,
        email: `${user.username}@coolsys.com`,
        isActive: true,
        lastLoginAt: null,
      })
    })
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, first_name, last_name, name, email, role, is_active, created_at")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })

  if (error) {
    throw new Error(error.message || "Unable to load users.")
  }

  return (data || []).map((user) =>
    mapUserRecord({
      ...user,
      last_login_at: null,
    }),
  )
}

export async function getManageUsers() {
  return getManageUsersBase()
}

export async function hydrateManageUsersLastLogin(existingUsers = []) {
  if (USE_MOCK || existingUsers.length === 0) {
    return existingUsers
  }

  try {
    const data = await invokeManageUsers("list-users")
    const hydratedUsers = (data.users || []).map(mapUserRecord)
    const hydratedById = new Map(hydratedUsers.map((user) => [String(user.id), user]))

    return existingUsers.map((user) => {
      const hydrated = hydratedById.get(String(user.id))
      return hydrated
        ? {
            ...user,
            lastLoginAt: hydrated.lastLoginAt,
          }
        : user
    })
  } catch (err) {
    console.warn(ensureEdgeFunctionAvailableMessage(err, "Unable to hydrate last login data."))
    return existingUsers
  }
}

export async function createManagedUser(payload) {
  if (USE_MOCK) {
    const nextId = String(
      Math.max(...mockUsers.map((user) => Number(user.id) || 0), 0) + 1,
    )
    const username = buildUniqueUsername(payload.firstName, payload.lastName, mockUsers)
    const created = {
      id: nextId,
      username,
      password: payload.initialPassword,
      name: buildFullName(payload.firstName, payload.lastName),
      role: payload.role,
      email: payload.email,
      isActive: true,
    }
    mockUsers.unshift(created)
    return mapUserRecord({
      ...created,
      firstName: payload.firstName,
      lastName: payload.lastName,
      lastLoginAt: null,
    })
  }

  try {
    const data = await invokeManageUsers("create-user", payload)
    return mapUserRecord(data.user || payload)
  } catch (err) {
    throw new Error(ensureEdgeFunctionAvailableMessage(err, "Unable to create user."))
  }
}

export async function updateManagedUser(userId, payload) {
  if (USE_MOCK) {
    const index = mockUsers.findIndex((user) => String(user.id) === String(userId))
    if (index === -1) throw new Error("User not found.")

    const username = buildUniqueUsername(
      payload.firstName,
      payload.lastName,
      mockUsers,
      userId,
    )

    mockUsers[index] = {
      ...mockUsers[index],
      username,
      name: buildFullName(payload.firstName, payload.lastName),
      role: payload.role,
      email: payload.email,
      password: payload.newPassword || mockUsers[index].password,
    }

    return mapUserRecord({
      ...mockUsers[index],
      firstName: payload.firstName,
      lastName: payload.lastName,
    })
  }

  try {
    const data = await invokeManageUsers("update-user", {
      userId,
      ...payload,
    })

    if (payload.newPassword) {
      await invokeManageUsers("set-password", {
        userId,
        newPassword: payload.newPassword,
      })
    }

    return mapUserRecord(data.user || { id: userId, ...payload })
  } catch (err) {
    throw new Error(ensureEdgeFunctionAvailableMessage(err, "Unable to update user."))
  }
}

export async function deactivateManagedUser(userId) {
  if (USE_MOCK) {
    const match = mockUsers.find((user) => String(user.id) === String(userId))
    if (!match) throw new Error("User not found.")
    match.isActive = false
    return true
  }

  try {
    await invokeManageUsers("deactivate-user", { userId })
    return true
  } catch (err) {
    throw new Error(ensureEdgeFunctionAvailableMessage(err, "Unable to deactivate user."))
  }
}

export async function reactivateManagedUser(userId) {
  if (USE_MOCK) {
    const match = mockUsers.find((user) => String(user.id) === String(userId))
    if (!match) throw new Error("User not found.")
    match.isActive = true
    return true
  }

  try {
    await invokeManageUsers("reactivate-user", { userId })
    return true
  } catch (err) {
    throw new Error(ensureEdgeFunctionAvailableMessage(err, "Unable to reactivate user."))
  }
}

export function buildManagedUserDraft({
  firstName = "",
  lastName = "",
  email = "",
  role = "logisticsAssociate",
  initialPassword = "",
} = {}) {
  return {
    firstName,
    lastName,
    email,
    role,
    initialPassword,
    newPassword: "",
    username: "",
  }
}

export function previewManagedUsername(firstName, lastName, users = [], excludeUserId = "") {
  return buildUniqueUsername(firstName, lastName, users, excludeUserId)
}

export function previewManagedEmail(firstName, lastName) {
  return defaultEmailForName(firstName, lastName)
}

export function getManagedUserRoleLabel(role) {
  return formatRoleLabel(role)
}
