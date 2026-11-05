<template>
  <KinPage title="Datakvalitet">
    <template #actions>
      <span class="tag bg-stone-100 text-stone-600 self-center">{{ store.persons.length }} personer</span>
      <span class="tag bg-stone-100 text-stone-600 self-center">{{ store.relations.length }} relationer ({{ primære.length }} primære)</span>
      <span class="tag self-center" :class="total ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'">{{ total ? `${total} problemer` : '✓ Ingen problemer' }}</span>
    </template>

    <input v-model="søgning" class="field max-w-sm" placeholder="Filtrér fund på personnavn …">

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
      <section class="space-y-3">
        <h2 class="section-title">📋 Manglende information</h2>
        <TjekKort titel="Uden køn registreret" :antal="manglerKøn.length" alvorlig ok="Alle har køn" hjælp="Køn bruges til korrekte modparter og forslag (bror/søster, far/mor osv.).">
          <PersonChips :personer="manglerKøn" />
        </TjekKort>
        <TjekKort titel="Uden fødselsdato" :antal="manglerFødsel.length" ok="Alle har fødselsdato">
          <PersonChips :personer="manglerFødsel" />
        </TjekKort>
        <TjekKort titel="Ingen relationer (isolerede)" :antal="ingenRelationer.length" alvorlig ok="Ingen isolerede personer">
          <PersonChips :personer="ingenRelationer" relationer />
        </TjekKort>
        <TjekKort titel="Kun automatiske relationer" :antal="kunAuto.length" ok="Alle har mindst én primær relation" hjælp="Personens relationer er kun modparter – der mangler sandsynligvis en relation, der er oprettet manuelt.">
          <PersonChips :personer="kunAuto" relationer />
        </TjekKort>

        <h2 class="section-title !mt-6">👥 Persondubletter</h2>
        <TjekKort titel="Personer med samme navn" :antal="dubletGrupper.length" alvorlig ok="Ingen navnedubletter" hjælp="Vælg, hvem der skal beholdes. De andres relationer, kilder og opgaver flyttes over, og tomme felter udfyldes.">
          <ul class="space-y-3">
            <li v-for="(g, gi) in dubletGrupper" :key="gi" class="text-sm">
              <div class="font-semibold">{{ g[0].navn }} ({{ g.length }} personer)</div>
              <ul class="mt-1 space-y-1">
                <li v-for="p in g" :key="p.id" class="flex flex-wrap items-center gap-2 text-xs text-stone-600">
                  <span>{{ p.fødselsdato ?? 'ukendt fødsel' }}<template v-if="p.dødsdato"> · {{ p.dødsdato }}</template> · {{ relFor(p.id).length }} relationer</span>
                  <button type="button" class="btn-secondary !py-0.5 !px-2 !text-xs ml-auto" :disabled="fletter === p.id" @click="flet(g, p.id)">
                    {{ fletter === p.id ? 'Fletter …' : 'Behold denne, flet resten ind' }}
                  </button>
                </li>
              </ul>
            </li>
          </ul>
        </TjekKort>
      </section>

      <section class="space-y-3">
        <h2 class="section-title">⚠️ Mistænkelige mønstre</h2>
        <TjekKort titel="Aldersinkonsistens" :antal="aldersinkonsistens.length" alvorlig ok="Ingen aldersinkonsistens">
          <Fund :rækker="aldersinkonsistens.map(i => ({ tekst: i.årsag, links: [['Barn', i.barn.id], ['Forælder', i.forælder.id]] }))" />
        </TjekKort>
        <TjekKort titel="Dødsdato før fødselsdato" :antal="dødFørFødt.length" alvorlig ok="Ingen ugyldige datoer">
          <PersonChips :personer="dødFørFødt" />
        </TjekKort>
        <TjekKort titel="Cirkulære forældrerelationer" :antal="cirkulære.length" alvorlig ok="Ingen cirkulære relationer">
          <Fund :rækker="cirkulære.map(i => ({ tekst: `${i.a.navn} og ${i.b.navn} er hinandens forældre`, relationer: i.a.id }))" />
        </TjekKort>
        <TjekKort titel="Dobbeltrolle (søskende og forælder/barn)" :antal="dobbeltrolle.length" ok="Ingen dobbeltroller" hjælp="Kan være rigtigt i sammenbragte familier – tjek, om det er bevidst.">
          <Fund :rækker="dobbeltrolle.map(i => ({ tekst: `${i.a.navn} og ${i.b.navn}: ${i.roller.join(', ')}`, relationer: i.a.id }))" />
        </TjekKort>
        <TjekKort titel="Manglende modpart (forælder/barn)" :antal="manglendeInvers.length" ok="Alle forælder/barn-relationer har en modpart" hjælp="Typisk relationer, hvor barnets køn manglede, da de blev oprettet. Slet og opret dem igen, når køn er udfyldt.">
          <Fund :rækker="manglendeInvers.map(i => ({ tekst: `${i.fra.navn} → ${i.type_} → ${i.til.navn}`, relationer: i.fra.id }))" />
        </TjekKort>
        <TjekKort titel="Usædvanlig forælderalder ved fødsel" :antal="forælderalder.length" ok="Ingen usædvanlige forælderaldre" hjælp="Advarer ved far over 70 eller mor over 50 ved fødslen.">
          <Fund :rækker="forælderalder.map(i => ({ tekst: `${i.forælder.navn} var ${i.alder} år, da ${i.barn.navn} blev født`, links: [['Forælder', i.forælder.id]] }))" />
        </TjekKort>
        <TjekKort titel="Overlappende ægteskaber" :antal="overlappende.length" alvorlig ok="Ingen overlappende ægteskaber">
          <Fund :rækker="overlappende.map(i => ({ tekst: `${i.person.navn} har to overlappende ${i.a.type_}/${i.b.type_}-perioder`, relationer: i.person.id }))" />
        </TjekKort>
        <TjekKort :titel="`Usædvanligt mange børn (over ${MANGE_BØRN})`" :antal="mangeBørn.length" ok="Ingen usædvanligt store børneflokke">
          <Fund :rækker="mangeBørn.map(x => ({ tekst: `${x.person.navn} har ${x.antal} registrerede børn`, relationer: x.person.id }))" />
        </TjekKort>

        <h2 class="section-title !mt-6">📊 Statistik</h2>
        <div class="panel !p-4 space-y-5">
          <div>
            <h3 class="label">Kønsfordeling</h3>
            <BarList :rows="Object.entries(stats.køn).map(([label, value]) => ({ label, value }))" :format="n => String(n)" />
          </div>
          <div>
            <h3 class="label">Hyppigste relationstyper</h3>
            <BarList :rows="stats.topTyper.map(([label, value]) => ({ label, value }))" :format="n => String(n)" />
          </div>
          <div>
            <h3 class="label">Flest relationer</h3>
            <BarList :rows="stats.flestRelationer" :format="n => String(n)" />
          </div>
        </div>
      </section>
    </div>
  </KinPage>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref, type PropType } from 'vue'
