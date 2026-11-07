import type { RouteRecordRaw } from 'vue-router'

const meta = { mate: 'stockmate' }

export const stockmateRoutes: RouteRecordRaw[] = [
  { path: '/stockmate', component: () => import('./views/StockmateHome.vue'), meta },
  { path: '/stockmate/portfolio/:userId(\\d+)', component: () => import('./views/Portfolio.vue'), meta },
  { path: '/stockmate/portfolio/:userId(\\d+)/ny', component: () => import('./views/TransactionForm.vue'), meta },
  { path: '/stockmate/portfolio/:userId(\\d+)/skat', component: () => import('./views/TaxReport.vue'), meta },
  { path: '/stockmate/transaktion/:txId(\\d+)', component: () => import('./views/TransactionForm.vue'), meta },
]
