import { beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'foodmate-')), 'test.sqlite')

let nutrition: typeof import('./nutrition')
let q: typeof import('./queries')

beforeAll(async () => {
  nutrition = await import('./nutrition')
  q = await import('./queries')
})

describe('næringsberegning', () => {
  test('skaler: pr. 100g til en given mængde', () => {
    expect(nutrition.skaler(52, 150)).toBeCloseTo(78, 2) // æble: 52 kcal/100g * 150g
    expect(nutrition.skaler(null, 150)).toBeNull()
  })

  test('summerNaering: summerer kun felter der har mindst ét bidrag', () => {
    const total = nutrition.summerNaering([
      { ingrediens: { energi_kcal: 100, protein: 10, kulhydrat: null, fedt: null, kostfibre: null, sukkerarter: null, maettet_fedt: null, salt: null }, gram: 100 },
      { ingrediens: { energi_kcal: 200, protein: null, kulhydrat: null, fedt: null, kostfibre: null, sukkerarter: null, maettet_fedt: null, salt: null }, gram: 50 },
    ])
    expect(total.energi_kcal).toBeCloseTo(200, 2) // 100 + 100
    expect(total.protein).toBeCloseTo(10, 2)
    expect(total.kulhydrat).toBeNull()
  })

  test('prPortion: deler alle felter med antal portioner', () => {
    const pr = nutrition.prPortion(
      { energi_kcal: 800, protein: 40, kulhydrat: null, fedt: null, kostfibre: null, sukkerarter: null, maettet_fedt: null, salt: null },
      4,
    )
    expect(pr.energi_kcal).toBe(200)
    expect(pr.protein).toBe(10)
    expect(pr.kulhydrat).toBeNull()
  })

  test('pr100g: omregner samlet næring til pr. 100g af hele retten', () => {
    const pr = nutrition.pr100g(
      { energi_kcal: 1128, protein: 20, kulhydrat: null, fedt: null, kostfibre: null, sukkerarter: null, maettet_fedt: null, salt: null },
      300, // samlet 300g
    )
    expect(pr.energi_kcal).toBeCloseTo(376, 0) // 1128/300*100
    expect(pr.protein).toBeCloseTo(6.67, 1)
  })

  test('forGram: beregner næring for en given mængde ud fra pr. 100g', () => {
    const forspist = nutrition.forGram(
      { energi_kcal: 376, protein: 6.67, kulhydrat: null, fedt: null, kostfibre: null, sukkerarter: null, maettet_fedt: null, salt: null },
      150,
    )
    expect(forspist.energi_kcal).toBeCloseTo(564, 0) // 376 * 1.5
  })
})

describe('ingredienser', () => {
  test('oprettes, opdateres, soft-deletes og gendannes', () => {
    const i = q.createIngredient({ navn: 'Æble', energi_kcal: 52, protein: 0.3 })
    expect(i.navn).toBe('Æble')

    q.updateIngredient(i.id, { navn: 'Æble', energi_kcal: 55 })
    expect(q.getIngredient(i.id)?.energi_kcal).toBe(55)

    q.softDeleteIngredient(i.id)
    expect(q.listIngredients().some(x => x.id === i.id)).toBe(false)
    expect(q.listIngredients(undefined, true).some(x => x.id === i.id)).toBe(true)

    q.restoreIngredient(i.id)
    expect(q.listIngredients().some(x => x.id === i.id)).toBe(true)
  })

  test('to ingredienser med samme navn afvises', () => {
    q.createIngredient({ navn: 'Unik ingrediens' })
    expect(() => q.createIngredient({ navn: 'Unik ingrediens' })).toThrow('findes allerede')
  })

  test('permanent sletning blokeres hvis ingrediensen er i brug', () => {
    const ing = q.createIngredient({ navn: 'Mel', energi_kcal: 364 })
    const recipe = q.createRecipe({ titel: 'Boller', portioner: 4 })
    q.upsertRecipeIngredient(recipe.id, ing.id, 500)

    q.softDeleteIngredient(ing.id)
    expect(() => q.permanentlyDeleteIngredient(ing.id)).toThrow('bruges stadig')

    q.deleteRecipeIngredient(recipe.id, ing.id)
    expect(() => q.permanentlyDeleteIngredient(ing.id)).not.toThrow()
  })
})

describe('opskrifter', () => {
  test('næring beregnes korrekt ud fra ingredienslinjer', () => {
    const mel = q.createIngredient({ navn: 'Hvedemel', energi_kcal: 364, protein: 10 })
    const sukker = q.createIngredient({ navn: 'Sukker', energi_kcal: 400, protein: 0 })
    const recipe = q.createRecipe({ titel: 'Kage', portioner: 8 })

    q.upsertRecipeIngredient(recipe.id, mel.id, 200) // 728 kcal, 20g protein
    q.upsertRecipeIngredient(recipe.id, sukker.id, 100) // 400 kcal

    const detail = q.getRecipeDetail(recipe.id)!
    expect(detail.naering_total.energi_kcal).toBeCloseTo(1128, 1)
    expect(detail.naering_total.protein).toBeCloseTo(20, 1)
    expect(detail.naering_pr_portion.energi_kcal).toBeCloseTo(141, 0) // 1128/8
    expect(detail.total_gram).toBe(300) // 200g mel + 100g sukker
    expect(detail.naering_pr_100g.energi_kcal).toBeCloseTo(376, 0) // 1128/300*100

    // upsert opdaterer i stedet for at duplikere
    q.upsertRecipeIngredient(recipe.id, mel.id, 100)
    const detail2 = q.getRecipeDetail(recipe.id)!
    expect(detail2.ingredienser.length).toBe(2)
    expect(detail2.ingredienser.find(l => l.ingredient_id === mel.id)?.maengde).toBe(100)
  })

  test('trin erstattes fuldstændigt ved gem', () => {
    const recipe = q.createRecipe({ titel: 'Trin-test', portioner: 2 })
    q.replaceRecipeSteps(recipe.id, ['Første trin', 'Andet trin'])
    expect(q.getRecipeDetail(recipe.id)!.trin.map(t => t.tekst)).toEqual(['Første trin', 'Andet trin'])

    q.replaceRecipeSteps(recipe.id, ['Kun ét trin nu'])
    expect(q.getRecipeDetail(recipe.id)!.trin.map(t => t.tekst)).toEqual(['Kun ét trin nu'])
  })

  test('portioner skal være mindst 1', () => {
    expect(() => q.createRecipe({ titel: 'Ugyldig', portioner: 0 })).toThrow('mindst 1')
  })
})

