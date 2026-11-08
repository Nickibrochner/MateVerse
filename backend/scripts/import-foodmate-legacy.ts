// Importerer data fra den gamle Tauri-udgave af FoodMate (ingredient/recipe/recipe_ingredient)
// ind i den nye foodmate_*-model. Kør med en kopi af kilde-db'en først for at verificere.
//
// Brug: bun run scripts/import-foodmate-legacy.ts <sti-til-gammel-foodmate.db> [--db=<sti-til-maalet>]
import { Database } from 'bun:sqlite'
import { createIngredient, createRecipe, upsertRecipeIngredient } from '../src/mates/foodmate/queries'
import { db } from '../src/db'

const kildeSti = process.argv[2]
if (!kildeSti) {
  console.error('Brug: bun run scripts/import-foodmate-legacy.ts <sti-til-gammel-foodmate.db>')
  process.exit(1)
}

const kilde = new Database(kildeSti, { readonly: true })

interface LegacyIngredient {
  id: string
  navn: string
  energi: number | null
  protein: number | null
  kulhydrat: number | null
  fedt: number | null
  kostfibre: number | null
  sukkerarter: number | null
  maettede_fedtsyrer: number | null
  salt: number | null
}
interface LegacyRecipe { id: string; navn: string }
interface LegacyRecipeIngredient { recipe_id: string; ingredient_id: string; maengde: number }

const legacyIngredients = kilde.query('SELECT * FROM ingredient').all() as LegacyIngredient[]
const legacyRecipes = kilde.query('SELECT * FROM recipe').all() as LegacyRecipe[]
const legacyLinks = kilde.query('SELECT * FROM recipe_ingredient').all() as LegacyRecipeIngredient[]

console.log(`Kilde: ${legacyIngredients.length} ingredienser, ${legacyRecipes.length} opskrifter, ${legacyLinks.length} linjer`)

const ingredientIdMap = new Map<string, number>()
const recipeIdMap = new Map<string, number>()

db.transaction(() => {
  for (const i of legacyIngredients) {
    const ny = createIngredient({
      navn: i.navn,
      energi_kcal: i.energi,
      protein: i.protein,
      kulhydrat: i.kulhydrat,
      fedt: i.fedt,
      kostfibre: i.kostfibre,
      sukkerarter: i.sukkerarter,
      maettet_fedt: i.maettede_fedtsyrer,
      salt: i.salt,
    })
    ingredientIdMap.set(i.id, ny.id)
    console.log(`  ingrediens: ${i.navn} -> #${ny.id}`)
  }

  for (const r of legacyRecipes) {
    const ny = createRecipe({ titel: r.navn, portioner: 4 })
    recipeIdMap.set(r.id, ny.id)
    console.log(`  opskrift: ${r.navn} -> #${ny.id}`)
  }

  for (const link of legacyLinks) {
    const nyRecipeId = recipeIdMap.get(link.recipe_id)
    const nyIngredientId = ingredientIdMap.get(link.ingredient_id)
    if (!nyRecipeId || !nyIngredientId) {
      console.warn(`  ADVARSEL: sprang linje over (manglende reference): ${JSON.stringify(link)}`)
      continue
    }
    upsertRecipeIngredient(nyRecipeId, nyIngredientId, link.maengde)
  }
})()

console.log('Færdig.')
console.log(`Importeret: ${ingredientIdMap.size} ingredienser, ${recipeIdMap.size} opskrifter, ${legacyLinks.length} ingredienslinjer`)
