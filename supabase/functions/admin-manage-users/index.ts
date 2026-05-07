import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const ALLOWED_ROLES = new Set([
  "admin",
  "projectManager",
  "warehouseManager",
  "logisticsAssociate",
  "logisticsForeman",
])

type UserAction =
  | "list-users"
  | "create-user"
  | "update-user"
  | "set-password"
  | "deactivate-user"
  | "reactivate-user"

type ManageUsersPayload = {
  action: UserAction
  userId?: string
  firstName?: string
  lastName?: string
  email?: string
  role?: string
  initialPassword?: string
  newPassword?: string
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
}

function normalizeNamePart(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".")
}

function buildFullName(firstName: string, lastName: string) {
  return [String(firstName || "").trim(), String(lastName || "").trim()]
    .filter(Boolean)
    .join(" ")
    .trim()
}

function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase()
}

async function requireActiveAdmin(adminClient: ReturnType<typeof createClient>, authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing bearer token.")
  }

  const jwt = authHeader.replace("Bearer ", "").trim()
  const {
    data: { user },
    error: userError,
  } = await adminClient.auth.getUser(jwt)

  if (userError || !user) {
    throw new Error("Unable to verify the current user.")
  }

  const { data: callerProfile, error: callerError } = await adminClient
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .single()

  if (callerError || !callerProfile) {
    throw new Error("Current user profile was not found.")
  }

  if (callerProfile.role !== "admin" || !callerProfile.is_active) {
    throw new Error("Only active admins can manage users.")
  }

  return callerProfile
}

async function generateUniqueUsername(
  adminClient: ReturnType<typeof createClient>,
  firstName: string,
  lastName: string,
  excludeUserId?: string,
) {
  const first = normalizeNamePart(firstName)
  const last = normalizeNamePart(lastName)
  const base = [first, last].filter(Boolean).join(".") || "user"

  let counter = 1
  while (counter < 1000) {
    const candidate = counter === 1 ? base : `${base}${counter}`
    let query = adminClient.from("profiles").select("id").eq("username", candidate)

    if (excludeUserId) {
      query = query.neq("id", excludeUserId)
    }

    const { data, error } = await query.maybeSingle()
    if (error) {
      throw new Error(`Unable to verify username uniqueness: ${error.message}`)
    }

    if (!data) return candidate
    counter += 1
  }

  throw new Error("Unable to generate a unique username. Please adjust the user's name.")
}

async function ensureEmailAvailable(
  adminClient: ReturnType<typeof createClient>,
  email: string,
  excludeUserId?: string,
) {
  let query = adminClient
    .from("profiles")
    .select("id")
    .ilike("email", email)

  if (excludeUserId) {
    query = query.neq("id", excludeUserId)
  }

  const { data, error } = await query.maybeSingle()

  if (error) {
    throw new Error(`Unable to verify email uniqueness: ${error.message}`)
  }

  if (data) {
    throw new Error(`Email "${email}" is already in use.`)
  }
}

async function getActiveAdminCount(adminClient: ReturnType<typeof createClient>) {
  const { count, error } = await adminClient
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("is_active", true)

  if (error) {
    throw new Error(`Unable to count active admins: ${error.message}`)
  }

  return count || 0
}

async function ensureAdminLifecycleGuard(
  adminClient: ReturnType<typeof createClient>,
  actorUserId: string,
  targetProfile: { id: string; role: string; is_active: boolean },
  nextRole: string,
  nextIsActive: boolean,
) {
  if (actorUserId === targetProfile.id && !nextIsActive) {
    throw new Error("You cannot deactivate your own account.")
  }

  if (actorUserId === targetProfile.id && targetProfile.role === "admin" && nextRole !== "admin") {
    throw new Error("You cannot remove your own admin access.")
  }

  const impactsAdminStatus =
    targetProfile.role === "admin" &&
    targetProfile.is_active &&
    (!nextIsActive || nextRole !== "admin")

  if (impactsAdminStatus) {
    const activeAdminCount = await getActiveAdminCount(adminClient)
    if (activeAdminCount <= 1) {
      throw new Error("At least one active admin must remain in the system.")
    }
  }
}

