import { supabase, USE_MOCK } from '../lib/supabaseClient'
import { mockLocations } from '../data/mockLocations'
import { mockInventory } from '../data/mockInventory'
import { mockUsers } from '../auth/mockUsers'

let mockLocationRecords = mockLocations.map((location) => ({
  ...location,
  projects: (location.projects || []).map((project) => ({
    statusValue: 'active',
    closeNotes: '',
    closedAt: null,
    closedBy: '',
    reopenedAt: null,
    reopenedBy: '',
    reopenReason: '',
    createdAt: null,
    ...project,
  })),
}))

let mockProjectCloseoutBatches = []
let mockProjectUserAssignments = []

const LOCATION_REFERENCE_CHECKS = [
  { table: 'projects', column: 'location_value', label: 'projects' },
  { table: 'inventory_items', column: 'location_value', label: 'inventory records' },
  { table: 'requests', column: 'location_value', label: 'requests' },
  { table: 'requests', column: 'source_warehouse_value', label: 'request source warehouses' },
  { table: 'manifests', column: 'location_value', label: 'manifests' },
  { table: 'manifests', column: 'source_location_value', label: 'manifest source locations' },
  { table: 'manifests', column: 'destination_location_value', label: 'manifest destination locations' },
  { table: 'transfers', column: 'location_value', label: 'transfers' },
  { table: 'transfers', column: 'source_location_value', label: 'transfer source locations' },
  { table: 'transfers', column: 'destination_location_value', label: 'transfer destination locations' },
  { table: 'purchase_orders', column: 'location_value', label: 'purchase orders' },
  { table: 'receipts', column: 'location_value', label: 'receipts' },
  { table: 'receipt_item_serials', column: 'location_value', label: 'serial records' },
]

const PROJECT_REFERENCE_CHECKS = [
  { table: 'inventory_items', column: 'project_value', label: 'inventory records' },
  { table: 'requests', column: 'project_value', label: 'requests' },
  { table: 'manifests', column: 'project_value', label: 'manifests' },
  { table: 'transfers', column: 'project_value', label: 'transfers' },
  { table: 'purchase_orders', column: 'project_value', label: 'purchase orders' },
  { table: 'receipts', column: 'project_value', label: 'receipts' },
  { table: 'project_closeout_batches', column: 'project_value', label: 'project closeout history' },
]

function normalizeLocationInput(locationData = {}) {
  return {
    value: String(locationData.value || '').trim().toUpperCase(),
    label: String(locationData.label || '').trim(),
    type: String(locationData.type || '').trim(),
    addressLine1: String(locationData.addressLine1 || '').trim(),
    addressLine2: String(locationData.addressLine2 || '').trim(),
    city: String(locationData.city || '').trim(),
    state: String(locationData.state || '').trim(),
    postalCode: String(locationData.postalCode || '').trim(),
    pocName: String(locationData.pocName || '').trim(),
    pocPhone: String(locationData.pocPhone || '').trim(),
    pocEmail: String(locationData.pocEmail || '').trim(),
  }
}

function normalizeProjectInput(projectData = {}) {
  return {
    value: String(projectData.value || '').trim().toUpperCase(),
    label: String(projectData.label || '').trim(),
    locationValue: String(projectData.locationValue || '').trim().toUpperCase(),
  }
}

function buildCodeBase(label = '', fallback = 'REC') {
  const words = String(label || '')
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean)

  if (words.length === 0) {
    return fallback
  }

  const initials = words
    .map((word) => word[0])
    .join('')
    .toUpperCase()

  return initials || fallback
}

function buildLocationCodeBase(label = '') {
  return buildCodeBase(label, 'LOC')
}

function buildProjectCodeBase(label = '') {
  return buildCodeBase(label, 'PRJ')
}

function buildNextSequentialCode(existingValues = [], prefix) {
  const matchingNumbers = existingValues
    .map((value) => String(value || '').trim().toUpperCase())
    .filter((value) => value.startsWith(`${prefix}-`))
    .map((value) => Number(value.split('-')[1]))
    .filter((value) => !Number.isNaN(value))

  const nextNumber = matchingNumbers.length > 0 ? Math.max(...matchingNumbers) + 1 : 1
  return `${prefix}-${String(nextNumber).padStart(3, '0')}`
}

function buildNextLocationCode(existingValues = [], label = '') {
  return buildNextSequentialCode(existingValues, buildLocationCodeBase(label))
}

function buildNextProjectCode(existingValues = [], label = '') {
  return buildNextSequentialCode(existingValues, buildProjectCodeBase(label))
}

function deriveProjectStatus(statusValue) {
  switch (statusValue) {
    case 'closed':
      return 'Closed'
    case 'active':
    default:
      return 'Active'
  }
}

function isWithinReopenWindow(closedAt) {
  if (!closedAt) return false

  const closedDate = new Date(closedAt)
  if (Number.isNaN(closedDate.getTime())) return false

  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
  return Date.now() - closedDate.getTime() <= thirtyDaysMs
}

function mapProjectRow(project = {}) {
  const statusValue = project.status_value || project.statusValue || 'active'

  return {
    value: project.value,
    label: project.label,
    locationValue: project.location_value || project.locationValue || '',
    location: project.location || '',
    locationType: project.location_type || project.locationType || '',
    statusValue,
    status: project.status || deriveProjectStatus(statusValue),
    closedAt: project.closed_at || project.closedAt || null,
    closedBy: project.closed_by || project.closedBy || '',
    closeNotes: project.close_notes || project.closeNotes || '',
    reopenedAt: project.reopened_at || project.reopenedAt || null,
    reopenedBy: project.reopened_by || project.reopenedBy || '',
    reopenReason: project.reopen_reason || project.reopenReason || '',
    createdAt: project.created_at || project.createdAt || null,
    reopenEligible:
      typeof project.reopen_eligible === 'boolean'
        ? project.reopen_eligible
        : typeof project.reopenEligible === 'boolean'
        ? project.reopenEligible
        : statusValue === 'closed' && isWithinReopenWindow(project.closed_at || project.closedAt),
    activeInventoryCount: Number(project.activeInventoryCount || 0),
    closeoutCount: Number(project.closeoutCount || 0),
  }
}

