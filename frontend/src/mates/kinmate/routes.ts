import type { RouteRecordRaw } from 'vue-router'

const meta = { mate: 'kinmate' }

export const kinmateRoutes: RouteRecordRaw[] = [
  { path: '/kinmate', component: () => import('./views/Tree.vue'), meta },
  { path: '/kinmate/anecirkel', component: () => import('./views/Anecirkel.vue'), meta },
  { path: '/kinmate/kort', component: () => import('./views/Kort.vue'), meta },
  { path: '/kinmate/tidslinje', component: () => import('./views/Tidslinje.vue'), meta },
  { path: '/kinmate/personer', component: () => import('./views/Personer.vue'), meta },
  { path: '/kinmate/personer/:personId', component: () => import('./views/PersonDetail.vue'), meta },
  { path: '/kinmate/relationer', component: () => import('./views/Relationer.vue'), meta },
  { path: '/kinmate/datakvalitet', component: () => import('./views/Datakvalitet.vue'), meta },
  { path: '/kinmate/kilder', component: () => import('./views/Kilder.vue'), meta },
  { path: '/kinmate/indstillinger', component: () => import('./views/Indstillinger.vue'), meta },
]