async function listUsers(adminClient: ReturnType<typeof createClient>) {
  const { data: profiles, error: profilesError } = await adminClient
    .from("profiles")
    .select("id, username, first_name, last_name, name, email, role, is_active, created_at")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true })

  if (profilesError) {
    throw new Error(`Failed to load profiles: ${profilesError.message}`)
  }

  const { data: authUsers, error: authUsersError } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (authUsersError) {
    throw new Error(`Failed to load auth users: ${authUsersError.message}`)
  }

  const authById = new Map(
    (authUsers.users || []).map((user) => [
      user.id,
      {
        lastSignInAt: user.last_sign_in_at,
        bannedUntil: user.banned_until,
        authEmail: user.email,
      },
    ]),
  )

  return (profiles || []).map((profile) => {
    const authInfo = authById.get(profile.id)
    return {
      id: profile.id,
      username: profile.username,
      firstName: profile.first_name,
      lastName: profile.last_name,
      name: profile.name,
      email: profile.email || authInfo?.authEmail || "",
      role: profile.role,
      isActive: profile.is_active,
      createdAt: profile.created_at,
      lastLoginAt: authInfo?.lastSignInAt || null,
      bannedUntil: authInfo?.bannedUntil || null,
    }
  })
}

async function createUser(adminClient: ReturnType<typeof createClient>, payload: ManageUsersPayload) {
  const firstName = String(payload.firstName || "").trim()
  const lastName = String(payload.lastName || "").trim()
  const email = normalizeEmail(payload.email || "")
  const role = String(payload.role || "").trim()
  const initialPassword = String(payload.initialPassword || "")

  if (!firstName || !lastName) throw new Error("First and last name are required.")
  if (!email) throw new Error("Email is required.")
  if (!ALLOWED_ROLES.has(role)) throw new Error("A valid role is required.")
  if (!initialPassword) throw new Error("Initial password is required.")

  await ensureEmailAvailable(adminClient, email)

  const username = await generateUniqueUsername(adminClient, firstName, lastName)
  const name = buildFullName(firstName, lastName)

  const { data: createdAuthUser, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: initialPassword,
    email_confirm: true,
    user_metadata: {
      username,
      name,
      first_name: firstName,
      last_name: lastName,
      role,
    },
    app_metadata: {
      role,
    },
  })

  if (createError || !createdAuthUser.user) {
    throw new Error(`Failed to create auth user: ${createError?.message || "unknown error"}`)
  }

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({
      username,
      first_name: firstName,
      last_name: lastName,
      name,
      email,
      role,
      is_active: true,
    })
    .eq("id", createdAuthUser.user.id)

  if (profileError) {
    throw new Error(`Auth user created, but profile sync failed: ${profileError.message}`)
  }

  return {
    id: createdAuthUser.user.id,
    userId: createdAuthUser.user.id,
    firstName,
    lastName,
    username,
    email,
    role,
    name,
    isActive: true,
    lastLoginAt: null,
  }
}

