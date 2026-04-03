import { mockUsers } from "../auth/mockUsers"

export function authenticateUser(username, password) {
    return (
        mockUsers.find(
            (user) => user.username === username && user.password === password
        ) || null
    )
}

export function findUserById(id) {
    return mockUsers.find((user) => user.id === id) || null
}

export function findUserbyUsername(username) {
    return mockUsers.find((user) => user.username === username) || null
}

export function updateUserPassword(userId, newPassword) {
    const index = mockUsers.find((user) => user.id === userId)

    if (index === -1) return null

    mockUsers[index] = {
        ...mockUsers[index],
        password: newPassword,
    }

    return mockUsers[index]
}