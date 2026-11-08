import type { RouteRecordRaw } from 'vue-router'

const meta = { mate: 'contactmate' }

export const contactmateRoutes: RouteRecordRaw[] = [
  { path: '/contactmate', component: () => import('./ContactMatePage.vue'), meta },
  { path: '/contactmate/dubletter', component: () => import('./ContactMatePage.vue'), meta },
  { path: '/contactmate/linkedin', component: () => import('./ContactMatePage.vue'), meta },
  { path: '/contactmate/indstillinger', component: () => import('./ContactMatePage.vue'), meta },
]
