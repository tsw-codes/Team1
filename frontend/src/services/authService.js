import { mockUsers } from "../auth/mockUsers"

const userDataSource = {
    getAll() {
        return mockUsers
    },

    findById(id) {
        return mockUsers.find((user) => user.id === id) || null
    },

    findByUsername(username) {
        return mockUsers.find((user) => user.username === username) || null
    },

    findByCredentials(username, password) {
        return (
            mockUsers.find(
                (user) =>
                    user.username === username && user.password === password
            ) || null
        )
    },

    replaceById(id, updatedUser) {
        const index = mockUsers.findIndex((user) => user.id === id)

        if (index === -1) return null

        mockUsers[index] = updatedUser
        return mockUsers[index]
    },
}

export function getAllUsers() {
    return userDataSource.getAll()
}

export function authenticateUser(username, password) {
    return userDataSource.findByCredentials(username, password)
}

export function findUserById(id) {
    return userDataSource.findById(id)
}

export function findUserByUsername(username) {
    return userDataSource.findByUsername(username)
}

export function updateUserPassword(userId, newPassword) {
    const user = userDataSource.findById(userId)
    if (!user) return null

    const updatedUser = {
        ...user,
        password: newPassword,
    }

    return userDataSource.replaceById(userId, updatedUser)
}