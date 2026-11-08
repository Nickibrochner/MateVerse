import { db } from '../../db'
import { type Nutrients, NUTRIENT_FELTER, prPortion, summerNaering } from './nutrition'

/**
 * Al forretningslogik for FoodMate: ingredienser, opskrifter (med trin og næringsberegning) og
 * papirkurv (soft delete). routes.ts er en tynd HTTP-wrapper omkring denne fil.
 */

export interface Ingredient extends Nutrients {
  id: number
  navn: string
  slettet: number
  created_at: string
}

export interface IngredientInput {
  navn: string
  energi_kcal?: number | null
  protein?: number | null
  kulhydrat?: number | null
  fedt?: number | null
  kostfibre?: number | null
  sukkerarter?: number | null
  maettet_fedt?: number | null
  salt?: number | null
}

const nutrientCols = NUTRIENT_FELTER.join(', ')
const nutrientPlaceholders = NUTRIENT_FELTER.map(() => '?').join(', ')
const nutrientSet = NUTRIENT_FELTER.map(f => `${f} = ?`).join(', ')
const nutrientValues = (i: IngredientInput) => NUTRIENT_FELTER.map(f => i[f] ?? null)

// ── Ingredienser ─────────────────────────────────────────────────────────────

export function listIngredients(search?: string, includeDeleted = false): Ingredient[] {
  const clauses: string[] = []
  const params: string[] = []
  if (!includeDeleted) clauses.push('slettet = 0')
  if (search) {
    clauses.push('lower(navn) LIKE ?')
    params.push(`%${search.toLowerCase()}%`)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return db.query(`SELECT * FROM foodmate_ingredient ${where} ORDER BY navn ASC`).all(...params) as Ingredient[]
}

export function getIngredient(id: number): Ingredient | null {
  return db.query('SELECT * FROM foodmate_ingredient WHERE id = ?').get(id) as Ingredient | null
}

export function createIngredient(input: IngredientInput): Ingredient {
  const navn = input.navn.trim()
  if (!navn) throw new Error('Navn mangler')
  const findes = db.query('SELECT 1 FROM foodmate_ingredient WHERE navn = ?').get(navn)
  if (findes) throw new Error('Ingrediensen findes allerede')
  return db
    .query(`INSERT INTO foodmate_ingredient (navn, ${nutrientCols}) VALUES (?, ${nutrientPlaceholders}) RETURNING *`)
    .get(navn, ...nutrientValues(input)) as Ingredient
}

export function updateIngredient(id: number, input: IngredientInput): Ingredient | null {
  db.query(`UPDATE foodmate_ingredient SET navn = ?, ${nutrientSet} WHERE id = ?`).run(
    input.navn.trim(), ...nutrientValues(input), id,
  )
  return getIngredient(id)
}

export function softDeleteIngredient(id: number): void {
  db.query('UPDATE foodmate_ingredient SET slettet = 1 WHERE id = ?').run(id)
}

export function restoreIngredient(id: number): void {
  db.query('UPDATE foodmate_ingredient SET slettet = 0 WHERE id = ?').run(id)
}

function ingredientInUseCount(id: number): number {
  return (db.query('SELECT count(*) AS n FROM foodmate_recipe_ingredient WHERE ingredient_id = ?').get(id) as { n: number }).n
}

export function permanentlyDeleteIngredient(id: number): void {
  if (ingredientInUseCount(id) > 0) throw new Error('Ingrediensen bruges stadig i en eller flere opskrifter')
  db.query('DELETE FROM foodmate_ingredient WHERE id = ?').run(id)
}

// ── Opskrifter ───────────────────────────────────────────────────────────────

export interface Recipe {
  id: number
  titel: string
  beskrivelse: string | null
  tilberedningstid: number | null
  portioner: number
  tags: string | null
  slettet: number
  created_at: string
}

export interface RecipeInput {
  titel: string
  beskrivelse?: string | null
  tilberedningstid?: number | null
  portioner: number
  tags?: string | null
}

export interface RecipeSummary extends Recipe {
  naering_total: Nutrients
  naering_pr_portion: Nutrients
}

function totalsForRecipes(recipeIds: number[]): Map<number, Nutrients> {
  if (!recipeIds.length) return new Map()
  const rows = db.query(
    `SELECT ri.recipe_id, ri.maengde, i.${NUTRIENT_FELTER.join(', i.')}
     FROM foodmate_recipe_ingredient ri JOIN foodmate_ingredient i ON i.id = ri.ingredient_id
     WHERE ri.recipe_id IN (${recipeIds.map(() => '?').join(',')})`,
  ).all(...recipeIds) as ({ recipe_id: number; maengde: number } & Nutrients)[]

  const byRecipe = new Map<number, { ingrediens: Nutrients; gram: number }[]>()
  for (const r of rows) {
    const { recipe_id, maengde, ...naering } = r
    byRecipe.set(recipe_id, [...(byRecipe.get(recipe_id) ?? []), { ingrediens: naering as Nutrients, gram: maengde }])
  }
  const totals = new Map<number, Nutrients>()
  for (const id of recipeIds) totals.set(id, summerNaering(byRecipe.get(id) ?? []))
  return totals
}

export function listRecipes(search?: string, tag?: string, includeDeleted = false): RecipeSummary[] {
  const clauses: string[] = []
  const params: string[] = []
  if (!includeDeleted) clauses.push('slettet = 0')
  if (search) {
    clauses.push('lower(titel) LIKE ?')
    params.push(`%${search.toLowerCase()}%`)
  }
  if (tag) {
    clauses.push('lower(tags) LIKE ?')
    params.push(`%${tag.toLowerCase()}%`)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const recipes = db.query(`SELECT * FROM foodmate_recipe ${where} ORDER BY titel ASC`).all(...params) as Recipe[]
  const totals = totalsForRecipes(recipes.map(r => r.id))
  return recipes.map(r => ({ ...r, naering_total: totals.get(r.id)!, naering_pr_portion: prPortion(totals.get(r.id)!, r.portioner) }))
}

export function listAllTags(): string[] {
  const rows = db.query('SELECT tags FROM foodmate_recipe WHERE slettet = 0 AND tags IS NOT NULL').all() as { tags: string }[]
  const tags = new Set<string>()
  for (const r of rows) for (const t of r.tags.split(',').map(x => x.trim()).filter(Boolean)) tags.add(t)
  return [...tags].sort()
}

export interface RecipeIngredientLine {
  ingredient_id: number
  navn: string
  maengde: number
  naering: Nutrients
}

export interface RecipeStep {
  id: number
  position: number
  tekst: string
}

export interface RecipeDetail extends Recipe {
  ingredienser: RecipeIngredientLine[]
  trin: RecipeStep[]
  naering_total: Nutrients
  naering_pr_portion: Nutrients
}

export function getRecipe(id: number): Recipe | null {
  return db.query('SELECT * FROM foodmate_recipe WHERE id = ?').get(id) as Recipe | null
}

export function getRecipeDetail(id: number): RecipeDetail | null {
  const recipe = getRecipe(id)
  if (!recipe) return null

  const rows = db.query(
    `SELECT ri.ingredient_id, i.navn, ri.maengde, i.${NUTRIENT_FELTER.join(', i.')}
     FROM foodmate_recipe_ingredient ri JOIN foodmate_ingredient i ON i.id = ri.ingredient_id
     WHERE ri.recipe_id = ? ORDER BY i.navn ASC`,
  ).all(id) as ({ ingredient_id: number; navn: string; maengde: number } & Nutrients)[]

  const ingredienser: RecipeIngredientLine[] = rows.map(r => {
    const { ingredient_id, navn, maengde, ...naering } = r
    return { ingredient_id, navn, maengde, naering: naering as Nutrients }
  })
  const naering_total = summerNaering(ingredienser.map(l => ({ ingrediens: l.naering, gram: l.maengde })))

  const trin = db.query('SELECT id, position, tekst FROM foodmate_recipe_step WHERE recipe_id = ? ORDER BY position ASC').all(
    id,
  ) as RecipeStep[]

  return { ...recipe, ingredienser, trin, naering_total, naering_pr_portion: prPortion(naering_total, recipe.portioner) }
}

export function createRecipe(input: RecipeInput): Recipe {
  const titel = input.titel.trim()
  if (!titel) throw new Error('Titel mangler')
  if (input.portioner < 1) throw new Error('Portioner skal være mindst 1')
  return db
    .query('INSERT INTO foodmate_recipe (titel, beskrivelse, tilberedningstid, portioner, tags) VALUES (?, ?, ?, ?, ?) RETURNING *')
    .get(titel, input.beskrivelse || null, input.tilberedningstid || null, input.portioner, input.tags || null) as Recipe
}

export function updateRecipe(id: number, input: RecipeInput): Recipe | null {
  if (input.portioner < 1) throw new Error('Portioner skal være mindst 1')
  db.query('UPDATE foodmate_recipe SET titel = ?, beskrivelse = ?, tilberedningstid = ?, portioner = ?, tags = ? WHERE id = ?').run(
    input.titel.trim(), input.beskrivelse || null, input.tilberedningstid || null, input.portioner, input.tags || null, id,
  )
  return getRecipe(id)
}

export function softDeleteRecipe(id: number): void {
  db.query('UPDATE foodmate_recipe SET slettet = 1 WHERE id = ?').run(id)
}

export function restoreRecipe(id: number): void {
  db.query('UPDATE foodmate_recipe SET slettet = 0 WHERE id = ?').run(id)
}

export function permanentlyDeleteRecipe(id: number): void {
  db.query('DELETE FROM foodmate_recipe WHERE id = ?').run(id)
}

export function upsertRecipeIngredient(recipeId: number, ingredientId: number, maengde: number): void {
  if (maengde <= 0) throw new Error('Mængde skal være større end 0')
  if (!getRecipe(recipeId)) throw new Error('Opskriften findes ikke')
  if (!getIngredient(ingredientId)) throw new Error('Ingrediensen findes ikke')
  db.query(
    `INSERT INTO foodmate_recipe_ingredient (recipe_id, ingredient_id, maengde) VALUES (?, ?, ?)
     ON CONFLICT(recipe_id, ingredient_id) DO UPDATE SET maengde = excluded.maengde`,
  ).run(recipeId, ingredientId, maengde)
}

export function deleteRecipeIngredient(recipeId: number, ingredientId: number): void {
  db.query('DELETE FROM foodmate_recipe_ingredient WHERE recipe_id = ? AND ingredient_id = ?').run(recipeId, ingredientId)
}

export function replaceRecipeSteps(recipeId: number, steps: string[]): void {
  if (!getRecipe(recipeId)) throw new Error('Opskriften findes ikke')
  db.query('DELETE FROM foodmate_recipe_step WHERE recipe_id = ?').run(recipeId)
  steps.forEach((tekst, i) => {
    const t = tekst.trim()
    if (t) db.query('INSERT INTO foodmate_recipe_step (recipe_id, position, tekst) VALUES (?, ?, ?)').run(recipeId, i, t)
  })
}

// ── Papirkurv ────────────────────────────────────────────────────────────────

export interface TrashItem {
  type: 'ingredient' | 'recipe'
  id: number
  navn: string
}

export function listTrash(): TrashItem[] {
  const ingredienser = db.query('SELECT id, navn FROM foodmate_ingredient WHERE slettet = 1 ORDER BY navn').all() as {
    id: number; navn: string
  }[]
  const opskrifter = db.query('SELECT id, titel AS navn FROM foodmate_recipe WHERE slettet = 1 ORDER BY titel').all() as {
    id: number; navn: string
  }[]
  return [
    ...ingredienser.map(i => ({ type: 'ingredient' as const, ...i })),
    ...opskrifter.map(r => ({ type: 'recipe' as const, ...r })),
  ]
}

export function restoreTrashItem(type: 'ingredient' | 'recipe', id: number): void {
  if (type === 'ingredient') restoreIngredient(id)
  else restoreRecipe(id)
}

export function permanentlyDeleteTrashItem(type: 'ingredient' | 'recipe', id: number): void {
  if (type === 'ingredient') permanentlyDeleteIngredient(id)
  else permanentlyDeleteRecipe(id)
}

export function emptyTrash(): { slettet: number; fejlede: number } {
  let slettet = 0
  let fejlede = 0
  for (const item of listTrash()) {
    try {
      permanentlyDeleteTrashItem(item.type, item.id)
      slettet++
    } catch {
      fejlede++
    }
  }
  return { slettet, fejlede }
}
