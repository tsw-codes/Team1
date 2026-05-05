export function createAuditTimestamp() {
    return new Date().toISOString()
}

export function formatAuditTimestamp(value) {
    if (!value) return ""

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) return value

    return date.toLocaleString()
}

export function formatDate(dateString) {
    if (!dateString) return ""

    if (typeof dateString === "string") {
        const plainDateMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/)

        if (plainDateMatch) {
            const [, year, month, day] = plainDateMatch
            return `${Number(month)}/${Number(day)}/${year}`
        }
    }

    const date = new Date(dateString)

    if (Number.isNaN(date.getTime())) return dateString

    return date.toLocaleDateString(undefined, {
        month: "numeric",
        day: "numeric",
        year: "numeric",
    })
}