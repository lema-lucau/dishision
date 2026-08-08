import { describe, expect, it } from 'vitest';
import { assembleSystemPrompt, buildGlobalSettingsBlock, buildIdentityBlock } from '../../bot/sharedPrompt';
import { DEFAULT_BOT_SETTINGS } from '../../bot/types';

const settings = { ...DEFAULT_BOT_SETTINGS };

describe('sharedPrompt (§A1)', () => {
  it('identity carries the user name and forbids the "AI" label', () => {
    const block = buildIdentityBlock('Lema');
    expect(block).toContain('Lema');
    expect(block).toContain("you're Dishision Bot");
  });

  it('a surface can override the tone', () => {
    const block = buildIdentityBlock('Lema', 'Answer in one short sentence.');
    expect(block).toContain('Answer in one short sentence.');
  });

  it('global settings block reflects units, servings, and preferences', () => {
    const block = buildGlobalSettingsBlock({ ...settings, units: 'imperial', defaultServings: 4, cookingPreferences: 'no mushrooms' });
    expect(block).toContain('imperial');
    expect(block).toContain('4 servings');
    expect(block).toContain('no mushrooms');
  });

  it('assembles sections in the §A1.3 order with scoped context and current recipe', () => {
    const prompt = assembleSystemPrompt({
      userName: 'Lema',
      settings,
      instructions: 'SURFACE INSTRUCTIONS HERE',
      contextFragment: 'the user is on step 4',
      currentRecipe: { name: 'Soup' },
    });
    const idIdx = prompt.indexOf('Dishision Bot');
    const globalIdx = prompt.indexOf('GLOBAL PREFERENCES');
    const instrIdx = prompt.indexOf('SURFACE INSTRUCTIONS HERE');
    const ctxIdx = prompt.indexOf('SCOPED CONTEXT');
    const recipeIdx = prompt.indexOf('CURRENT RECIPE STATE');
    expect(idIdx).toBeGreaterThanOrEqual(0);
    expect(globalIdx).toBeGreaterThan(idIdx);
    expect(instrIdx).toBeGreaterThan(globalIdx);
    expect(ctxIdx).toBeGreaterThan(instrIdx);
    expect(recipeIdx).toBeGreaterThan(ctxIdx);
    expect(prompt).toContain('the user is on step 4');
    expect(prompt).toContain('"name": "Soup"');
  });

  it('omits the current-recipe block when includeCurrentRecipe is false', () => {
    const prompt = assembleSystemPrompt({
      userName: 'Lema',
      settings,
      instructions: 'x',
      includeCurrentRecipe: false,
    });
    expect(prompt).not.toContain('CURRENT RECIPE STATE');
  });
});