describe('dagbog', () => {
  test('logger forbrug af en opskrift ud fra gram, og beregner næring pr. logning', () => {
    const mel = q.createIngredient({ navn: 'Rugmel', energi_kcal: 330, protein: 9 })
    const recipe = q.createRecipe({ titel: 'Rugbrød', portioner: 4 })
    q.upsertRecipeIngredient(recipe.id, mel.id, 500) // 500g -> 1650 kcal, pr 100g = 330 kcal

    const entry = q.addLogEntry(recipe.id, '2026-11-09', 80)
    expect(entry.recipe_titel).toBe('Rugbrød')
    expect(entry.naering.energi_kcal).toBeCloseTo(264, 0) // 330 * 0.8

    const { entries, total } = q.listLogForDate('2026-11-09')
    expect(entries.length).toBe(1)
    expect(total.energi_kcal).toBeCloseTo(264, 0)

    expect(q.listLogForDate('2026-11-10').entries.length).toBe(0)
  })

  test('summerer flere logninger samme dag', () => {
    const ing = q.createIngredient({ navn: 'Havregryn', energi_kcal: 375 })
    const recipe = q.createRecipe({ titel: 'Havregrød', portioner: 2 })
    q.upsertRecipeIngredient(recipe.id, ing.id, 200) // pr 100g = 375 kcal

    q.addLogEntry(recipe.id, '2026-11-11', 50) // 187.5 kcal
    q.addLogEntry(recipe.id, '2026-11-11', 100) // 375 kcal

    const { entries, total } = q.listLogForDate('2026-11-11')
    expect(entries.length).toBe(2)
    expect(total.energi_kcal).toBeCloseTo(562.5, 1)
  })

  test('afviser ugyldig dato, ugyldig gram og ukendt opskrift', () => {
    const ing = q.createIngredient({ navn: 'Ris' })
    const recipe = q.createRecipe({ titel: 'Risret', portioner: 2 })
    q.upsertRecipeIngredient(recipe.id, ing.id, 100)

    expect(() => q.addLogEntry(recipe.id, '09-11-2026', 50)).toThrow('Dato')
    expect(() => q.addLogEntry(recipe.id, '2026-11-09', 0)).toThrow('Gram')
    expect(() => q.addLogEntry(999999, '2026-11-09', 50)).toThrow('findes ikke')
  })

  test('sletter en logning', () => {
    const ing = q.createIngredient({ navn: 'Quinoa' })
    const recipe = q.createRecipe({ titel: 'Quinoasalat', portioner: 2 })
    q.upsertRecipeIngredient(recipe.id, ing.id, 100)
    const entry = q.addLogEntry(recipe.id, '2026-11-12', 50)

    expect(q.listLogForDate('2026-11-12').entries.length).toBe(1)
    q.deleteLogEntry(entry.id)
    expect(q.listLogForDate('2026-11-12').entries.length).toBe(0)
  })
})

describe('papirkurv', () => {
  test('viser slettede ingredienser og opskrifter, og kan gendanne', () => {
    const ing = q.createIngredient({ navn: 'Trash-ingrediens' })
    const recipe = q.createRecipe({ titel: 'Trash-opskrift', portioner: 2 })
    q.softDeleteIngredient(ing.id)
    q.softDeleteRecipe(recipe.id)

    const trash = q.listTrash()
    expect(trash.some(t => t.type === 'ingredient' && t.id === ing.id)).toBe(true)
    expect(trash.some(t => t.type === 'recipe' && t.id === recipe.id)).toBe(true)

    q.restoreTrashItem('recipe', recipe.id)
    expect(q.listTrash().some(t => t.type === 'recipe' && t.id === recipe.id)).toBe(false)
  })

  test('tøm papirkurv sletter permanent og rapporterer fejlede', () => {
    const brugt = q.createIngredient({ navn: 'Stadig i brug' })
    const fri = q.createIngredient({ navn: 'Fri til sletning' })
    const recipe = q.createRecipe({ titel: 'Bruger ingrediens', portioner: 2 })
    q.upsertRecipeIngredient(recipe.id, brugt.id, 50)

    q.softDeleteIngredient(brugt.id)
    q.softDeleteIngredient(fri.id)

    const resultat = q.emptyTrash()
    expect(resultat.slettet).toBeGreaterThanOrEqual(1)
    expect(resultat.fejlede).toBeGreaterThanOrEqual(1) // 'brugt' kan ikke slettes permanent
    expect(q.getIngredient(brugt.id)).not.toBeNull() // stadig der, kun fejlet
    expect(q.getIngredient(fri.id)).toBeNull()
  })
})