function formatAssignableRoleLabel(role) {
  switch (role) {
    case 'admin':
      return 'Admin'
    case 'projectManager':
      return 'Project Manager'
    case 'logisticsForeman':
      return 'Logistics Foreman'
    default:
      return role || ''
  }
}

function mapProjectAssignmentRow(assignment = {}) {
  const firstName = assignment.first_name || assignment.firstName || ''
  const lastName = assignment.last_name || assignment.lastName || ''
  const fallbackName = assignment.name || [firstName, lastName].filter(Boolean).join(' ').trim()

  return {
    id: assignment.id,
    projectValue: assignment.project_value || assignment.projectValue || '',
    userId: assignment.user_id || assignment.userId || '',
    assignmentRole: assignment.assignment_role || assignment.assignmentRole || '',
    createdAt: assignment.created_at || assignment.createdAt || null,
    username: assignment.username || '',
    firstName,
    lastName,
    name: fallbackName,
    email: assignment.email || '',
    userRole: assignment.user_role || assignment.userRole || '',
    isActive: assignment.is_active ?? assignment.isActive ?? true,
  }
}

function buildProjectAssignmentsSummary(assignments = []) {
  const mapped = assignments.map(mapProjectAssignmentRow)
  return {
    assignments: mapped,
    projectManagers: mapped.filter((assignment) => assignment.assignmentRole === 'projectManager'),
    logisticsForemen: mapped.filter((assignment) => assignment.assignmentRole === 'logisticsForeman'),
  }
}

function getMockAssignableProjectUsers() {
  return mockUsers
    .map((user) => {
      const [firstName = '', ...rest] = String(user.name || '').trim().split(/\s+/)
      const lastName = rest.join(' ').trim()
      const email = `${user.username}@coolsys.com`
      return {
        id: user.id,
        firstName,
        lastName,
        name: user.name,
        username: user.username,
        email,
        role: user.role,
        roleLabel: formatAssignableRoleLabel(user.role),
        isActive: user.isActive ?? true,
      }
    })
    .filter((user) => user.isActive)
    .filter((user) => ['admin', 'projectManager', 'logisticsForeman'].includes(user.role))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function validateAssignmentSelections(assignableUsers = [], projectManagerUserIds = [], logisticsForemanUserIds = []) {
  const assignableById = new Map(assignableUsers.map((user) => [String(user.id), user]))

  for (const userId of projectManagerUserIds) {
    const user = assignableById.get(String(userId))
    if (!user) {
      throw new Error('One or more selected project managers are no longer available.')
    }
    if (!['admin', 'projectManager'].includes(user.role)) {
      throw new Error(`${user.name} cannot be assigned as a project manager.`)
    }
  }

  for (const userId of logisticsForemanUserIds) {
    const user = assignableById.get(String(userId))
    if (!user) {
      throw new Error('One or more selected logistics foremen are no longer available.')
    }
    if (user.role !== 'logisticsForeman') {
      throw new Error(`${user.name} cannot be assigned as a logistics foreman.`)
    }
  }
}

function syncMockProjectAssignments(projectValue, projectManagerUserIds = [], logisticsForemanUserIds = []) {
  mockProjectUserAssignments = mockProjectUserAssignments.filter(
    (assignment) => assignment.projectValue !== projectValue
  )

  let nextId = mockProjectUserAssignments.reduce((max, assignment) => Math.max(max, Number(assignment.id) || 0), 0) + 1
  const nowIso = new Date().toISOString()

  for (const userId of projectManagerUserIds) {
    mockProjectUserAssignments.push({
      id: nextId++,
      projectValue,
      userId,
      assignmentRole: 'projectManager',
      createdAt: nowIso,
    })
  }

  for (const userId of logisticsForemanUserIds) {
    mockProjectUserAssignments.push({
      id: nextId++,
      projectValue,
      userId,
      assignmentRole: 'logisticsForeman',
      createdAt: nowIso,
    })
  }
}

function getMockProjectRecords() {
  return mockLocationRecords.flatMap((location) =>
    (location.projects || []).map((project) =>
      mapProjectRow({
        ...project,
        locationValue: location.value,
        location: location.label,
        locationType: location.type,
      })
    )
  )
}

function findMutableMockProject(projectValue) {
  for (const location of mockLocationRecords) {
    const project = location.projects.find((entry) => entry.value === projectValue)
    if (project) return { location, project }
  }
  return null
}

function countMockLocationReferences(locationValue) {
  const location = mockLocationRecords.find((entry) => entry.value === locationValue)
  const projectCount = location?.projects?.length || 0

  return {
    canDelete: projectCount === 0,
    totalReferences: projectCount,
    references: projectCount > 0 ? [{ label: 'projects', count: projectCount }] : [],
  }
}

function countMockProjectReferences(projectValue) {
  const closeoutCount = mockProjectCloseoutBatches.filter((batch) => batch.projectValue === projectValue).length

  return {
    canDelete: closeoutCount === 0,
    totalReferences: closeoutCount,
    references: closeoutCount > 0 ? [{ label: 'project closeout history', count: closeoutCount }] : [],
  }
}

function buildCloseSummaryFromMock(projectValue) {
  const { totalReferences } = countMockProjectReferences(projectValue)
  return {
    activeInventoryCount: 0,
    affectedTotalQuantity: 0,
    affectedTotalCost: 0,
    openRequestCount: 0,
    openManifestCount: 0,
    openTransferCount: 0,
    canClose: true,
    historicalReferenceCount: totalReferences,
  }
}

function getMockOperationalSiteValues() {
  const activeProjectSiteValues = new Set(
    mockLocationRecords
      .filter((location) => location.type === 'site')
      .filter((location) =>
        (location.projects || []).some((project) => (project.statusValue || 'active') === 'active')
      )
      .map((location) => location.value)
  )

  const activeInventorySiteValues = new Set(
    mockInventory
      .filter((item) => String(item.locationValue || '').trim())
      .filter((item) => Number(item.quantity || 0) > 0)
      .map((item) => item.locationValue)
  )

  return new Set([...activeProjectSiteValues, ...activeInventorySiteValues])
}

async function getOperationalSiteValues() {
  if (USE_MOCK) {
    return getMockOperationalSiteValues()
  }

  const [{ data: activeProjects, error: projectError }, { data: activeInventory, error: inventoryError }] =
    await Promise.all([
      supabase
        .from('projects_view')
        .select('location_value')
        .eq('status_value', 'active'),
      supabase
        .from('inventory_view')
        .select('location_value'),
    ])

  if (projectError) throw new Error('Failed to load active project locations.')
  if (inventoryError) throw new Error('Failed to load active inventory locations.')

  const siteValues = new Set()

  ;(activeProjects || []).forEach((row) => {
    if (row.location_value) siteValues.add(row.location_value)
  })

  ;(activeInventory || []).forEach((row) => {
    if (row.location_value) siteValues.add(row.location_value)
  })

  return siteValues
}

async function countTableReferences(table, column, value) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(column, value)

  if (error) {
    throw new Error(error.message)
  }

  return count || 0
}

