// Fælles relations-taksonomi for Kinmate. Importeres af alle views i stedet for at
// duplikere ordlisten. Backenden (backend/src/mates/kinmate/relations.ts) har sin egen
// kopi af typerne – hold dem i sync, hvis der tilføjes eller ændres typer.

export interface RelationGruppe {
  label: string
  typer: string[]
}

export const relationGrupper: RelationGruppe[] = [
  { label: 'Forældre',          typer: ['far', 'mor', 'adoptivfar', 'adoptivmor', 'plejefar', 'plejemor', 'stedfar', 'stedmor'] },
  { label: 'Barn',              typer: ['søn', 'datter', 'plejesøn', 'plejedatter', 'stedsøn', 'steddatter'] },
  { label: 'Partner',           typer: ['gift', 'partner', 'skilt', 'enkemand', 'enke'] },
  { label: 'Søskende',          typer: ['bror', 'søster', 'halvbror', 'halvsøster', 'stedbror', 'stedsøster', 'plejebror', 'plejesøster'] },
  { label: 'Svigerforældre',    typer: ['svigerfar', 'svigermor'] },
  { label: 'Svigerbarn',        typer: ['svigersøn', 'svigerdatter'] },
  { label: 'Svoger/svigerinde', typer: ['svoger', 'svigerinde'] },
  { label: 'Onkel/tante',       typer: ['onkel', 'tante', 'farbror', 'morbror', 'faster', 'moster'] },
  { label: 'Nevø/niece',        typer: ['nevø', 'niece'] },
  { label: 'Bedsteforældre',    typer: ['farfar', 'farmor', 'morfar', 'mormor'] },
  { label: 'Barnebarn',         typer: ['barnebarn'] },
  { label: 'Andet',             typer: ['andet'] },
]

export const præposition: Record<string, string> = {
  far: 'til', mor: 'til', adoptivfar: 'til', adoptivmor: 'til',
  plejefar: 'til', plejemor: 'til', stedfar: 'til', stedmor: 'til',
  søn: 'af', datter: 'af', plejesøn: 'af', plejedatter: 'af', stedsøn: 'af', steddatter: 'af',
  gift: 'med', partner: 'med', skilt: 'fra', enkemand: 'efter', enke: 'efter',
  bror: 'til', søster: 'til', halvbror: 'til', halvsøster: 'til',
  stedbror: 'til', stedsøster: 'til', plejebror: 'til', plejesøster: 'til',
  svigerfar: 'til', svigermor: 'til', svigersøn: 'til', svigerdatter: 'til',
  svoger: 'til', svigerinde: 'til',
  onkel: 'til', tante: 'til', farbror: 'til', morbror: 'til', faster: 'til', moster: 'til',
  nevø: 'til', niece: 'til',
  farfar: 'til', farmor: 'til', morfar: 'til', mormor: 'til', barnebarn: 'af', andet: 'til',
}

export function prep(t: string): string {
  return præposition[t] ?? 'til'
}

export function gruppeFor(t: string): string {
  return relationGrupper.find(g => g.typer.includes(t))?.label ?? t
}

export const forælderTyper = new Set([
  'far', 'mor', 'adoptivfar', 'adoptivmor', 'plejefar', 'plejemor', 'stedfar', 'stedmor',
])
export const barnTyper = new Set([
  'søn', 'datter', 'plejesøn', 'plejedatter', 'stedsøn', 'steddatter',
])
export const partnerTyper = new Set([
  'gift', 'partner', 'skilt', 'enkemand', 'enke',
])
export const søskendeTyper = new Set([
  'bror', 'søster', 'halvbror', 'halvsøster',
  'stedbror', 'stedsøster', 'plejebror', 'plejesøster',
])
export const reneSøskendeTyper = new Set(['bror', 'søster'])