async function updateUser(adminClient: ReturnType<typeof createClient>, callerUserId: string, payload: ManageUsersPayload) {
  const userId = String(payload.userId || "").trim()
  if (!userId) throw new Error("User ID is required.")

  const { data: targetProfile, error: targetError } = await adminClient
    .from("profiles")
    .select("id, username, first_name, last_name, name, email, role, is_active")
    .eq("id", userId)
    .single()

  if (targetError || !targetProfile) {
    throw new Error("User profile not found.")
  }

  const firstName = String(payload.firstName ?? targetProfile.first_name).trim()
  const lastName = String(payload.lastName ?? targetProfile.last_name).trim()
  const email = normalizeEmail(payload.email ?? targetProfile.email ?? "")
  const role = String(payload.role ?? targetProfile.role).trim()

  if (!firstName || !lastName) throw new Error("First and last name are required.")
  if (!email) throw new Error("Email is required.")
  if (!ALLOWED_ROLES.has(role)) throw new Error("A valid role is required.")

  await ensureAdminLifecycleGuard(adminClient, callerUserId, targetProfile, role, targetProfile.is_active)
  await ensureEmailAvailable(adminClient, email, userId)

  const username = await generateUniqueUsername(adminClient, firstName, lastName, userId)
  const name = buildFullName(firstName, lastName)

  const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
    user_metadata: {
      username,
      name,
      first_name: firstName,
      last_name: lastName,
      role,
    },
    app_metadata: {
      role,
    },
  })

  if (authUpdateError) {
    throw new Error(`Failed to update auth user: ${authUpdateError.message}`)
  }

  const { error: profileUpdateError } = await adminClient
    .from("profiles")
    .update({
      username,
      first_name: firstName,
      last_name: lastName,
      name,
      email,
      role,
    })
    .eq("id", userId)

  if (profileUpdateError) {
    throw new Error(`Failed to update user profile: ${profileUpdateError.message}`)
  }

  return {
    id: userId,
    userId,
    firstName,
    lastName,
    username,
    email,
    role,
    name,
    isActive: targetProfile.is_active,
  }
}

async function setPassword(adminClient: ReturnType<typeof createClient>, payload: ManageUsersPayload) {
  const userId = String(payload.userId || "").trim()
  const newPassword = String(payload.newPassword || "")

  if (!userId) throw new Error("User ID is required.")
  if (!newPassword) throw new Error("New password is required.")

  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    password: newPassword,
  })

  if (error) {
    throw new Error(`Failed to update password: ${error.message}`)
  }

  return { userId }
}

async function deactivateUser(
  adminClient: ReturnType<typeof createClient>,
  callerUserId: string,
  payload: ManageUsersPayload,
) {
  const userId = String(payload.userId || "").trim()
  if (!userId) throw new Error("User ID is required.")

  const { data: targetProfile, error: targetError } = await adminClient
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", userId)
    .single()

  if (targetError || !targetProfile) {
    throw new Error("User profile not found.")
  }

  await ensureAdminLifecycleGuard(adminClient, callerUserId, targetProfile, targetProfile.role, false)

  const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
  })

  if (authError) {
    throw new Error(`Failed to deactivate auth user: ${authError.message}`)
  }

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ is_active: false })
    .eq("id", userId)

  if (profileError) {
    throw new Error(`Failed to deactivate profile: ${profileError.message}`)
  }

  return { userId }
}

async function reactivateUser(adminClient: ReturnType<typeof createClient>, payload: ManageUsersPayload) {
  const userId = String(payload.userId || "").trim()
  if (!userId) throw new Error("User ID is required.")

  const { error: authError } = await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  })

  if (authError) {
    throw new Error(`Failed to reactivate auth user: ${authError.message}`)
  }

  const { error: profileError } = await adminClient
    .from("profiles")
    .update({ is_active: true })
    .eq("id", userId)

  if (profileError) {
    throw new Error(`Failed to reactivate profile: ${profileError.message}`)
  }

  return { userId }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." })
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: "Missing Supabase environment configuration." })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  try {
    const callerProfile = await requireActiveAdmin(adminClient, req.headers.get("Authorization"))
    const payload = (await req.json()) as ManageUsersPayload

    switch (payload.action) {
      case "list-users":
        return jsonResponse(200, { users: await listUsers(adminClient) })
      case "create-user":
        return jsonResponse(200, { user: await createUser(adminClient, payload) })
      case "update-user":
        return jsonResponse(200, {
          user: await updateUser(adminClient, callerProfile.id, payload),
        })
      case "set-password":
        return jsonResponse(200, { result: await setPassword(adminClient, payload) })
      case "deactivate-user":
        return jsonResponse(200, {
          result: await deactivateUser(adminClient, callerProfile.id, payload),
        })
      case "reactivate-user":
        return jsonResponse(200, { result: await reactivateUser(adminClient, payload) })
      default:
        return jsonResponse(400, { error: "Unknown manage-users action." })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error."
    return jsonResponse(400, { error: message })
  }
})
