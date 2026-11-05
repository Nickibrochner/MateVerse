import { createRouter, createWebHistory } from 'vue-router'
import Hub from '../views/Hub.vue'
import { stockmateRoutes } from '../mates/stockmate/routes'
import { econmateRoutes } from '../mates/econmate/routes'
import { kanmateRoutes } from '../mates/kanmate/routes'
import { kinmateRoutes } from '../mates/kinmate/routes'
import { diskmateRoutes } from '../mates/diskmate/routes'

declare module 'vue-router' {
  interface RouteMeta {
    /** Den mate, ruten hører til – styrer topbar og accentfarve. */
    mate?: string
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Hub },
    ...stockmateRoutes,
    ...econmateRoutes,
    ...kanmateRoutes,
    ...kinmateRoutes,
    ...diskmateRoutes,
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