import { RouterLink } from 'vue-router'
import BarList from '../../../components/BarList.vue'
import KinPage from '../components/KinPage.vue'
import TjekKort from '../components/TjekKort.vue'
import { kinApi, type Person, type Relation } from '../api'
import { useKinStore } from '../store'
import { barnTyper, forælderTyper, søskendeTyper } from '../relationTypes'

const AUTO = 'Auto-oprettet modpart'
const MANGE_BØRN = 12
const store = useKinStore()
const søgning = ref('')

/** Fund, der handler om en person, vises kun, hvis navnet matcher søgningen. */
const match = (...ps: Person[]) => {
  const q = søgning.value.trim().toLowerCase()
  return !q || ps.some(p => p.navn.toLowerCase().includes(q))
}
const persons = computed(() => store.persons.filter(p => match(p)))
const byId = computed(() => new Map(store.persons.map(p => [p.id, p])))
const primære = computed(() => store.relations.filter(r => r.noter !== AUTO))
const relFor = (id: string) => store.relations.filter(r => r.person1_id === id || r.person2_id === id)
const år = (d: string | null) => {
  const n = d ? parseInt(d.slice(0, 4)) : NaN
  return isNaN(n) ? null : n
}

// Kun biologiske børn – alderstjekket giver ikke mening for sted- og plejebørn
const BIOLOGISK_BARN = new Set(['søn', 'datter'])
const forældreTil = (barnId: string) => store.relations
  .filter(r => (r.person2_id === barnId && forælderTyper.has(r.type_)) || (r.person1_id === barnId && BIOLOGISK_BARN.has(r.type_)))
  .map(r => (forælderTyper.has(r.type_) ? r.person1_id : r.person2_id))

