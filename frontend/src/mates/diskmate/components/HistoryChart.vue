<template>
  <div class="history-chart">
    <canvas v-show="hasData" ref="chartCanvas" height="90"></canvas>
    <p v-if="!hasData" class="empty-state">{{ emptyText }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

import Chart from 'chart.js/auto'

export interface ChartPoint {
  date: string
  value: number
}

export interface ChartSeries {
  label: string
  points: ChartPoint[]
  color?: string
}

const PALETTE = ['#0078D4', '#D83B01', '#107C10', '#8764B8']

const props = withDefaults(
  defineProps<{
    points?: ChartPoint[]
    seriesLabel?: string
    series?: ChartSeries[]
    yAxisLabel?: string
    emptyText?: string
    /** Vend Y-aksen så negative tal (bedre end par) vises øverst. */
    reverseY?: boolean
  }>(),
  {
    points: () => [],
    seriesLabel: '',
    series: undefined,
    yAxisLabel: 'Score ift. par',
    emptyText: 'Ingen data endnu.',
    reverseY: false,
  },
)

// Understøtter enten en enkelt serie (points/seriesLabel, bagudkompatibelt)
// eller flere serier på samme graf (series), fx til hoved-til-hoved.
const seriesList = computed<ChartSeries[]>(() => {
  if (props.series && props.series.length > 0) return props.series
  return [{ label: props.seriesLabel, points: props.points }]
})

const hasData = computed(() => seriesList.value.some(s => s.points.length > 0))

const chartCanvas = ref<HTMLCanvasElement | null>(null)
let chartInstance: any = null

function render() {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
  if (!chartCanvas.value || !hasData.value) return

  const list = seriesList.value
  const allDates = Array.from(new Set(list.flatMap(s => s.points.map(p => p.date)))).sort()

  const datasets = list.map((s, i) => {
    const color = s.color ?? PALETTE[i % PALETTE.length]
    const byDate = new Map(s.points.map(p => [p.date, p.value]))
    return {
      label: s.label,
      data: allDates.map(d => (byDate.has(d) ? byDate.get(d)! : null)),
      borderColor: color,
      backgroundColor: color + '22',
      fill: list.length === 1,
      spanGaps: false,
      tension: 0.3,
      pointRadius: 3,
    }
  })

  chartInstance = new Chart(chartCanvas.value, {
    type: 'line',
    data: { labels: allDates, datasets },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: {
        x: { ticks: { maxTicksLimit: 8 } },
        y: {
          reverse: props.reverseY,
          title: { display: true, text: props.yAxisLabel },
        },
      },
    },
  })
}

onMounted(async () => {
  await nextTick()
  render()
})

watch(
  () => [seriesList.value, props.reverseY],
  async () => {
    await nextTick()
    render()
  },
  { deep: true },
)

onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
})
</script>

<style scoped>
.history-chart { margin-bottom: 12px; }
</style>