/**
 * Returns all locations as { value, label } options for dropdowns.
 */
export async function getLocationOptions() {
  if (USE_MOCK) {
    const operationalSiteValues = getMockOperationalSiteValues()
    return mockLocationRecords.map((location) => ({
      value: location.value,
      label: location.label,
      type: location.type,
      addressLine1: location.addressLine1 || '',
      addressLine2: location.addressLine2 || '',
      city: location.city || '',
      state: location.state || '',
      postalCode: location.postalCode || '',
      pocName: location.pocName || '',
      pocPhone: location.pocPhone || '',
      pocEmail: location.pocEmail || '',
    }))
      .filter((location) => location.type === 'warehouse' || operationalSiteValues.has(location.value))
  }

  const operationalSiteValues = await getOperationalSiteValues()

  const { data, error } = await supabase
    .from('locations')
    .select('value, label, type, address_line_1, address_line_2, city, state, postal_code, poc_name, poc_phone, poc_email')
    .order('value')

  if (error) throw new Error('Failed to load locations.')
  return (data || []).filter(
    (location) => location.type === 'warehouse' || operationalSiteValues.has(location.value)
  )
}

/**
 * Finds a location by its value key.
 * Returns { value, label, type, projects: [...] } or null.
 */
export async function getLocationByValue(value) {
  if (!value) return null

  if (USE_MOCK) {
    const location = mockLocationRecords.find((entry) => entry.value === value)
    if (!location) return null

    return {
      ...location,
      projects: location.projects.map((project) => mapProjectRow({
        ...project,
        locationValue: location.value,
        location: location.label,
        locationType: location.type,
      })),
    }
  }

  const { data: location, error } = await supabase
    .from('locations')
    .select('value, label, type, address_line_1, address_line_2, city, state, postal_code, poc_name, poc_phone, poc_email')
    .eq('value', value)
    .single()

  if (error) return null

  const { data: projects, error: projError } = await supabase
    .from('projects_view')
    .select('*')
    .eq('location_value', value)
    .order('value')

  if (projError) throw new Error('Failed to load projects for location.')

  return {
    value: location.value,
    label: location.label,
    type: location.type,
    addressLine1: location.address_line_1 || '',
    addressLine2: location.address_line_2 || '',
    city: location.city || '',
    state: location.state || '',
    postalCode: location.postal_code || '',
    pocName: location.poc_name || '',
    pocPhone: location.poc_phone || '',
    pocEmail: location.poc_email || '',
    projects: (projects || []).map(mapProjectRow),
  }
}

/**
 * Returns project options for a given location value.
 */
export async function getProjectOptionsForLocation(locationValue, options = {}) {
  if (!locationValue) return []

  const { includeClosed = false } = options

  if (USE_MOCK) {
    const location = mockLocationRecords.find((entry) => entry.value === locationValue)
    const projects = location?.projects || []
    const filtered = includeClosed
      ? projects
      : projects.filter((project) => (project.statusValue || 'active') === 'active')

    return filtered.map((project) => ({
      value: project.value,
      label: project.label,
      statusValue: project.statusValue || 'active',
      status: deriveProjectStatus(project.statusValue || 'active'),
      reopenEligible: (project.statusValue || 'active') === 'closed' && isWithinReopenWindow(project.closedAt),
    }))
  }

  let query = supabase
    .from('projects_view')
    .select('value, label, status_value, status, reopen_eligible')
    .eq('location_value', locationValue)
    .order('value')

  if (!includeClosed) {
    query = query.eq('status_value', 'active')
  }

  const { data, error } = await query

  if (error) throw new Error('Failed to load projects.')
  return (data || []).map((project) => ({
    value: project.value,
    label: project.label,
    statusValue: project.status_value,
    status: project.status,
    reopenEligible: Boolean(project.reopen_eligible),
  }))
}

/**
 * Finds a project by its value key.
 * Returns project detail or null.
 */
export async function getProjectByValue(projectValue) {
  if (!projectValue) return null

  if (USE_MOCK) {
    const project = getMockProjectRecords().find((entry) => entry.value === projectValue)
    if (!project) return null

    const assignmentRows = mockProjectUserAssignments
      .filter((assignment) => assignment.projectValue === projectValue)
      .map((assignment) => {
        const user = getMockAssignableProjectUsers().find((entry) => String(entry.id) === String(assignment.userId))
        return mapProjectAssignmentRow({
          ...assignment,
          userId: assignment.userId,
          user_id: assignment.userId,
          projectValue: assignment.projectValue,
          project_value: assignment.projectValue,
          assignmentRole: assignment.assignmentRole,
          assignment_role: assignment.assignmentRole,
          createdAt: assignment.createdAt,
          created_at: assignment.createdAt,
          firstName: user?.firstName || '',
          lastName: user?.lastName || '',
          name: user?.name || '',
          email: user?.email || '',
          username: user?.username || '',
          userRole: user?.role || '',
          user_role: user?.role || '',
          isActive: user?.isActive ?? true,
          is_active: user?.isActive ?? true,
        })
      })

    return {
      ...project,
      ...buildProjectAssignmentsSummary(assignmentRows),
    }
  }

  const [{ data, error }, { data: assignments, error: assignmentError }] = await Promise.all([
    supabase
      .from('projects_view')
      .select('*')
      .eq('value', projectValue)
      .single(),
    supabase
      .from('project_user_assignments_view')
      .select('*')
      .eq('project_value', projectValue)
      .order('assignment_role')
      .order('last_name')
      .order('first_name'),
  ])

  if (error) return null
  if (assignmentError) throw new Error('Failed to load project assignments.')

  return {
    ...mapProjectRow(data),
    ...buildProjectAssignmentsSummary(assignments || []),
  }
}