// ── Manglende information ──
const manglerKøn = computed(() => persons.value.filter(p => !p.køn))
const manglerFødsel = computed(() => persons.value.filter(p => !p.fødselsdato))
const ingenRelationer = computed(() => persons.value.filter(p => !relFor(p.id).length))
const kunAuto = computed(() => persons.value.filter(p => {
  const rs = relFor(p.id)
  return rs.length > 0 && rs.every(r => r.noter === AUTO)
}))

// ── Mistænkelige mønstre ──
const aldersinkonsistens = computed(() => {
  const ud: { barn: Person; forælder: Person; årsag: string }[] = []
  for (const p of store.persons) {
    const bf = år(p.fødselsdato)
    if (!bf) continue
    for (const fid of new Set(forældreTil(p.id))) {
      const f = byId.value.get(fid)
      if (!f || !match(p, f)) continue
      const ff = år(f.fødselsdato), fd = år(f.dødsdato)
      if (fd && bf > fd + 1) ud.push({ barn: p, forælder: f, årsag: `${p.navn} er født ${bf}, men ${f.navn} døde ${fd}` })
      if (ff && bf < ff + 12) ud.push({ barn: p, forælder: f, årsag: `${p.navn} (f. ${bf}) er kun ${bf - ff} år yngre end ${f.navn} (f. ${ff})` })
    }
  }
  return ud
})

const dødFørFødt = computed(() => persons.value.filter(p => {
  const f = år(p.fødselsdato), d = år(p.dødsdato)
  return f !== null && d !== null && d < f
}))

const cirkulære = computed(() => {
  const ud: { a: Person; b: Person }[] = []
  const set = new Set<string>()
  for (const r of store.relations) {
    if (!forælderTyper.has(r.type_)) continue
    if (!store.relations.some(r2 => forælderTyper.has(r2.type_) && r2.person1_id === r.person2_id && r2.person2_id === r.person1_id)) continue
    const key = [r.person1_id, r.person2_id].sort().join('|')
    const a = byId.value.get(r.person1_id), b = byId.value.get(r.person2_id)
    if (!set.has(key) && a && b && match(a, b)) {
      set.add(key)
      ud.push({ a, b })
    }
  }
  return ud
})

const dobbeltrolle = computed(() => {
  const forælderBarn = new Set([...forælderTyper, ...barnTyper])
  const ud: { a: Person; b: Person; roller: string[] }[] = []
  const set = new Set<string>()
  for (const p of store.persons) {
    const mine = relFor(p.id)
    const anden = (r: Relation) => (r.person1_id === p.id ? r.person2_id : r.person1_id)
    const søskende = new Set(mine.filter(r => søskendeTyper.has(r.type_)).map(anden))
    const fb = new Set(mine.filter(r => forælderBarn.has(r.type_)).map(anden))
    for (const id of søskende) {
      const key = [p.id, id].sort().join('|')
      const o = byId.value.get(id)
      if (!fb.has(id) || set.has(key) || !o || !match(p, o)) continue
      set.add(key)
      ud.push({ a: p, b: o, roller: mine.filter(r => r.person1_id === id || r.person2_id === id).map(r => r.type_) })
    }
  }
  return ud
})

const manglendeInvers = computed(() => {
  const ud: { fra: Person; til: Person; type_: string }[] = []
  for (const r of primære.value) {
    const erForælder = forælderTyper.has(r.type_)
    if (!erForælder && !barnTyper.has(r.type_)) continue
    const modGruppe = erForælder ? barnTyper : forælderTyper
    if (store.relations.some(r2 => r2.person1_id === r.person2_id && r2.person2_id === r.person1_id && modGruppe.has(r2.type_))) continue
    const fra = byId.value.get(r.person1_id), til = byId.value.get(r.person2_id)
    if (fra && til && match(fra, til)) ud.push({ fra, til, type_: r.type_ })
  }
  return ud
})

// Kun far/mor – adoptiv-, pleje- og stedforældre har ingen biologisk aldersgrænse
const forælderalder = computed(() => {
  const ud: { barn: Person; forælder: Person; alder: number }[] = []
  for (const r of store.relations) {
    if (r.type_ !== 'far' && r.type_ !== 'mor') continue
    const f = byId.value.get(r.person1_id), b = byId.value.get(r.person2_id)
    const ff = år(f?.fødselsdato ?? null), bf = år(b?.fødselsdato ?? null)
    if (!f || !b || ff === null || bf === null || !match(f, b)) continue
    if (bf - ff > (r.type_ === 'far' ? 70 : 50)) ud.push({ barn: b, forælder: f, alder: bf - ff })
  }
  return ud
})

