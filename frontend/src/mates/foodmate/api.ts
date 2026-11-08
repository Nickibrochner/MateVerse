import { json, request } from '../../api'

export interface Nutrients {
  energi_kcal: number | null
  protein: number | null
  kulhydrat: number | null
  fedt: number | null
  kostfibre: number | null
  sukkerarter: number | null
  maettet_fedt: number | null
  salt: number | null
}

export const NUTRIENT_LABELS: Record<keyof Nutrients, string> = {
  energi_kcal: 'Energi (kcal)',
  protein: 'Protein (g)',
  kulhydrat: 'Kulhydrat (g)',
  fedt: 'Fedt (g)',
  kostfibre: 'Kostfibre (g)',
  sukkerarter: 'heraf sukkerarter (g)',
  maettet_fedt: 'heraf mættet fedt (g)',
  salt: 'Salt (g)',
}

export interface Ingredient extends Nutrients {
  id: number
  navn: string
  slettet: number
  created_at: string
}

export interface IngredientInput extends Partial<Nutrients> {
  navn: string
}

export interface OffTraeffer {
  navn: string
  naering: Nutrients
}

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

export interface RecipeSummary extends Recipe {
  naering_total: Nutrients
  naering_pr_portion: Nutrients
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

export interface RecipeInput {
  titel: string
  beskrivelse?: string | null
  tilberedningstid?: number | null
  portioner: number
  tags?: string | null
}

export interface TrashItem {
  type: 'ingredient' | 'recipe'
  id: number
  navn: string
}

const qs = (params: Record<string, string | undefined>) => {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v)
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export const foodmateApi = {
  ingredients: (search?: string, includeDeleted = false) =>
    request<Ingredient[]>(`/foodmate/ingredients${qs({ search, include_deleted: includeDeleted ? 'true' : undefined })}`),
  searchOpenFoodFacts: (q: string) => request<OffTraeffer[]>(`/foodmate/ingredients/search-off?q=${encodeURIComponent(q)}`),
  createIngredient: (input: IngredientInput) => request<Ingredient>('/foodmate/ingredients', json('POST', input)),
  updateIngredient: (id: number, input: IngredientInput) => request<Ingredient>(`/foodmate/ingredients/${id}`, json('PUT', input)),
  deleteIngredient: (id: number) => request(`/foodmate/ingredients/${id}`, { method: 'DELETE' }),

  recipes: (search?: string, tag?: string) => request<RecipeSummary[]>(`/foodmate/recipes${qs({ search, tag })}`),
  tags: () => request<string[]>('/foodmate/tags'),
  recipe: (id: number) => request<RecipeDetail>(`/foodmate/recipes/${id}`),
  createRecipe: (input: RecipeInput) => request<Recipe>('/foodmate/recipes', json('POST', input)),
  updateRecipe: (id: number, input: RecipeInput) => request<Recipe>(`/foodmate/recipes/${id}`, json('PUT', input)),
  deleteRecipe: (id: number) => request(`/foodmate/recipes/${id}`, { method: 'DELETE' }),
  setRecipeIngredient: (recipeId: number, ingredientId: number, maengde: number) =>
    request<RecipeDetail>(`/foodmate/recipes/${recipeId}/ingredients/${ingredientId}`, json('PUT', { maengde })),
  removeRecipeIngredient: (recipeId: number, ingredientId: number) =>
    request<RecipeDetail>(`/foodmate/recipes/${recipeId}/ingredients/${ingredientId}`, { method: 'DELETE' }),
  setRecipeSteps: (recipeId: number, steps: string[]) =>
    request<RecipeDetail>(`/foodmate/recipes/${recipeId}/steps`, json('PUT', { steps })),

  trash: () => request<TrashItem[]>('/foodmate/trash'),
  restoreTrash: (type: 'ingredient' | 'recipe', id: number) => request(`/foodmate/trash/${type}/${id}/restore`, json('POST', {})),
  deleteTrashPermanently: (type: 'ingredient' | 'recipe', id: number) => request(`/foodmate/trash/${type}/${id}`, { method: 'DELETE' }),
  emptyTrash: () => request<{ slettet: number; fejlede: number }>('/foodmate/trash/empty', json('POST', {})),
}
