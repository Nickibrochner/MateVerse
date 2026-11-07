<template>
  <div class="line-chart">
    <canvas v-show="points.length > 1" ref="canvas" height="90"></canvas>
    <p v-if="points.length <= 1" class="text-sm text-stone-500 py-6 text-center">{{ emptyText }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Chart from 'chart.js/auto'

const props = withDefaults(
  defineProps<{
    points: { label: string; value: number }[]
    color?: string
    emptyText?: string
  }>(),
  { color: '#0078D4', emptyText: 'Ingen data endnu.' },
)

const canvas = ref<HTMLCanvasElement | null>(null)
let chart: Chart | null = null

function render() {
  if (chart) {
    chart.destroy()
    chart = null
  }
  if (!canvas.value || props.points.length <= 1) return

  chart = new Chart(canvas.value, {
    type: 'line',
    data: {
      labels: props.points.map(p => p.label),
      datasets: [{
        data: props.points.map(p => p.value),
        borderColor: props.color,
        backgroundColor: `${props.color}22`,
        fill: true,
        spanGaps: true,
        tension: 0.3,
        pointRadius: 2,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { maxTicksLimit: 8 } } },
    },
  })
}

onMounted(async () => {
  await nextTick()
  render()
})

watch(() => [props.points, props.color], async () => {
  await nextTick()
  render()
}, { deep: true })

onBeforeUnmount(() => {
  if (chart) {
    chart.destroy()
    chart = null
  }
})
</script>

<style scoped>
.line-chart { min-height: 90px; }
</style>
