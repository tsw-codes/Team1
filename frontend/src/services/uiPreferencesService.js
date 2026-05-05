const UI_PREFERENCES_STORAGE_KEY = "inventory-ui-preferences"

const DEFAULT_PREFERENCES = {
  theme: "system",
  stickyHeadersEnabled: true,
}

function isBrowser() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined"
}

function sanitizeTheme(value) {
  if (value === "light" || value === "dark" || value === "system") {
    return value
  }

  return DEFAULT_PREFERENCES.theme
}

function sanitizeStickyHeadersEnabled(value) {
  if (typeof value === "boolean") return value
  return DEFAULT_PREFERENCES.stickyHeadersEnabled
}

function sanitizePreferences(value = {}) {
  return {
    theme: sanitizeTheme(value.theme),
    stickyHeadersEnabled: sanitizeStickyHeadersEnabled(value.stickyHeadersEnabled),
  }
}

export function getDefaultUiPreferences() {
  return { ...DEFAULT_PREFERENCES }
}

export function getStoredUiPreferences() {
  if (!isBrowser()) {
    return getDefaultUiPreferences()
  }

  try {
    const raw = localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)

    if (!raw) {
      return getDefaultUiPreferences()
    }

    const parsed = JSON.parse(raw)
    return sanitizePreferences(parsed)
  } catch {
    return getDefaultUiPreferences()
  }
}

export function saveUiPreferences(preferences) {
  const normalized = sanitizePreferences(preferences)

  if (isBrowser()) {
    localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized))
  }

  return normalized
}

export function updateStoredUiPreferences(updates) {
  const current = getStoredUiPreferences()
  const next = sanitizePreferences({
    ...current,
    ...updates,
  })

  return saveUiPreferences(next)
}

export function getResolvedTheme(themePreference) {
  if (themePreference === "light" || themePreference === "dark") {
    return themePreference
  }

  if (
    isBrowser() &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark"
  }

  return "light"
}

export function applyUiPreferences(preferences) {
  if (!isBrowser()) return

  const normalized = sanitizePreferences(preferences)
  const resolvedTheme = getResolvedTheme(normalized.theme)
  const root = document.documentElement

  root.dataset.theme = resolvedTheme
  root.dataset.themePreference = normalized.theme

  if (normalized.stickyHeadersEnabled) {
    root.classList.remove("sticky-headers-disabled")
  } else {
    root.classList.add("sticky-headers-disabled")
  }
}