import { useEffect, useMemo, useRef, useState } from "react"
import FilterHeader from "./FilterHeader"
import Toast from "./Toast"
import {
  buildManagedUserDraft,
  createManagedUser,
  deactivateManagedUser,
  getManageUsers,
  hydrateManageUsersLastLogin,
  MANAGE_USER_ROLE_OPTIONS,
  previewManagedUsername,
  previewManagedEmail,
  reactivateManagedUser,
  updateManagedUser,
} from "../services/userAdminService"

const EMPTY_FORM = buildManagedUserDraft()

function formatDateTime(value) {
  if (!value) return "Never"
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "Never"
  return parsed.toLocaleString()
}

function ManageUsersPage({ onBack, currentUser }) {
  const [filtersOpen, setFiltersOpen] = useState(() => window.innerWidth > 900)
  const [toast, setToast] = useState({ message: "", type: "success" })
  const [users, setUsers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isHydratingLogins, setIsHydratingLogins] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pageError, setPageError] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("active")
  const [roleFilter, setRoleFilter] = useState("All")
  const [formMode, setFormMode] = useState("")
  const [editingUserId, setEditingUserId] = useState("")
  const [formValues, setFormValues] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState("")
  const [emailManuallyEdited, setEmailManuallyEdited] = useState(false)
  const formCardRef = useRef(null)
  const firstNameInputRef = useRef(null)

  useEffect(() => {
    void loadUsers()
  }, [])

  async function loadUsers() {
    try {
      setIsLoading(true)
      setPageError("")
      const nextUsers = await getManageUsers()
      setUsers(nextUsers)
      setIsLoading(false)

      setIsHydratingLogins(true)
      const enrichedUsers = await hydrateManageUsersLastLogin(nextUsers)
      setUsers(enrichedUsers)
    } catch (err) {
      setPageError(err.message || "Unable to load users.")
    } finally {
      setIsLoading(false)
      setIsHydratingLogins(false)
    }
  }

  function showToast(message, type = "success") {
    setToast({ message, type })

    window.clearTimeout(showToast.timeoutId)
    showToast.timeoutId = window.setTimeout(() => {
      setToast({ message: "", type: "success" })
    }, 3000)
  }

  function resetForm() {
    setFormMode("")
    setEditingUserId("")
    setFormValues(EMPTY_FORM)
    setFormError("")
    setEmailManuallyEdited(false)
  }

  useEffect(() => {
    if (!formMode) return undefined

    const frameId = window.requestAnimationFrame(() => {
      formCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      })
      firstNameInputRef.current?.focus()
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [formMode])

  const activeAdminCount = useMemo(
    () => users.filter((user) => user.isActive && user.role === "admin").length,
    [users],
  )

  function syncGeneratedIdentity(firstName, lastName, { preserveEmail = false } = {}) {
    const username = previewManagedUsername(firstName, lastName, users, editingUserId)
    const generatedEmail = previewManagedEmail(firstName, lastName)

    setFormValues((prev) => ({
      ...prev,
      firstName,
      lastName,
      username,
      email:
        formMode === "create" && !preserveEmail
          ? generatedEmail
          : prev.email,
    }))
  }

  function handleCreateStart() {
    setFormMode("create")
    setEditingUserId("")
    setFormValues({
      ...EMPTY_FORM,
      role: "logisticsAssociate",
    })
    setFormError("")
    setEmailManuallyEdited(false)
  }

  function handleEditStart(user) {
    setFormMode("edit")
    setEditingUserId(user.id)
    setFormValues({
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email || "",
      role: user.role,
      username: user.username || "",
      initialPassword: "",
      newPassword: "",
    })
    setFormError("")
    setEmailManuallyEdited(true)
  }

  function handleFormChange(e) {
    const { name, value } = e.target

    if (formError) {
      setFormError("")
    }

    if (name === "firstName" || name === "lastName") {
      const nextFirstName = name === "firstName" ? value : formValues.firstName
      const nextLastName = name === "lastName" ? value : formValues.lastName

      syncGeneratedIdentity(nextFirstName, nextLastName, {
        preserveEmail: formMode !== "create" || emailManuallyEdited,
      })
      return
    }

    if (name === "email") {
      setEmailManuallyEdited(true)
    }

    setFormValues((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  function validateForm() {
    if (!formValues.firstName.trim()) {
      setFormError("First name is required.")
      return false
    }

    if (!formValues.lastName.trim()) {
      setFormError("Last name is required.")
      return false
    }

    if (!formValues.email.trim()) {
      setFormError("Email is required.")
      return false
    }

    if (!formValues.role.trim()) {
      setFormError("Role is required.")
      return false
    }

    if (formMode === "create" && !formValues.initialPassword.trim()) {
      setFormError("Initial password is required.")
      return false
    }

    return true
  }

  async function handleFormSubmit(e) {
    e.preventDefault()
    if (isSubmitting) return

    if (!validateForm()) return

    try {
      setIsSubmitting(true)

      if (formMode === "create") {
        await createManagedUser({
          firstName: formValues.firstName,
          lastName: formValues.lastName,
          email: formValues.email,
          role: formValues.role,
          initialPassword: formValues.initialPassword,
        })
        showToast(`User ${formValues.firstName} ${formValues.lastName} created.`)
      } else {
        await updateManagedUser(editingUserId, {
          firstName: formValues.firstName,
          lastName: formValues.lastName,
          email: formValues.email,
          role: formValues.role,
          newPassword: formValues.newPassword,
        })
        showToast(`User ${formValues.firstName} ${formValues.lastName} updated.`)
      }

      resetForm()
      await loadUsers()
    } catch (err) {
      setFormError(err.message || "Unable to save user.")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDeactivate(user) {
    if (isSubmitting) return

    const confirmed = window.confirm(`Deactivate ${user.name}? They will be blocked from logging in immediately.`)
    if (!confirmed) return

    try {
      setIsSubmitting(true)
      await deactivateManagedUser(user.id)
      if (editingUserId === user.id) {
        resetForm()
      }
      showToast(`${user.name} deactivated.`, "warning")
      await loadUsers()
    } catch (err) {
      showToast(err.message || "Unable to deactivate user.", "error")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleReactivate(user) {
    if (isSubmitting) return

    try {
      setIsSubmitting(true)
      await reactivateManagedUser(user.id)
      showToast(`${user.name} reactivated.`)
      await loadUsers()
    } catch (err) {
      showToast(err.message || "Unable to reactivate user.", "error")
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleClearFilters() {
    setSearchTerm("")
    setStatusFilter("active")
    setRoleFilter("All")
  }

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return users.filter((user) => {
      const matchesSearch =
        !normalizedSearch ||
        user.name.toLowerCase().includes(normalizedSearch)

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && user.isActive) ||
        (statusFilter === "inactive" && !user.isActive)

      const matchesRole =
        roleFilter === "All" ||
        user.role === roleFilter

      return matchesSearch && matchesStatus && matchesRole
    })
  }, [users, searchTerm, statusFilter, roleFilter])

  function getRoleBadgeClass(role) {
    switch (role) {
      case "admin":
        return "role-badge role-badge-admin"
      case "projectManager":
        return "role-badge role-badge-project-manager"
      case "warehouseManager":
        return "role-badge role-badge-warehouse-manager"
      case "logisticsForeman":
        return "role-badge role-badge-logistics-foreman"
      default:
        return "role-badge role-badge-logistics-associate"
    }
  }

  function canDeactivateUser(user) {
    if (!user.isActive) return false
    if (String(user.id) === String(currentUser?.id)) return false
    if (user.role === "admin" && activeAdminCount <= 1) return false
    return true
  }

  function canEditRoleForUser(user) {
    if (!user) return true
    if (String(user.id) === String(currentUser?.id) && currentUser?.role === "admin") return false
    if (user.role === "admin" && user.isActive && activeAdminCount <= 1) return false
    return true
  }

  function renderFormCard() {
    if (!formMode) return null

    const editingExistingUser = formMode === "edit"
    const editedUser = editingExistingUser
      ? users.find((user) => String(user.id) === String(editingUserId)) || null
      : null

    return (
      <div
        className="inventory-card manage-location-card manage-user-card manage-location-form-card"
        ref={formCardRef}
      >
        <div className="inventory-card-top manage-location-card-top manage-user-card-top">
          <div className="manage-location-card-header">
            <h3 className="inventory-item-title">
              {editingExistingUser ? "Edit User" : "New User"}
            </h3>
            <p className="inventory-item-subtext">
              {editingExistingUser ? formValues.email || "Update account details" : "Create a new MEC2 account"}
            </p>
          </div>
          <span className={`status-badge ${editingExistingUser && !editedUser?.isActive ? "out-of-stock" : "available"}`}>
            {editingExistingUser && !editedUser?.isActive ? "Inactive" : "Active"}
          </span>
        </div>

        <form className="receive-form-grid manage-location-form-grid" onSubmit={handleFormSubmit}>
          <label className="form-group">
            <span className="form-label">First Name</span>
            <input
              ref={firstNameInputRef}
              className="form-input"
              name="firstName"
              value={formValues.firstName}
              onChange={handleFormChange}
              placeholder="Jim"
            />
          </label>

          <label className="form-group">
            <span className="form-label">Last Name</span>
            <input
              className="form-input"
              name="lastName"
              value={formValues.lastName}
              onChange={handleFormChange}
              placeholder="West"
            />
          </label>

          <label className="form-group">
            <span className="form-label">Email</span>
            <input
              className="form-input"
              name="email"
              type="email"
              value={formValues.email}
              onChange={handleFormChange}
              placeholder="jim.west@coolsys.com"
            />
          </label>

          <label className="form-group">
            <span className="form-label">Role</span>
            <select
              className="form-input"
              name="role"
              value={formValues.role}
              onChange={handleFormChange}
              disabled={Boolean(editedUser) && !canEditRoleForUser(editedUser)}
            >
              {MANAGE_USER_ROLE_OPTIONS.map((roleOption) => (
                <option key={roleOption.value} value={roleOption.value}>
                  {roleOption.label}
                </option>
              ))}
            </select>
          </label>

          <label className="form-group">
            <span className="form-label">Username</span>
            <input
              className="form-input read-only-input"
              value={formValues.username}
              readOnly
            />
          </label>

          <label className="form-group">
            <span className="form-label">
              {editingExistingUser ? "New Password (Optional)" : "Initial Password"}
            </span>
            <input
              className="form-input"
              name={editingExistingUser ? "newPassword" : "initialPassword"}
              type="password"
              value={editingExistingUser ? formValues.newPassword : formValues.initialPassword}
              onChange={handleFormChange}
              placeholder={editingExistingUser ? "Leave blank to keep current password" : "Set initial password"}
            />
          </label>

          {formError ? <div className="login-error manage-user-form-error">{formError}</div> : null}

          <div className="receive-actions manage-user-form-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={resetForm}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={isSubmitting}>
              {editingExistingUser ? "Save User" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    )
  }

  if (isLoading) {
    return <div className="inventory-page"><div className="inventory-page-scroll"><div>Loading...</div></div></div>
  }

  return (
    <div className="inventory-page">
      <div className="inventory-page-scroll">
        <FilterHeader
          title="Manage Users"
          subtitle="Create, update, deactivate, and review MEC2 user accounts."
          onBack={onBack}
          filtersOpen={filtersOpen}
          onToggleFilters={() => setFiltersOpen((prev) => !prev)}
          rightMetaText={`${filteredUsers.length} user${filteredUsers.length !== 1 ? "s" : ""}${isHydratingLogins ? " • refreshing activity" : ""}`}
        >
          <input
            type="text"
            className="inventory-search"
            placeholder="Search by full or partial name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <div className="filter-row">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="active">Status: Active</option>
              <option value="inactive">Status: Inactive</option>
              <option value="all">Status: All</option>
            </select>

            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="All">Role: All</option>
              {MANAGE_USER_ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  Role: {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-actions">
            <button className="secondary-button" type="button" onClick={handleClearFilters}>
              Clear Filters
            </button>
          </div>
        </FilterHeader>

        <section className="inventory-content">
          <div className="inventory-results manage-location-content">
            {pageError ? <div className="login-error">{pageError}</div> : null}

            <div className="inventory-card-list manage-location-card-list">
              {renderFormCard()}

              {filteredUsers.map((user) => {
                const disableDeactivate = !canDeactivateUser(user)
                const deactivateTitle = !user.isActive
                  ? "User is already inactive."
                  : String(user.id) === String(currentUser?.id)
                  ? "You cannot deactivate your own account."
                  : user.role === "admin" && activeAdminCount <= 1
                  ? "At least one active admin must remain."
                  : "Deactivate user"

                return (
                  <div className="inventory-card manage-location-card manage-user-card" key={user.id}>
                    <div className="inventory-card-top manage-location-card-top manage-user-card-top">
                      <div className="manage-location-card-header">
                        <h3 className="inventory-item-title">{user.name}</h3>
                        <p className="inventory-item-subtext">{user.email}</p>
                      </div>
                      <span className={`status-badge ${user.isActive ? "available" : "out-of-stock"}`}>
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>

                    <div className="manage-user-role-row">
                      <span className={getRoleBadgeClass(user.role)}>{user.roleLabel}</span>
                    </div>

                    <div className="inventory-card-details">
                      <div>
                        <span className="detail-label">Username: </span>
                        <span className="detail-value">{user.username}</span>
                      </div>

                      <div>
                        <span className="detail-label">Last Login: </span>
                        <span className="detail-value">{formatDateTime(user.lastLoginAt)}</span>
                      </div>
                    </div>

                    <div className="manage-location-actions-row manage-user-actions-row">
                      <button
                        className="secondary-button manage-action-button manage-action-edit"
                        type="button"
                        onClick={() => handleEditStart(user)}
                        disabled={isSubmitting}
                      >
                        Edit
                      </button>

                      {user.isActive ? (
                        <button
                          className="secondary-button manage-action-button manage-action-deactivate"
                          type="button"
                          onClick={() => void handleDeactivate(user)}
                          disabled={disableDeactivate || isSubmitting}
                          title={deactivateTitle}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          className="secondary-button manage-action-button manage-action-reactivate"
                          type="button"
                          onClick={() => void handleReactivate(user)}
                          disabled={isSubmitting}
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <div className="manage-location-sticky-actions">
          <button
            className="primary-button"
            type="button"
            onClick={handleCreateStart}
            disabled={isSubmitting}
          >
            Add User
          </button>
        </div>
      </div>

      {toast.message ? (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast({ message: "", type: "success" })}
        />
      ) : null}
    </div>
  )
}

export default ManageUsersPage
