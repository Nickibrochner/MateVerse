import { Elysia, t } from 'elysia'
import { HttpError, httpErrors } from '../../lib/http'
import { soegOpenFoodFacts } from './openfoodfacts'
import {
  createIngredient, createRecipe, deleteRecipeIngredient, emptyTrash, getIngredient, getRecipeDetail,
  listAllTags, listIngredients, listRecipes, listTrash, permanentlyDeleteTrashItem, replaceRecipeSteps,
  restoreTrashItem, softDeleteIngredient, softDeleteRecipe, updateIngredient, updateRecipe, upsertRecipeIngredient,
} from './queries'

/**
 * FoodMate — opskrifter med ingredienser, trin og næringsberegning pr. portion. Port af
 * Tauri-udgaven (kun den fulde "Opskrift"-model, se db.ts-kommentaren for hvorfor). Al
 * forretningslogik ligger i queries.ts/nutrition.ts — denne fil er kun HTTP-wrapping.
 */

const nutrientBody = {
  energi_kcal: t.Optional(t.Nullable(t.Number())),
  protein: t.Optional(t.Nullable(t.Number())),
  kulhydrat: t.Optional(t.Nullable(t.Number())),
  fedt: t.Optional(t.Nullable(t.Number())),
  kostfibre: t.Optional(t.Nullable(t.Number())),
  sukkerarter: t.Optional(t.Nullable(t.Number())),
  maettet_fedt: t.Optional(t.Nullable(t.Number())),
  salt: t.Optional(t.Nullable(t.Number())),
}

const trashType = t.Union([t.Literal('ingredient'), t.Literal('recipe')])

export const foodmate = new Elysia({ prefix: '/foodmate' })
  .use(httpErrors)

  // ── Ingredienser ─────────────────────────────────────────────────────────────
  .get('/ingredients', ({ query }) => listIngredients(query.search, query.include_deleted === 'true'), {
    query: t.Object({ search: t.Optional(t.String()), include_deleted: t.Optional(t.String()) }),
  })
  .get('/ingredients/search-off', async ({ query }) => {
    try {
      return await soegOpenFoodFacts(query.q)
    } catch (e) {
      throw new HttpError(502, (e as Error).message)
    }
  }, { query: t.Object({ q: t.String({ minLength: 2 }) }) })
  .post('/ingredients', ({ body }) => {
    try {
      return createIngredient(body)
    } catch (e) {
      throw new HttpError(400, (e as Error).message)
    }
  }, { body: t.Object({ navn: t.String({ minLength: 1 }), ...nutrientBody }) })
  .put('/ingredients/:id', ({ params, body }) => {
    if (!getIngredient(Number(params.id))) throw new HttpError(404, 'Ingrediensen findes ikke')
    return updateIngredient(Number(params.id), body)
  }, { body: t.Object({ navn: t.String({ minLength: 1 }), ...nutrientBody }) })
  .delete('/ingredients/:id', ({ params }) => {
    softDeleteIngredient(Number(params.id))
    return { ok: true }
  })

  // ── Opskrifter ───────────────────────────────────────────────────────────────
  .get('/recipes', ({ query }) => listRecipes(query.search, query.tag, query.include_deleted === 'true'), {
    query: t.Object({ search: t.Optional(t.String()), tag: t.Optional(t.String()), include_deleted: t.Optional(t.String()) }),
  })
  .get('/tags', () => listAllTags())
  .get('/recipes/:id', ({ params }) => getRecipeDetail(Number(params.id)) ?? (() => { throw new HttpError(404, 'Opskriften findes ikke') })())
  .post('/recipes', ({ body }) => {
    try {
      return createRecipe(body)
    } catch (e) {
      throw new HttpError(400, (e as Error).message)
    }
  }, {
    body: t.Object({
      titel: t.String({ minLength: 1 }), beskrivelse: t.Optional(t.Nullable(t.String())),
      tilberedningstid: t.Optional(t.Nullable(t.Integer())), portioner: t.Integer({ minimum: 1 }),
      tags: t.Optional(t.Nullable(t.String())),
    }),
  })
  .put('/recipes/:id', ({ params, body }) => {
    try {
      const r = updateRecipe(Number(params.id), body)
      if (!r) throw new HttpError(404, 'Opskriften findes ikke')
      return r
    } catch (e) {
      if (e instanceof HttpError) throw e
      throw new HttpError(400, (e as Error).message)
    }
  }, {
    body: t.Object({
      titel: t.String({ minLength: 1 }), beskrivelse: t.Optional(t.Nullable(t.String())),
      tilberedningstid: t.Optional(t.Nullable(t.Integer())), portioner: t.Integer({ minimum: 1 }),
      tags: t.Optional(t.Nullable(t.String())),
    }),
  })
  .delete('/recipes/:id', ({ params }) => {
    softDeleteRecipe(Number(params.id))
    return { ok: true }
  })

  .put('/recipes/:id/ingredients/:ingredientId', ({ params, body }) => {
    try {
      upsertRecipeIngredient(Number(params.id), Number(params.ingredientId), body.maengde)
      return getRecipeDetail(Number(params.id))
    } catch (e) {
      throw new HttpError(400, (e as Error).message)
    }
  }, { body: t.Object({ maengde: t.Number({ exclusiveMinimum: 0 }) }) })
  .delete('/recipes/:id/ingredients/:ingredientId', ({ params }) => {
    deleteRecipeIngredient(Number(params.id), Number(params.ingredientId))
    return getRecipeDetail(Number(params.id))
  })

  .put('/recipes/:id/steps', ({ params, body }) => {
    try {
      replaceRecipeSteps(Number(params.id), body.steps)
      return getRecipeDetail(Number(params.id))
    } catch (e) {
      throw new HttpError(400, (e as Error).message)
    }
  }, { body: t.Object({ steps: t.Array(t.String()) }) })

  // ── Papirkurv ────────────────────────────────────────────────────────────────
  .get('/trash', () => listTrash())
  .post('/trash/:type/:id/restore', ({ params }) => {
    restoreTrashItem(params.type as 'ingredient' | 'recipe', Number(params.id))
    return { ok: true }
  }, { params: t.Object({ type: trashType, id: t.String() }) })
  .delete('/trash/:type/:id', ({ params }) => {
    try {
      permanentlyDeleteTrashItem(params.type as 'ingredient' | 'recipe', Number(params.id))
      return { ok: true }
    } catch (e) {
      throw new HttpError(400, (e as Error).message)
    }
  }, { params: t.Object({ type: trashType, id: t.String() }) })
  .post('/trash/empty', () => emptyTrash())
