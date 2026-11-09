import { synkAlt } from './tractive'

/**
 * Baggrundshentning for CatMate. Uden den findes der kun data fra de tidspunkter, hvor nogen har
 * haft siden åben – og batteri-prognose, territorium og hjemme/ude-tid kræver en ubrudt historik.
 * Startes fra index.ts (ikke ved import), så tests ikke begynder at kalde Tractive.
 */
const INTERVAL = 5 * 60_000

export function startCatmatePoller() {
  const kør = () => synkAlt().catch(e => console.error('CatMate: baggrundshentning fejlede –', (e as Error).message))
  setTimeout(kør, 10_000)
  setInterval(kør, INTERVAL)
}
