export function createAuditTimestamp() {
    return new Date().toISOString()
}

export function formatAuditTimestamp(value) {
    if(!value) return ""

    const date = new Date(value)

    if(Number.isNaN(date.getTime())) return value
    
    return date.toLocaleString()
}