// Delte opslag over relations-grafen – bruges af stamtræ, anecirkel og datakvalitet.

import {
  forælderTyper as forælder_typer,
  barnTyper as barn_typer,
  partnerTyper as partner_typer,
  søskendeTyper as søskende_typer,
  reneSøskendeTyper as rene_søskende_typer,
} from './relationTypes'

export interface RelationLike {
  person1_id: string
  person2_id: string
  type_: string
}

export interface PersonLike {
  id: string
  fødselsdato: string | null
  dødsdato: string | null
}

export function findForældreIdsAf(relations: RelationLike[], barnId: string): string[] {
  const set = new Set<string>()
  for (const r of relations) {
    if (r.person2_id === barnId && forælder_typer.has(r.type_)) set.add(r.person1_id)
    else if (r.person1_id === barnId && barn_typer.has(r.type_)) set.add(r.person2_id)
  }
  return [...set]
}

export function findBørnIdsAf(relations: RelationLike[], forælderId: string): string[] {
  const set = new Set<string>()
  for (const r of relations) {
    if (r.person1_id === forælderId && forælder_typer.has(r.type_)) set.add(r.person2_id)
    else if (r.person2_id === forælderId && barn_typer.has(r.type_)) set.add(r.person1_id)
  }
  return [...set]
}

export function findPartnereIdsAf(relations: RelationLike[], personId: string): string[] {
  const set = new Set<string>()
  for (const r of relations) {
    if (!partner_typer.has(r.type_)) continue
    if (r.person1_id === personId) set.add(r.person2_id)
    else if (r.person2_id === personId) set.add(r.person1_id)
  }
  set.delete(personId)
  return [...set]
}

export function findSøskendeIdsAf(relations: RelationLike[], personId: string): string[] {
  const set = new Set<string>()
  for (const r of relations) {
    if (!søskende_typer.has(r.type_)) continue
    if (r.person1_id === personId) set.add(r.person2_id)
    else if (r.person2_id === personId) set.add(r.person1_id)
  }
  set.delete(personId)
  return [...set]
}

export function findReneSøskendeIdsAf(relations: RelationLike[], personId: string): string[] {
  const set = new Set<string>()
  for (const r of relations) {
    if (!rene_søskende_typer.has(r.type_)) continue
    if (r.person1_id === personId) set.add(r.person2_id)
    else if (r.person2_id === personId) set.add(r.person1_id)
  }
  set.delete(personId)
  return [...set]
}

