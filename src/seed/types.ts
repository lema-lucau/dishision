// Fixture shapes for the seed data authoring pass (§9). These are the
// "recipe JSON in" half of §9.2's generation tooling — canonical ingredients
// are authored separately (src/seed/data/ingredients.ts) and resolved by
// name at seed time, exactly as an imported §7.1 payload resolves
// canonical_name against the local table.

export type BaseUnit = 'g' | 'ml' | 'unit';
export type RecipeUnit = 'g' | 'ml' | 'tsp' | 'tbsp' | 'cup' | 'unit';
export type TagType = 'protein' | 'diet' | 'style' | 'equipment' | 'meal' | 'custom';
export type Phase = 'prep' | 'cook';
export type Effort = 'active' | 'passive';
export type TimelineMode = 'sequential' | 'parallel';

export interface IngredientFixture {
  seedId: string;
  name: string;
  baseUnit: BaseUnit;
  packSize?: number;
  packLabel?: string;
  kcalPer100?: number;
  proteinPer100?: number;
  carbsPer100?: number;
  fatPer100?: number;
  costPer100?: number;
  density?: number;
  aliases?: string[];
}

export interface TagFixture {
  seedId: string;
  name: string;
  type: TagType;
  colour?: string;
}

export interface RecipeIngredientFixture {
  canonicalName: string;
  displayName?: string;
  quantity: number;
  unit: RecipeUnit;
  scalable?: boolean;
  optional?: boolean;
}

export interface StepFixture {
  lane?: string;
  phase: Phase;
  instruction: string;
  durationSeconds?: number;
  startOffsetSeconds?: number;
  effort?: Effort;
  important?: boolean;
}

export interface RecipeFixture {
  seedId: string;
  name: string;
  description?: string;
  photoEmoji: string;
  baseServings?: number;
  timelineMode: TimelineMode;
  originLabel?: string;
  originUrl?: string;
  ingredients: RecipeIngredientFixture[];
  lanes?: string[];
  steps: StepFixture[];
  tags: string[];
}
