import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'
import { hubApi, type User } from '../api'

/** Brugerne er fælles for hele hubben – alle mates slår op her. */
export const useUsersStore = defineStore('users', () => {
  const users = ref<User[]>([])
  const loaded = ref(false)
  const error = ref<string | null>(null)

  async function load(force = false) {
    if (loaded.value && !force) return
    try {
      users.value = await hubApi.listUsers()
      loaded.value = true
      error.value = null
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function create(username: string) {
    const user = await hubApi.createUser(username)
    users.value.push(user)
    return user
  }

  const byId = (id: number) => users.value.find(u => u.id === id)

  return { users, loaded, error, load, create, byId }
})

if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useUsersStore, import.meta.hot))
