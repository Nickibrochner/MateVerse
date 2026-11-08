import type { RouteRecordRaw } from 'vue-router'

const meta = { mate: '500mate' }

export const mate500Routes: RouteRecordRaw[] = [
  { path: '/500mate', component: () => import('./Mate500Page.vue'), meta },
  { path: '/500mate/leaderboard', component: () => import('./Mate500Page.vue'), meta },
  { path: '/500mate/regler', component: () => import('./Mate500Page.vue'), meta },
  { path: '/500mate/spillere', component: () => import('./Mate500Page.vue'), meta },
  { path: '/500mate/spil/:id(\\d+)', component: () => import('./views/AktivRundeView.vue'), meta },
]