// Kun primære relationer – ellers overlapper hvert ægteskab med sin egen modpart
const overlappende = computed(() => {
  const ud: { person: Person; a: Relation; b: Relation }[] = []
  for (const p of persons.value) {
    const mine = store.relations.filter(r => ['gift', 'partner'].includes(r.type_) && (r.person1_id === p.id || r.person2_id === p.id) && r.start_dato && r.noter !== AUTO)
    for (let i = 0; i < mine.length; i++)
      for (let j = i + 1; j < mine.length; j++) {
        const a = mine[i], b = mine[j]
        if (a.start_dato! < (b.slut_dato ?? '9999') && b.start_dato! < (a.slut_dato ?? '9999')) ud.push({ person: p, a, b })
      }
  }
  return ud
})

const børnAf = (id: string) => {
  const set = new Set<string>()
  for (const r of store.relations) {
    if (r.person1_id === id && forælderTyper.has(r.type_)) set.add(r.person2_id)
    else if (r.person2_id === id && barnTyper.has(r.type_)) set.add(r.person1_id)
  }
  return set.size
}
const mangeBørn = computed(() => persons.value.map(p => ({ person: p, antal: børnAf(p.id) })).filter(x => x.antal > MANGE_BØRN))

const total = computed(() => [manglerKøn, ingenRelationer, kunAuto, aldersinkonsistens, dødFørFødt, cirkulære, dobbeltrolle, manglendeInvers, forælderalder, overlappende, mangeBørn]
  .reduce((s, c) => s + c.value.length, 0))

// ── Statistik ──
const stats = computed(() => {
  const køn: Record<string, number> = {}
  for (const p of store.persons) køn[p.køn ?? 'ukendt'] = (køn[p.køn ?? 'ukendt'] ?? 0) + 1
  const typer: Record<string, number> = {}
  for (const r of primære.value) typer[r.type_] = (typer[r.type_] ?? 0) + 1
  return {
    køn,
    topTyper: Object.entries(typer).sort((a, b) => b[1] - a[1]).slice(0, 8),
    flestRelationer: store.persons.map(p => ({ label: p.navn, value: relFor(p.id).length })).sort((a, b) => b.value - a.value).slice(0, 10),
  }
})

// ── Fletning af dubletter ──
const dubletGrupper = computed(() => {
  const map = new Map<string, Person[]>()
  for (const p of store.persons) {
    const key = p.navn.trim().toLowerCase()
    if (key) (map.get(key) ?? map.set(key, []).get(key)!).push(p)
  }
  return [...map.values()].filter(g => g.length > 1 && match(g[0]))
})
const fletter = ref<string | null>(null)
async function flet(gruppe: Person[], keepId: string) {
  if (!confirm(`Flet ${gruppe.length - 1} person(er) ind i "${gruppe.find(p => p.id === keepId)?.navn}"? Det kan ikke fortrydes.`)) return
  fletter.value = keepId
  try {
    for (const p of gruppe) if (p.id !== keepId) await kinApi.merge(keepId, p.id)
    await store.loadAll()
  } catch (e) {
    alert(`Fejl ved fletning: ${(e as Error).message}`)
  } finally {
    fletter.value = null
  }
}

// ── Små visningskomponenter ──
const chip = 'inline-block text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 hover:bg-accent-soft hover:text-accent'
const PersonChips = defineComponent({
  props: { personer: { type: Array as PropType<Person[]>, required: true }, relationer: Boolean },
  setup: props => () => h('div', { class: 'flex flex-wrap gap-1' }, props.personer.map(p =>
    h(RouterLink, { key: p.id, class: chip, to: props.relationer ? { path: '/kinmate/relationer', query: { person: p.id } } : `/kinmate/personer/${p.id}` }, () => p.navn))),
})
const Fund = defineComponent({
  props: { rækker: { type: Array as PropType<{ tekst: string; links?: [string, string][]; relationer?: string }[]>, required: true } },
  setup: props => () => h('ul', { class: 'space-y-1.5' }, props.rækker.map((r, i) =>
    h('li', { key: i, class: 'flex flex-wrap items-center gap-2 text-xs' }, [
      h('span', { class: 'flex-1 text-stone-700' }, r.tekst),
      ...(r.links ?? []).map(([label, id]) => h(RouterLink, { class: chip, to: `/kinmate/personer/${id}` }, () => label)),
      r.relationer ? h(RouterLink, { class: chip, to: { path: '/kinmate/relationer', query: { person: r.relationer } } }, () => 'Relationer') : null,
    ]))),
})
</script>
