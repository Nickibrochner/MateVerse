import type { RouteRecordRaw } from 'vue-router'

const meta = { mate: 'diskmate' }
const page = () => import('./DiskPage.vue')

export const diskmateRoutes: RouteRecordRaw[] = ['', '/spiller', '/grupperunder', '/huller', '/diske', '/indstillinger']
  .map(p => ({ path: `/diskmate${p}`, component: page, meta }))
