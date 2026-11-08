import { ref } from 'vue'

/** Simpelt signal, der fortæller de åbne views at en synkronisering er gennemført, så de kan genindlæse. */
export const syncTick = ref(0)

export function bumpSync() {
  syncTick.value++
}