export async function getAssignableProjectUsers() {
  if (USE_MOCK) {
    return getMockAssignableProjectUsers()
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, first_name, last_name, name, email, role, is_active')
    .eq('is_active', true)
    .in('role', ['admin', 'projectManager', 'logisticsForeman'])
    .order('last_name')
    .order('first_name')

  if (error) throw new Error('Failed to load assignable project users.')

  return (data || []).map((user) => ({
    id: user.id,
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    name: user.name || [user.first_name, user.last_name].filter(Boolean).join(' ').trim(),
    username: user.username || '',
    email: user.email || '',
    role: user.role,
    roleLabel: formatAssignableRoleLabel(user.role),
    isActive: user.is_active ?? true,
  }))
}

/**
 * Returns locations filtered by receive permissions.
 * Checks receive_inventory_warehouse and receive_inventory_site permissions.
 */
export async function getLocationOptionsForPermissions(permissions = []) {
  const canReceiveAtWarehouse = permissions.includes('receive_inventory_warehouse')
  const canReceiveAtSite = permissions.includes('receive_inventory_site')

  const [warehouseOptions, siteOptions] = await Promise.all([
    canReceiveAtWarehouse ? getWarehouseLocationOptions() : Promise.resolve([]),
    canReceiveAtSite ? getSiteLocationOptions() : Promise.resolve([]),
  ])

  return [...warehouseOptions, ...siteOptions]
}

/**
 * Returns all site locations.
 */
export async function getSiteLocationOptions() {
  if (USE_MOCK) {
    const operationalSiteValues = getMockOperationalSiteValues()
    return mockLocationRecords
      .filter((location) => location.type === 'site')
      .filter((location) => operationalSiteValues.has(location.value))
      .map(({ value, label, type }) => ({ value, label, type }))
  }

  const operationalSiteValues = await getOperationalSiteValues()
  if (operationalSiteValues.size === 0) return []

  const { data, error } = await supabase
    .from('locations')
    .select('value, label, type')
    .eq('type', 'site')
    .order('value')

  if (error) throw new Error('Failed to load site locations.')
  return (data || []).filter((location) => operationalSiteValues.has(location.value))
}

/**
 * Returns all warehouse locations.
 */
export async function getWarehouseLocationOptions() {
  if (USE_MOCK) {
    return mockLocationRecords
      .filter((location) => location.type === 'warehouse')
      .map(({ value, label, type }) => ({ value, label, type }))
  }

  const { data, error } = await supabase
    .from('locations')
    .select('value, label, type')
    .eq('type', 'warehouse')
    .order('value')

  if (error) throw new Error('Failed to load warehouse locations.')
  return data || []
}

export async function getAllLocationsDetailed() {
  if (USE_MOCK) {
    return mockLocationRecords
      .map((location) => {
        const projectLabels = (location.projects || []).map((project) => project.label || project.value)

        return {
          value: location.value,
          label: location.label,
          type: location.type,
          addressLine1: location.addressLine1 || '',
          addressLine2: location.addressLine2 || '',
          city: location.city || '',
          state: location.state || '',
          postalCode: location.postalCode || '',
          pocName: location.pocName || '',
          pocPhone: location.pocPhone || '',
          pocEmail: location.pocEmail || '',
          createdAt: null,
          projectCount: projectLabels.length,
          projects: projectLabels,
          status: 'Active',
        }
      })
      .sort((a, b) => a.value.localeCompare(b.value))
  }

  const [{ data: locations, error: locationError }, { data: projects, error: projectError }] =
    await Promise.all([
      supabase
        .from('locations')
        .select('value, label, type, address_line_1, address_line_2, city, state, postal_code, poc_name, poc_phone, poc_email, created_at')
        .order('value'),
      supabase.from('projects_view').select('value, label, location_value'),
    ])

  if (locationError) throw new Error('Failed to load locations.')
  if (projectError) throw new Error('Failed to load project counts.')

  const projectCountByLocation = (projects || []).reduce((acc, project) => {
    const key = project.location_value
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const projectLabelsByLocation = (projects || []).reduce((acc, project) => {
    const key = project.location_value
    if (!acc[key]) acc[key] = []
    acc[key].push(project.label || project.value)
    return acc
  }, {})

  return (locations || []).map((location) => ({
    value: location.value,
    label: location.label,
    type: location.type,
    addressLine1: location.address_line_1 || '',
    addressLine2: location.address_line_2 || '',
    city: location.city || '',
    state: location.state || '',
    postalCode: location.postal_code || '',
    pocName: location.poc_name || '',
    pocPhone: location.poc_phone || '',
    pocEmail: location.poc_email || '',
    createdAt: location.created_at,
    projectCount: projectCountByLocation[location.value] || 0,
    projects: projectLabelsByLocation[location.value] || [],
    status: 'Active',
  }))
}

export async function generateNextLocationCode(label = '') {
  if (USE_MOCK) {
    return buildNextLocationCode(
      mockLocationRecords.map((location) => location.value),
      label
    )
  }

  const { data, error } = await supabase
    .from('locations')
    .select('value')

  if (error) throw new Error('Failed to generate a new location code.')
  return buildNextLocationCode((data || []).map((entry) => entry.value), label)
}

export async function createLocation(locationData) {
  const normalized = normalizeLocationInput(locationData)

  if (!normalized.value || !normalized.label || !normalized.type) {
    throw new Error('Location code, label, and type are required.')
  }

  if (USE_MOCK) {
    const existing = mockLocationRecords.find((location) => location.value === normalized.value)
    if (existing) throw new Error('A location with that code already exists.')

    const createdLocation = {
      ...normalized,
      projects: [],
    }

    mockLocationRecords = [...mockLocationRecords, createdLocation]
    return { ...createdLocation, projectCount: 0, status: 'Active' }
  }

  const { data, error } = await supabase
    .from('locations')
    .insert({
      value: normalized.value,
      label: normalized.label,
      type: normalized.type,
      address_line_1: normalized.addressLine1,
      address_line_2: normalized.addressLine2,
      city: normalized.city,
      state: normalized.state,
      postal_code: normalized.postalCode,
      poc_name: normalized.pocName,
      poc_phone: normalized.pocPhone,
      poc_email: normalized.pocEmail,
    })
    .select('value, label, type, address_line_1, address_line_2, city, state, postal_code, poc_name, poc_phone, poc_email, created_at')
    .single()

  if (error) throw new Error(error.message)

  return {
    value: data.value,
    label: data.label,
    type: data.type,
    addressLine1: data.address_line_1 || '',
    addressLine2: data.address_line_2 || '',
    city: data.city || '',
    state: data.state || '',
    postalCode: data.postal_code || '',
    pocName: data.poc_name || '',
    pocPhone: data.poc_phone || '',
    pocEmail: data.poc_email || '',
    createdAt: data.created_at,
    projectCount: 0,
    status: 'Active',
  }
}

export async function updateLocation(locationValue, updates) {
  const normalizedUpdates = normalizeLocationInput({
    value: locationValue,
    label: updates.label,
    type: updates.type,
    addressLine1: updates.addressLine1,
    addressLine2: updates.addressLine2,
    city: updates.city,
    state: updates.state,
    postalCode: updates.postalCode,
    pocName: updates.pocName,
    pocPhone: updates.pocPhone,
    pocEmail: updates.pocEmail,
  })

  if (!locationValue) throw new Error('Location code is required.')
  if (!normalizedUpdates.label || !normalizedUpdates.type) {
    throw new Error('Location label and type are required.')
  }

  if (USE_MOCK) {
    const index = mockLocationRecords.findIndex((location) => location.value === locationValue)
    if (index === -1) throw new Error('Location not found.')

    mockLocationRecords[index] = {
      ...mockLocationRecords[index],
      label: normalizedUpdates.label,
      type: normalizedUpdates.type,
      addressLine1: normalizedUpdates.addressLine1,
      addressLine2: normalizedUpdates.addressLine2,
      city: normalizedUpdates.city,
      state: normalizedUpdates.state,
      postalCode: normalizedUpdates.postalCode,
      pocName: normalizedUpdates.pocName,
      pocPhone: normalizedUpdates.pocPhone,
      pocEmail: normalizedUpdates.pocEmail,
    }

    return {
      value: mockLocationRecords[index].value,
      label: mockLocationRecords[index].label,
      type: mockLocationRecords[index].type,
      addressLine1: mockLocationRecords[index].addressLine1 || '',
      addressLine2: mockLocationRecords[index].addressLine2 || '',
      city: mockLocationRecords[index].city || '',
      state: mockLocationRecords[index].state || '',
      postalCode: mockLocationRecords[index].postalCode || '',
      pocName: mockLocationRecords[index].pocName || '',
      pocPhone: mockLocationRecords[index].pocPhone || '',
      pocEmail: mockLocationRecords[index].pocEmail || '',
      createdAt: null,
      projectCount: mockLocationRecords[index].projects?.length || 0,
      status: 'Active',
    }
  }

  const { data, error } = await supabase
    .from('locations')
    .update({
      label: normalizedUpdates.label,
      type: normalizedUpdates.type,
      address_line_1: normalizedUpdates.addressLine1,
      address_line_2: normalizedUpdates.addressLine2,
      city: normalizedUpdates.city,
      state: normalizedUpdates.state,
      postal_code: normalizedUpdates.postalCode,
      poc_name: normalizedUpdates.pocName,
      poc_phone: normalizedUpdates.pocPhone,
      poc_email: normalizedUpdates.pocEmail,
    })
    .eq('value', locationValue)
    .select('value, label, type, address_line_1, address_line_2, city, state, postal_code, poc_name, poc_phone, poc_email, created_at')
    .single()

  if (error) throw new Error(error.message)

  const projects = await getProjectOptionsForLocation(data.value, { includeClosed: true })

  return {
    value: data.value,
    label: data.label,
    type: data.type,
    addressLine1: data.address_line_1 || '',
    addressLine2: data.address_line_2 || '',
    city: data.city || '',
    state: data.state || '',
    postalCode: data.postal_code || '',
    pocName: data.poc_name || '',
    pocPhone: data.poc_phone || '',
    pocEmail: data.poc_email || '',
    createdAt: data.created_at,
    projectCount: projects.length,
    status: 'Active',
  }
}

export async function getLocationDependencySummary(locationValue) {
  if (!locationValue) {
    return { canDelete: false, totalReferences: 0, references: [] }
  }

  if (USE_MOCK) {
    return countMockLocationReferences(locationValue)
  }

  const results = await Promise.all(
    LOCATION_REFERENCE_CHECKS.map(async ({ table, column, label }) => {
      const count = await countTableReferences(table, column, locationValue)
      return { label, count }
    })
  )

  const references = results.filter((entry) => entry.count > 0)
  const totalReferences = references.reduce((sum, entry) => sum + entry.count, 0)

  return {
    canDelete: totalReferences === 0,
    totalReferences,
    references,
  }
}

export async function deleteLocation(locationValue) {
  if (!locationValue) throw new Error('Location code is required.')

  const dependencySummary = await getLocationDependencySummary(locationValue)

  if (!dependencySummary.canDelete) {
    const dependencyLabels = dependencySummary.references.map((entry) => entry.label).join(', ')
    throw new Error(
      `Location cannot be deleted because it is used by ${dependencyLabels}. Deactivation is planned for a future update.`
    )
  }

  if (USE_MOCK) {
    mockLocationRecords = mockLocationRecords.filter((location) => location.value !== locationValue)
    return true
  }

  const { error } = await supabase
    .from('locations')
    .delete()
    .eq('value', locationValue)

  if (error) throw new Error(error.message)
  return true
}

export async function getAllProjectsDetailed() {
  if (USE_MOCK) {
    const projectRecords = getMockProjectRecords()
    const closeoutCountByProject = mockProjectCloseoutBatches.reduce((acc, batch) => {
      acc[batch.projectValue] = (acc[batch.projectValue] || 0) + 1
      return acc
    }, {})

    return projectRecords
      .map((project) => {
        const assignmentRows = mockProjectUserAssignments
          .filter((assignment) => assignment.projectValue === project.value)
          .map((assignment) => {
            const user = getMockAssignableProjectUsers().find((entry) => String(entry.id) === String(assignment.userId))
            return {
              ...assignment,
              userId: assignment.userId,
              user_id: assignment.userId,
              projectValue: assignment.projectValue,
              project_value: assignment.projectValue,
              assignmentRole: assignment.assignmentRole,
              assignment_role: assignment.assignmentRole,
              createdAt: assignment.createdAt,
              created_at: assignment.createdAt,
              firstName: user?.firstName || '',
              lastName: user?.lastName || '',
              name: user?.name || '',
              email: user?.email || '',
              username: user?.username || '',
              userRole: user?.role || '',
              user_role: user?.role || '',
              isActive: user?.isActive ?? true,
              is_active: user?.isActive ?? true,
            }
          })

        return {
          ...project,
          closeoutCount: closeoutCountByProject[project.value] || 0,
          ...buildProjectAssignmentsSummary(assignmentRows),
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }

  const [
    { data: projects, error: projectError },
    { data: inventory, error: inventoryError },
    { data: closeouts, error: closeoutError },
    { data: assignments, error: assignmentError },
  ] =
    await Promise.all([
      supabase.from('projects_view').select('*').order('label'),
      supabase.from('inventory_items').select('project_value, lifecycle_status'),
      supabase.from('project_closeout_batches').select('project_value'),
      supabase.from('project_user_assignments_view').select('*').order('assignment_role').order('last_name').order('first_name'),
    ])

  if (projectError) throw new Error('Failed to load projects.')
  if (inventoryError) throw new Error('Failed to load project inventory counts.')
  if (closeoutError) throw new Error('Failed to load project closeout history.')
  if (assignmentError) throw new Error('Failed to load project assignments.')

  const activeInventoryCountByProject = (inventory || []).reduce((acc, row) => {
    if (row.lifecycle_status !== 'active') return acc
    const key = row.project_value
    if (!key) return acc
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const closeoutCountByProject = (closeouts || []).reduce((acc, row) => {
    const key = row.project_value
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const assignmentsByProject = (assignments || []).reduce((acc, assignment) => {
    const key = assignment.project_value
    if (!key) return acc
    acc[key] = acc[key] || []
    acc[key].push(assignment)
    return acc
  }, {})

  return (projects || []).map((project) => ({
    ...mapProjectRow(project),
    activeInventoryCount: activeInventoryCountByProject[project.value] || 0,
    closeoutCount: closeoutCountByProject[project.value] || 0,
    ...buildProjectAssignmentsSummary(assignmentsByProject[project.value] || []),
  }))
}

export async function generateNextProjectCode(label = '') {
  if (USE_MOCK) {
    return buildNextProjectCode(
      getMockProjectRecords().map((project) => project.value),
      label
    )
  }

  const { data, error } = await supabase
    .from('projects')
    .select('value')

  if (error) throw new Error('Failed to generate a new project code.')
  return buildNextProjectCode((data || []).map((entry) => entry.value), label)
}

export async function replaceProjectAssignments(projectValue, assignmentPayload = {}) {
  if (!projectValue) throw new Error('Project code is required.')

  const projectManagerUserIds = [...new Set((assignmentPayload.projectManagerUserIds || []).filter(Boolean).map(String))]
  const logisticsForemanUserIds = [...new Set((assignmentPayload.logisticsForemanUserIds || []).filter(Boolean).map(String))]

  const assignableUsers = await getAssignableProjectUsers()
  validateAssignmentSelections(assignableUsers, projectManagerUserIds, logisticsForemanUserIds)

  if (USE_MOCK) {
    syncMockProjectAssignments(projectValue, projectManagerUserIds, logisticsForemanUserIds)
    return true
  }

  const { error: deleteError } = await supabase
    .from('project_user_assignments')
    .delete()
    .eq('project_value', projectValue)

  if (deleteError) throw new Error('Failed to clear previous project assignments.')

  const rows = [
    ...projectManagerUserIds.map((userId) => ({
      project_value: projectValue,
      user_id: userId,
      assignment_role: 'projectManager',
    })),
    ...logisticsForemanUserIds.map((userId) => ({
      project_value: projectValue,
      user_id: userId,
      assignment_role: 'logisticsForeman',
    })),
  ]

  if (rows.length === 0) return true

  const { error: insertError } = await supabase
    .from('project_user_assignments')
    .insert(rows)

  if (insertError) throw new Error(insertError.message || 'Failed to save project assignments.')
  return true
}

export async function createProject(projectData) {
  const normalized = normalizeProjectInput(projectData)
  const projectManagerUserIds = projectData.projectManagerUserIds || []
  const logisticsForemanUserIds = projectData.logisticsForemanUserIds || []

  if (!normalized.value || !normalized.label || !normalized.locationValue) {
    throw new Error('Project code, name, and location are required.')
  }

  if (USE_MOCK) {
    const existing = getMockProjectRecords().find((project) => project.value === normalized.value)
    if (existing) throw new Error('A project with that code already exists.')

    const location = mockLocationRecords.find((entry) => entry.value === normalized.locationValue)
    if (!location) throw new Error('Selected location was not found.')

    const createdProject = {
      value: normalized.value,
      label: normalized.label,
      statusValue: 'active',
      closeNotes: '',
      closedAt: null,
      closedBy: '',
      reopenedAt: null,
      reopenedBy: '',
      reopenReason: '',
      createdAt: null,
    }

    location.projects.push(createdProject)
    syncMockProjectAssignments(normalized.value, projectManagerUserIds, logisticsForemanUserIds)

    return {
      ...mapProjectRow({
      ...createdProject,
      locationValue: location.value,
      location: location.label,
      locationType: location.type,
      }),
      ...buildProjectAssignmentsSummary(
        mockProjectUserAssignments.filter((assignment) => assignment.projectValue === normalized.value)
      ),
    }
  }

  const { error } = await supabase
    .from('projects')
    .insert({
      value: normalized.value,
      label: normalized.label,
      location_value: normalized.locationValue,
    })

  if (error) throw new Error(error.message)

  await replaceProjectAssignments(normalized.value, {
    projectManagerUserIds,
    logisticsForemanUserIds,
  })

  const createdProject = await getProjectByValue(normalized.value)
  if (!createdProject) throw new Error('Project was created but could not be reloaded.')
  return createdProject
}

export async function updateProject(projectValue, updates) {
  const normalized = normalizeProjectInput({
    value: projectValue,
    label: updates.label,
    locationValue: updates.locationValue,
  })
  const projectManagerUserIds = updates.projectManagerUserIds || []
  const logisticsForemanUserIds = updates.logisticsForemanUserIds || []

  if (!projectValue) throw new Error('Project code is required.')
  if (!normalized.label || !normalized.locationValue) {
    throw new Error('Project name and location are required.')
  }

  if (USE_MOCK) {
    const match = findMutableMockProject(projectValue)
    if (!match) throw new Error('Project not found.')

    const destinationLocation = mockLocationRecords.find((entry) => entry.value === normalized.locationValue)
    if (!destinationLocation) throw new Error('Selected location was not found.')

    const projectSnapshot = {
      ...match.project,
      label: normalized.label,
    }

    if (match.location.value !== destinationLocation.value) {
      match.location.projects = match.location.projects.filter((entry) => entry.value !== projectValue)
      destinationLocation.projects.push(projectSnapshot)
    } else {
      match.project.label = normalized.label
    }

    syncMockProjectAssignments(projectValue, projectManagerUserIds, logisticsForemanUserIds)

    return {
      ...mapProjectRow({
      ...projectSnapshot,
      locationValue: destinationLocation.value,
      location: destinationLocation.label,
      locationType: destinationLocation.type,
      }),
      ...buildProjectAssignmentsSummary(
        mockProjectUserAssignments.filter((assignment) => assignment.projectValue === projectValue)
      ),
    }
  }

  const currentProject = await getProjectByValue(projectValue)
  if (!currentProject) throw new Error('Project not found.')
  if (currentProject.statusValue === 'closed') {
    throw new Error('Closed projects cannot be edited. Reopen the project first if this closure was accidental.')
  }

  const { error } = await supabase
    .from('projects')
    .update({
      label: normalized.label,
      location_value: normalized.locationValue,
    })
    .eq('value', projectValue)

  if (error) throw new Error(error.message)

  await replaceProjectAssignments(projectValue, {
    projectManagerUserIds,
    logisticsForemanUserIds,
  })

  const updatedProject = await getProjectByValue(projectValue)
  if (!updatedProject) throw new Error('Project was updated but could not be reloaded.')
  return updatedProject
}

export async function getProjectDependencySummary(projectValue) {
  if (!projectValue) {
    return { canDelete: false, totalReferences: 0, references: [] }
  }

  if (USE_MOCK) {
    return countMockProjectReferences(projectValue)
  }

  const results = await Promise.all(
    PROJECT_REFERENCE_CHECKS.map(async ({ table, column, label }) => {
      const count = await countTableReferences(table, column, projectValue)
      return { label, count }
    })
  )

  const references = results.filter((entry) => entry.count > 0)
  const totalReferences = references.reduce((sum, entry) => sum + entry.count, 0)

  return {
    canDelete: totalReferences === 0,
    totalReferences,
    references,
  }
}

export async function deleteProject(projectValue) {
  if (!projectValue) throw new Error('Project code is required.')

  const dependencySummary = await getProjectDependencySummary(projectValue)
  if (!dependencySummary.canDelete) {
    const dependencyLabels = dependencySummary.references.map((entry) => entry.label).join(', ')
    throw new Error(
      `Project cannot be deleted because it is used by ${dependencyLabels}. Delete should only be used for mistaken entries with no history.`
    )
  }

  if (USE_MOCK) {
    const match = findMutableMockProject(projectValue)
    if (!match) throw new Error('Project not found.')
    match.location.projects = match.location.projects.filter((entry) => entry.value !== projectValue)
    return true
  }

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('value', projectValue)

  if (error) throw new Error(error.message)
  return true
}

export async function getProjectCloseSummary(projectValue) {
  if (!projectValue) {
    return {
      activeInventoryCount: 0,
      affectedTotalQuantity: 0,
      affectedTotalCost: 0,
      openRequestCount: 0,
      openManifestCount: 0,
      openTransferCount: 0,
      canClose: false,
      historicalReferenceCount: 0,
    }
  }

  if (USE_MOCK) {
    return buildCloseSummaryFromMock(projectValue)
  }

  const [
    { data: inventoryRows, error: inventoryError },
    { data: requestRows, error: requestError },
    { data: openManifestRows, error: manifestError },
    { data: openTransferRows, error: transferError },
    { count: historicalReferenceCount, error: closeoutError },
  ] = await Promise.all([
    supabase
      .from('inventory_items')
      .select('id, quantity, total_cost')
      .eq('project_value', projectValue)
      .eq('lifecycle_status', 'active'),
    supabase
      .from('requests')
      .select('id, status_value')
      .eq('project_value', projectValue),
    supabase
      .from('manifests')
      .select('id, project_value, request_id, transfers!left(id, status_value), manifest_items(inventory_items(project_value))'),
    supabase
      .from('transfers')
      .select('id, status_value, project_value, request_id, manifest_id, transfer_items(inventory_items(project_value))'),
    supabase
      .from('project_closeout_batches')
      .select('*', { count: 'exact', head: true })
      .eq('project_value', projectValue),
  ])

  if (inventoryError) throw new Error('Failed to summarize project inventory.')
  if (requestError) throw new Error('Failed to summarize open requests.')
  if (manifestError) throw new Error('Failed to summarize manifested inventory awaiting transfer.')
  if (transferError) throw new Error('Failed to summarize open transfers.')
  if (closeoutError) throw new Error('Failed to summarize project closeout history.')

  const activeInventoryCount = (inventoryRows || []).length
  const affectedTotalQuantity = (inventoryRows || []).reduce((sum, row) => sum + Number(row.quantity || 0), 0)
  const affectedTotalCost = (inventoryRows || []).reduce((sum, row) => sum + Number(row.total_cost || 0), 0)
  const requestIdsForProject = new Set((requestRows || []).map((request) => request.id))
  const openRequestCount = (requestRows || []).filter(
    (request) => !['rejected', 'manifested'].includes(request.status_value)
  ).length

  const relevantManifests = (openManifestRows || []).filter((manifest) => {
    const hasProjectMatch = manifest.project_value === projectValue
    const hasRequestMatch = manifest.request_id && requestIdsForProject.has(manifest.request_id)
    const hasInventoryMatch = (manifest.manifest_items || []).some(
      (item) => item.inventory_items?.project_value === projectValue
    )

    return hasProjectMatch || hasRequestMatch || hasInventoryMatch
  })

  const manifestIdsForProject = new Set(relevantManifests.map((manifest) => manifest.id))

  const openManifestCount = relevantManifests.filter((manifest) => {
    const transfers = Array.isArray(manifest.transfers) ? manifest.transfers : []
    return transfers.length === 0
  }).length

  const openTransferCount = (openTransferRows || []).filter((transfer) => {
    if (transfer.status_value === 'completed') return false

    const hasProjectMatch = transfer.project_value === projectValue
    const hasRequestMatch = transfer.request_id && requestIdsForProject.has(transfer.request_id)
    const hasManifestMatch = transfer.manifest_id && manifestIdsForProject.has(transfer.manifest_id)
    const hasInventoryMatch = (transfer.transfer_items || []).some(
      (item) => item.inventory_items?.project_value === projectValue
    )

    return hasProjectMatch || hasRequestMatch || hasManifestMatch || hasInventoryMatch
  }).length

  return {
    activeInventoryCount,
    affectedTotalQuantity,
    affectedTotalCost,
    openRequestCount,
    openManifestCount,
    openTransferCount,
    historicalReferenceCount: historicalReferenceCount || 0,
    canClose:
      openRequestCount === 0 &&
      openManifestCount === 0 &&
      openTransferCount === 0,
  }
}

export async function closeProject(projectValue, closeNotes = '') {
  if (!projectValue) throw new Error('Project code is required.')

  if (USE_MOCK) {
    const match = findMutableMockProject(projectValue)
    if (!match) throw new Error('Project not found.')
    if ((match.project.statusValue || 'active') === 'closed') {
      throw new Error(`Project "${match.project.label}" is already closed.`)
    }

    const closeoutBatchId = `PCB-${String(mockProjectCloseoutBatches.length + 1).padStart(4, '0')}`
    const nowIso = new Date().toISOString()

    match.project.statusValue = 'closed'
    match.project.closedAt = nowIso
    match.project.closedBy = 'Current User'
    match.project.closeNotes = String(closeNotes || '').trim()
    match.project.reopenedAt = null
    match.project.reopenedBy = ''
    match.project.reopenReason = ''

    mockProjectCloseoutBatches.unshift({
      id: closeoutBatchId,
      projectValue,
      locationValue: match.location.value,
      closedAt: nowIso,
      closedBy: 'Current User',
      closeNotes: String(closeNotes || '').trim(),
      reopenedAt: null,
      reopenedBy: '',
      reopenReason: '',
      affectedInventoryCount: 0,
      affectedTotalQuantity: 0,
      affectedTotalCost: 0,
    })

    return {
      projectValue,
      project: match.project.label,
      closeoutBatchId,
      affectedInventoryCount: 0,
      affectedTotalQuantity: 0,
      affectedTotalCost: 0,
      closedBy: 'Current User',
      closedAt: nowIso,
    }
  }

  const { data, error } = await supabase.rpc('close_project', {
    p_project_value: projectValue,
    p_close_notes: String(closeNotes || '').trim(),
  })

  if (error) throw new Error(error.message)
  return data
}

export async function reopenProject(projectValue, reopenReason) {
  if (!projectValue) throw new Error('Project code is required.')
  if (!String(reopenReason || '').trim()) {
    throw new Error('A reopen reason is required.')
  }

  if (USE_MOCK) {
    const match = findMutableMockProject(projectValue)
    if (!match) throw new Error('Project not found.')
    if ((match.project.statusValue || 'active') !== 'closed') {
      throw new Error('Only closed projects can be reopened.')
    }
    if (!isWithinReopenWindow(match.project.closedAt)) {
      throw new Error(`Project "${match.project.label}" is outside the 30-day reopen window.`)
    }

    const batch = mockProjectCloseoutBatches.find(
      (entry) => entry.projectValue === projectValue && !entry.reopenedAt
    )

    if (!batch) throw new Error(`No unreopened closeout batch was found for project "${match.project.label}".`)

    const nowIso = new Date().toISOString()

    match.project.statusValue = 'active'
    match.project.reopenedAt = nowIso
    match.project.reopenedBy = 'Current User'
    match.project.reopenReason = String(reopenReason || '').trim()

    batch.reopenedAt = nowIso
    batch.reopenedBy = 'Current User'
    batch.reopenReason = String(reopenReason || '').trim()

    return {
      projectValue,
      project: match.project.label,
      closeoutBatchId: batch.id,
      restoredInventoryCount: 0,
      reopenedBy: 'Current User',
      reopenedAt: nowIso,
    }
  }

  const { data, error } = await supabase.rpc('reopen_project', {
    p_project_value: projectValue,
    p_reopen_reason: String(reopenReason || '').trim(),
  })

  if (error) throw new Error(error.message)
  return data
}
