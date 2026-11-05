import { createRouter, createWebHistory } from 'vue-router'
import Hub from '../views/Hub.vue'
import { stockmateRoutes } from '../mates/stockmate/routes'
import { econmateRoutes } from '../mates/econmate/routes'
import { kanmateRoutes } from '../mates/kanmate/routes'
import { savemateRoutes } from '../mates/savemate/routes'
import { kinmateRoutes } from '../mates/kinmate/routes'

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
    ...savemateRoutes,
    ...kinmateRoutes,
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
