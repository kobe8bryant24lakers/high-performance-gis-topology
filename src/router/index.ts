import { createRouter, createWebHistory } from 'vue-router'
import TopologyView from '@/views/TopologyView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'topology', component: TopologyView },
  ],
})

export default router
