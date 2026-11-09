import type { RouteRecordRaw } from 'vue-router'

const meta = { mate: 'catmate' }

export const catmateRoutes: RouteRecordRaw[] = [
  { path: '/catmate', component: () => import('./CatMatePage.vue'), meta },
  { path: '/catmate/indsigt', component: () => import('./CatMatePage.vue'), meta },
  { path: '/catmate/indstillinger', component: () => import('./CatMatePage.vue'), meta },
]
