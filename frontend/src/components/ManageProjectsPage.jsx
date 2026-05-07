import { useEffect, useMemo, useRef, useState } from 'react'
import FilterHeader from './FilterHeader'
import Toast from './Toast'
import {
  closeProject,
  createProject,
  deleteProject,
  generateNextProjectCode,
  getAllLocationsDetailed,
  getAllProjectsDetailed,
  getAssignableProjectUsers,
  getProjectCloseSummary,
  getProjectDependencySummary,
  reopenProject,
  updateProject,
} from '../services/projectService'

const EMPTY_FORM = {
  value: '',
  label: '',
  locationValue: '',
  projectManagerUserIds: [],
  logisticsForemanUserIds: [],
}

const EMPTY_MODAL = {
  mode: '',
  project: null,
  summary: null,
  notes: '',
  error: '',
  isSubmitting: false,
}

function formatCurrency(value) {
  const numericValue = Number(value || 0)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue)
}

function formatDateTime(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toLocaleString()
}

function formatAssignmentRoleLabel(role) {
  switch (role) {
    case 'projectManager':
      return 'Project Manager'
    case 'logisticsForeman':
      return 'Logistics Foreman'
    case 'admin':
      return 'Admin'
    default:
      return role || ''
  }
}

function ManageProjectsPage({ onBack }) {
  const [filtersOpen, setFiltersOpen] = useState(() => window.innerWidth > 900)
  const [toast, setToast] = useState({ message: '', type: 'success' })
  const [projects, setProjects] = useState([])
  const [locations, setLocations] = useState([])
  const [assignableUsers, setAssignableUsers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pageError, setPageError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [locationFilter, setLocationFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('active')
  const [formMode, setFormMode] = useState('')
  const [formValues, setFormValues] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [openAssignmentSection, setOpenAssignmentSection] = useState('')
  const [actionModal, setActionModal] = useState(EMPTY_MODAL)
  const formCardRef = useRef(null)
  const nameInputRef = useRef(null)
  const codeRequestIdRef = useRef(0)

  useEffect(() => {
    void loadPageData()
  }, [])

  async function loadPageData() {
    try {
      setIsLoading(true)
      setPageError('')
      const [nextProjects, nextLocations, nextAssignableUsers] = await Promise.all([
        getAllProjectsDetailed(),
        getAllLocationsDetailed(),
        getAssignableProjectUsers(),
      ])
      setProjects(nextProjects)
      setLocations(nextLocations)
      setAssignableUsers(nextAssignableUsers)
    } catch (err) {
      setPageError(err.message || 'Unable to load projects.')
    } finally {
      setIsLoading(false)
    }
  }

  function showToast(message, type = 'success') {
    setToast({ message, type })

    window.clearTimeout(showToast.timeoutId)
    showToast.timeoutId = window.setTimeout(() => {
      setToast({ message: '', type: 'success' })
    }, 3000)
  }

  function resetForm() {
    setFormMode('')
    setFormValues(EMPTY_FORM)
    setFormError('')
    setOpenAssignmentSection('')
  }

  useEffect(() => {
    if (!formMode) return undefined

    const frameId = window.requestAnimationFrame(() => {
      formCardRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      nameInputRef.current?.focus()
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [formMode])

  function handleCreateStart() {
    setFormMode('create')
    setOpenAssignmentSection('')
    setFormValues({
      ...EMPTY_FORM,
      locationValue: locations[0]?.value || '',
    })
    setFormError('')
  }

  function handleEditStart(project) {
    setFormMode('edit')
    setOpenAssignmentSection('')
    setFormValues({
      value: project.value,
      label: project.label,
      locationValue: project.locationValue,
      projectManagerUserIds: (project.projectManagers || []).map((assignment) => String(assignment.userId)),
      logisticsForemanUserIds: (project.logisticsForemen || []).map((assignment) => String(assignment.userId)),
    })
    setFormError('')
  }

  function handleFormChange(e) {
    const { name, value } = e.target

    if (formError) {
      setFormError('')
    }

    if (name === 'label' && formMode === 'create') {
      setFormValues((prev) => ({
        ...prev,
        label: value,
      }))
      void syncGeneratedProjectCode(value)
      return
    }

    setFormValues((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  async function syncGeneratedProjectCode(label) {
    const normalizedLabel = label.trim()

    if (!normalizedLabel) {
      setFormValues((prev) => ({
        ...prev,
        value: '',
      }))
      return
    }

    const requestId = codeRequestIdRef.current + 1
    codeRequestIdRef.current = requestId

    try {
      const nextCode = await generateNextProjectCode(normalizedLabel)
      if (requestId !== codeRequestIdRef.current) return
      setFormValues((prev) => ({
        ...prev,
        value: nextCode,
      }))
    } catch (err) {
      setFormError(err.message || 'Unable to generate a project code.')
    }
  }

  async function handleFormSubmit(e) {
    e.preventDefault()
    if (isSubmitting) return

    if (!formValues.value.trim()) {
      setFormError('Project code is required.')
      return
    }

    if (!formValues.label.trim()) {
      setFormError('Project name is required.')
      return
    }

    if (!formValues.locationValue.trim()) {
      setFormError('Assigned location is required.')
      return
    }

    try {
      setIsSubmitting(true)

      if (formMode === 'create') {
        const latestGeneratedCode = await generateNextProjectCode(formValues.label)
        await createProject({
          ...formValues,
          value: latestGeneratedCode,
        })
        showToast(`Project ${latestGeneratedCode.trim().toUpperCase()} created.`)
      } else {
        await updateProject(formValues.value, {
          label: formValues.label,
          locationValue: formValues.locationValue,
          projectManagerUserIds: formValues.projectManagerUserIds,
          logisticsForemanUserIds: formValues.logisticsForemanUserIds,
        })
        showToast(`Project ${formValues.value.trim().toUpperCase()} updated.`)
      }

      resetForm()
      await loadPageData()
    } catch (err) {
      setFormError(err.message || 'Unable to save project.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(project) {
    if (isSubmitting) return

    try {
      setIsSubmitting(true)
      const dependencySummary = await getProjectDependencySummary(project.value)

      if (!dependencySummary.canDelete) {
        showToast(
          `Delete blocked. ${project.value} is already tied to system history and should be retained.`,
          'warning'
        )
        return
      }

      const confirmed = window.confirm(
        `Delete ${project.value} - ${project.label}? This should only be used for mistaken entries with no dependencies.`
      )

      if (!confirmed) return

      await deleteProject(project.value)

      if (formMode === 'edit' && formValues.value === project.value) {
        resetForm()
      }

      showToast(`Project ${project.value} deleted.`)
      await loadPageData()
    } catch (err) {
      showToast(err.message || 'Unable to delete project.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleOpenCloseModal(project) {
    try {
      const summary = await getProjectCloseSummary(project.value)
      setActionModal({
        mode: 'close',
        project,
        summary,
        notes: '',
        error: '',
        isSubmitting: false,
      })
    } catch (err) {
      showToast(err.message || 'Unable to load project close summary.', 'error')
    }
  }

  function handleOpenReopenModal(project) {
    setActionModal({
      mode: 'reopen',
      project,
      summary: null,
      notes: '',
      error: '',
      isSubmitting: false,
    })
  }

  function closeActionModal() {
    setActionModal(EMPTY_MODAL)
  }

  async function handleSubmitActionModal(e) {
    e.preventDefault()
    if (!actionModal.project || actionModal.isSubmitting) return

    if (actionModal.mode === 'reopen' && !actionModal.notes.trim()) {
      setActionModal((prev) => ({
        ...prev,
        error: 'A reopen reason is required.',
      }))
      return
    }

    try {
      setActionModal((prev) => ({
        ...prev,
        isSubmitting: true,
        error: '',
      }))

      if (actionModal.mode === 'close') {
        await closeProject(actionModal.project.value, actionModal.notes)
        showToast(`Project ${actionModal.project.value} closed.`)
      } else {
        await reopenProject(actionModal.project.value, actionModal.notes)
        showToast(`Project ${actionModal.project.value} reopened.`)
      }

      closeActionModal()
      if (formMode === 'edit' && formValues.value === actionModal.project.value) {
        resetForm()
      }
      await loadPageData()
    } catch (err) {
      setActionModal((prev) => ({
        ...prev,
        isSubmitting: false,
        error: err.message || `Unable to ${actionModal.mode} project.`,
      }))
    }
  }

  const filteredProjects = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return projects.filter((project) => {
      const matchesSearch =
        !normalizedSearch ||
        project.value.toLowerCase().includes(normalizedSearch) ||
        project.label.toLowerCase().includes(normalizedSearch) ||
        project.location.toLowerCase().includes(normalizedSearch)

      const matchesLocation =
        locationFilter === 'All' ||
        project.locationValue === locationFilter

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && project.statusValue === 'active') ||
        (statusFilter === 'closed' && project.statusValue === 'closed') ||
        (statusFilter === 'recently_closed' && project.statusValue === 'closed' && project.reopenEligible)

      return matchesSearch && matchesLocation && matchesStatus
    })
  }, [projects, searchTerm, locationFilter, statusFilter])

  const assignableProjectManagers = useMemo(
    () => assignableUsers.filter((user) => ['admin', 'projectManager'].includes(user.role)),
    [assignableUsers]
  )

  const assignableLogisticsForemen = useMemo(
    () => assignableUsers.filter((user) => user.role === 'logisticsForeman'),
    [assignableUsers]
  )

  function buildAssignmentSummary(users, selectedUserIds, emptyLabel) {
    const selectedUsers = users.filter((user) => selectedUserIds.includes(String(user.id)))

    if (selectedUsers.length === 0) {
      return emptyLabel
    }

    if (selectedUsers.length <= 2) {
      return selectedUsers.map((user) => user.name).join(', ')
    }

    const previewNames = selectedUsers.slice(0, 2).map((user) => user.name).join(', ')
    return `${previewNames} +${selectedUsers.length - 2} more`
  }

  function renderAssignmentSelector(title, helperText, users, selectedUserIds, fieldName) {
    const isOpen = openAssignmentSection === fieldName
    const summaryText = buildAssignmentSummary(
      users,
      selectedUserIds,
      `No ${title.toLowerCase()} assigned`
    )

    return (
      <div className='form-group receive-form-span-2 manage-project-assignment-group'>
        <span className='form-label'>{title}</span>
        <span className='manage-project-assignment-helper'>{helperText}</span>

        {users.length === 0 ? (
          <div className='manage-project-assignment-empty'>
            No eligible users are currently available.
          </div>
        ) : (
          <div className='manage-project-assignment-picker'>
            <button
              type='button'
              className='manage-project-assignment-summary'
              onClick={() =>
                setOpenAssignmentSection((prev) => (prev === fieldName ? '' : fieldName))
              }
            >
              <span className='manage-project-assignment-summary-text'>{summaryText}</span>
              <span className='manage-project-assignment-summary-meta'>
                {selectedUserIds.length} selected
              </span>
            </button>

            {isOpen ? (
              <div className='manage-project-assignment-listbox' role='listbox' aria-multiselectable='true'>
                {users.map((user) => {
                  const isSelected = selectedUserIds.includes(String(user.id))
                  return (
                    <label
                      key={`${fieldName}-${user.id}`}
                      className={`manage-project-assignment-pill${isSelected ? ' selected' : ''}`}
                    >
                      <input
                        type='checkbox'
                        checked={isSelected}
                        onChange={() => {
                          const nextValues = isSelected
                            ? selectedUserIds.filter((entry) => entry !== String(user.id))
                            : [...selectedUserIds, String(user.id)]

                          setFormValues((prev) => ({
                            ...prev,
                            [fieldName]: nextValues,
                          }))
                        }}
                      />
                      <div className='manage-project-assignment-copy'>
                        <span className='manage-project-assignment-name'>{user.name}</span>
                        <span className='manage-project-assignment-meta'>
                          {user.email} - {formatAssignmentRoleLabel(user.role)}
                        </span>
                      </div>
                    </label>
                  )
                })}
              </div>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  function renderProjectFormCard() {
    if (!formMode) return null

    return (
      <div
        className='inventory-card manage-location-card manage-location-form-card manage-project-card manage-project-form-card'
        ref={formCardRef}
        key={formMode === 'create' ? 'new-project-form' : `edit-${formValues.value}`}
      >
        <div className='inventory-card-top manage-location-card-top manage-project-card-top'>
          <div className='manage-location-card-header'>
            <h3 className='inventory-item-title'>
              {formMode === 'create' ? 'New Project' : 'Edit Project'}
            </h3>
          </div>
          <span className='status-badge available'>Active</span>
        </div>

        <form className='receive-form-grid manage-location-form-grid' onSubmit={handleFormSubmit}>
          <label className='form-group'>
            <span className='form-label'>Project Name</span>
            <input
              ref={nameInputRef}
              className='form-input'
              name='label'
              value={formValues.label}
              onChange={handleFormChange}
              placeholder='Central Office Renovation'
            />
          </label>

          <label className='form-group'>
            <span className='form-label'>Assigned Location</span>
            <select
              className='form-input'
              name='locationValue'
              value={formValues.locationValue}
              onChange={handleFormChange}
            >
              <option value=''>Select location</option>
              {locations.map((location) => (
                <option key={location.value} value={location.value}>
                  {location.label} ({location.value})
                </option>
              ))}
            </select>
          </label>

          <label className='form-group receive-form-span-2'>
            <span className='form-label'>Project Code</span>
            <input
              className='form-input read-only-input'
              name='value'
              value={formValues.value}
              onChange={handleFormChange}
              placeholder='Auto-generated'
              readOnly
            />
          </label>

          {renderAssignmentSelector(
            'Project Managers',
            'Optional. Hold Ctrl or Cmd to select more than one project manager.',
            assignableProjectManagers,
            formValues.projectManagerUserIds,
            'projectManagerUserIds'
          )}

          {renderAssignmentSelector(
            'Logistics Foremen',
            'Optional. Hold Ctrl or Cmd to select more than one logistics foreman.',
            assignableLogisticsForemen,
            formValues.logisticsForemanUserIds,
            'logisticsForemanUserIds'
          )}

          {formError ? (
            <div className='login-error receive-form-span-2'>
              {formError}
            </div>
          ) : null}

          <div className='detail-actions manage-locations-actions receive-form-span-2'>
            <button
              className='secondary-button'
              type='button'
              onClick={resetForm}
              disabled={isSubmitting}
            >
              Cancel
            </button>

            <button className='primary-button' type='submit' disabled={isSubmitting}>
              {isSubmitting
                ? 'Saving...'
                : formMode === 'create'
                ? 'Create Project'
                : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <>
      <div className='inventory-page'>
        <div className='inventory-page-scroll'>
          <FilterHeader
            title='Manage Projects'
            subtitle='Create, update, close, and reopen projects. Closed projects are removed from active operational selection elsewhere in the app.'
            onBack={onBack}
            filtersOpen={filtersOpen}
            onToggleFilters={() => setFiltersOpen((prev) => !prev)}
            rightMetaText={`${filteredProjects.length} project${filteredProjects.length === 1 ? '' : 's'}`}
          >
            <input
              className='inventory-search'
              type='search'
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder='Search by code, project name, or location'
            />

            <div className='filter-row'>
              <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
                <option value='All'>Location: All</option>
                {locations.map((location) => (
                  <option key={location.value} value={location.value}>
                    {location.label}
                  </option>
                ))}
              </select>
            </div>

            <div className='filter-row'>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value='active'>Status: Active</option>
                <option value='recently_closed'>Status: Recently Closed</option>
                <option value='closed'>Status: Closed</option>
                <option value='all'>Status: All</option>
              </select>
            </div>

            <div className='filter-actions manage-location-filter-actions'>
              <button
                className='secondary-button'
                type='button'
                onClick={() => {
                  setSearchTerm('')
                  setLocationFilter('All')
                  setStatusFilter('active')
                }}
              >
                Clear Filters
              </button>
            </div>
          </FilterHeader>

          {pageError ? (
            <section className='page-section receive-form-section'>
              <div className='login-error'>{pageError}</div>
            </section>
          ) : null}

          {isLoading ? (
            <section className='page-section receive-form-section'>
              <p className='section-subtext'>Loading projects...</p>
            </section>
          ) : null}

          <section className='manage-location-content'>
            <div className='inventory-results'>
              <div className='inventory-card-list manage-location-card-list'>
                {formMode === 'create' ? renderProjectFormCard() : null}

                {!isLoading && filteredProjects.length === 0 ? (
                  <div className='empty-state-message'>
                    No projects match the current filters.
                  </div>
                ) : (
                  filteredProjects.map((project) =>
                    formMode === 'edit' && formValues.value === project.value ? (
                      renderProjectFormCard()
                    ) : (
                      <div className='inventory-card manage-location-card manage-project-card' key={project.value}>
                        <div className='inventory-card-top manage-location-card-top manage-project-card-top'>
                          <div className='manage-location-card-header'>
                            <h3 className='inventory-item-title'>{project.label}</h3>
                            <p className='inventory-item-subtext'>{project.value}</p>
                          </div>
                          <span className={`status-badge ${project.statusValue === 'active' ? 'available' : 'low-stock'}`}>
                            {project.status}
                          </span>
                        </div>

                        <div className='inventory-location-block manage-location-projects'>
                          <span className='detail-label'>Location: </span>
                          <span className='detail-value manage-location-inline-value'>
                            {project.location || 'Unassigned location'}
                          </span>
                        </div>

                        <div className='inventory-location-block manage-location-projects'>
                          <span className='detail-label'>Operational Summary:</span>
                          <div className='manage-location-project-list'>
                            <div className='detail-value'>Active inventory lines: {project.activeInventoryCount}</div>
                            {project.closedAt ? (
                              <div className='detail-value'>Last closed: {formatDateTime(project.closedAt)}</div>
                            ) : null}
                          </div>
                        </div>

                        <div className='inventory-location-block manage-location-projects'>
                          <span className='detail-label'>Project Managers:</span>
                          <div className='manage-location-project-list'>
                            {project.projectManagers?.length ? (
                              project.projectManagers.map((assignment) => (
                                <div className='detail-value' key={`pm-${project.value}-${assignment.userId}`}>
                                  {assignment.name}
                                  {assignment.email ? ` - ${assignment.email}` : ''}
                                </div>
                              ))
                            ) : (
                              <div className='detail-value'>No project managers assigned.</div>
                            )}
                          </div>
                        </div>

                        <div className='inventory-location-block manage-location-projects'>
                          <span className='detail-label'>Logistics Foremen:</span>
                          <div className='manage-location-project-list'>
                            {project.logisticsForemen?.length ? (
                              project.logisticsForemen.map((assignment) => (
                                <div className='detail-value' key={`lf-${project.value}-${assignment.userId}`}>
                                  {assignment.name}
                                  {assignment.email ? ` - ${assignment.email}` : ''}
                                </div>
                              ))
                            ) : (
                              <div className='detail-value'>No logistics foremen assigned.</div>
                            )}
                          </div>
                        </div>

                        {project.statusValue === 'closed' ? (
                          <div className='inventory-location-block manage-location-projects'>
                            <span className='detail-label'>Closure Audit:</span>
                            <div className='manage-location-project-list'>
                              <div className='detail-value'>Closed by: {project.closedBy || 'Unknown'}</div>
                              <div className='detail-value'>Closed at: {formatDateTime(project.closedAt) || 'Unknown'}</div>
                              {project.closeNotes ? (
                                <div className='detail-value'>Close notes: {project.closeNotes}</div>
                              ) : null}
                              {project.reopenedAt ? (
                                <div className='detail-value'>Last reopened: {formatDateTime(project.reopenedAt)}</div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}

                        <div className='manage-location-actions-row manage-project-actions-row'>
                          <button
                            className='secondary-button manage-action-button manage-action-edit'
                            type='button'
                            onClick={() => handleEditStart(project)}
                            disabled={project.statusValue !== 'active'}
                            title={
                              project.statusValue !== 'active'
                                ? 'Closed projects cannot be edited until reopened.'
                                : 'Edit project'
                            }
                          >
                            Edit
                          </button>

                          {project.statusValue === 'active' ? (
                            <button
                              className='secondary-button manage-action-button manage-action-deactivate'
                              type='button'
                              onClick={() => void handleOpenCloseModal(project)}
                              disabled={isSubmitting}
                            >
                              Close Project
                            </button>
                          ) : (
                            <button
                              className='secondary-button manage-action-button manage-action-deactivate'
                              type='button'
                              onClick={() => handleOpenReopenModal(project)}
                              disabled={!project.reopenEligible || isSubmitting}
                              title={
                                project.reopenEligible
                                  ? 'Reopen project'
                                  : 'Reopen is only available within 30 days of closure.'
                              }
                            >
                              {project.reopenEligible ? 'Reopen Project' : 'Reopen Expired'}
                            </button>
                          )}

                          <button
                            className='secondary-button manage-action-button manage-action-delete'
                            type='button'
                            onClick={() => void handleDelete(project)}
                            disabled={isSubmitting}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )
                  )
                )}
              </div>
            </div>
          </section>

          <div className='manage-location-sticky-actions'>
            <button
              className='primary-button'
              type='button'
              onClick={handleCreateStart}
            >
              Add Project
            </button>
          </div>
        </div>
      </div>

      {actionModal.project ? (
        <div className='inventory-modal-overlay' onClick={closeActionModal}>
          <div className='inventory-modal-card manage-project-modal-card' onClick={(e) => e.stopPropagation()}>
            <div className='section-heading-row'>
              <div>
                <h3 className='inventory-item-title'>
                  {actionModal.mode === 'close' ? 'Close Project' : 'Reopen Project'}
                </h3>
                <p className='inventory-item-subtext'>
                  {actionModal.project.label} ({actionModal.project.value})
                </p>
              </div>
            </div>

            {actionModal.mode === 'close' ? (
              <div className='manage-project-modal-body'>
                <p className='section-subtext'>
                  Transfer any unused inventory back first if it should remain operationally available. Closing will remove this project from active project selectors and mark any remaining project inventory as consumed until the project is reopened.
                </p>

                <div className='manage-project-summary-grid'>
                  <div className='manage-project-summary-card'>
                    <span className='detail-label'>Active Inventory Lines</span>
                    <span className='manage-project-summary-value'>{actionModal.summary?.activeInventoryCount || 0}</span>
                  </div>
                  <div className='manage-project-summary-card'>
                    <span className='detail-label'>Remaining Quantity</span>
                    <span className='manage-project-summary-value'>{actionModal.summary?.affectedTotalQuantity || 0}</span>
                  </div>
                  <div className='manage-project-summary-card'>
                    <span className='detail-label'>Estimated Cost</span>
                    <span className='manage-project-summary-value'>{formatCurrency(actionModal.summary?.affectedTotalCost || 0)}</span>
                  </div>
                </div>

                {actionModal.summary && !actionModal.summary.canClose ? (
                  <div className='login-error'>
                    This project still has open workflow activity:
                    {' '}
                    requests ({actionModal.summary.openRequestCount}),
                    manifested inventory awaiting transfer ({actionModal.summary.openManifestCount}),
                    transfers ({actionModal.summary.openTransferCount}).
                    Resolve those before closing the project.
                  </div>
                ) : null}

                <form onSubmit={handleSubmitActionModal} className='manage-project-modal-form'>
                  <label className='form-group'>
                    <span className='form-label'>Close Notes (Optional)</span>
                    <textarea
                      className='form-input form-textarea'
                      rows='4'
                      value={actionModal.notes}
                      onChange={(e) =>
                        setActionModal((prev) => ({
                          ...prev,
                          notes: e.target.value,
                          error: '',
                        }))
                      }
                      placeholder='Add any closeout context or reminders for the team.'
                    />
                  </label>

                  {actionModal.error ? (
                    <div className='login-error'>{actionModal.error}</div>
                  ) : null}

                  <div className='detail-actions'>
                    <button className='secondary-button' type='button' onClick={closeActionModal}>
                      Cancel
                    </button>
                    <button
                      className='primary-button'
                      type='submit'
                      disabled={actionModal.isSubmitting || !actionModal.summary?.canClose}
                    >
                      {actionModal.isSubmitting ? 'Closing...' : 'Confirm Close'}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <form onSubmit={handleSubmitActionModal} className='manage-project-modal-body manage-project-modal-form'>
                <p className='section-subtext'>
                  Reopening is intended for accidental closures. Reopening this project will make it selectable again and restore inventory that was marked consumed during the most recent close event.
                </p>

                <label className='form-group'>
                  <span className='form-label'>Reopen Reason</span>
                  <textarea
                    className='form-input form-textarea'
                    rows='4'
                    value={actionModal.notes}
                    onChange={(e) =>
                      setActionModal((prev) => ({
                        ...prev,
                        notes: e.target.value,
                        error: '',
                      }))
                    }
                    placeholder='Explain why the closure was incorrect and why inventory should be restored.'
                  />
                </label>

                {actionModal.error ? (
                  <div className='login-error'>{actionModal.error}</div>
                ) : null}

                <div className='detail-actions'>
                  <button className='secondary-button' type='button' onClick={closeActionModal}>
                    Cancel
                  </button>
                  <button className='primary-button' type='submit' disabled={actionModal.isSubmitting}>
                    {actionModal.isSubmitting ? 'Reopening...' : 'Confirm Reopen'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}

      <Toast
        message={toast.message}
        type={toast.type}
        onClose={() => setToast({ message: '', type: 'success' })}
      />
    </>
  )
}

export default ManageProjectsPage
