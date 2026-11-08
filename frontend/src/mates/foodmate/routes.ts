import type { RouteRecordRaw } from 'vue-router'

const meta = { mate: 'foodmate' }

export const foodmateRoutes: RouteRecordRaw[] = [
  { path: '/foodmate', component: () => import('./FoodMatePage.vue'), meta },
  { path: '/foodmate/dagbog', component: () => import('./FoodMatePage.vue'), meta },
  { path: '/foodmate/ingredienser', component: () => import('./FoodMatePage.vue'), meta },
  { path: '/foodmate/papirkurv', component: () => import('./FoodMatePage.vue'), meta },
]
