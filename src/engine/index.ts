export { createInitialState, processAction, canUndo, undo } from "./gameEngine";
export { detectTriggers, parseTriggersFromOracle } from "./triggers";
export { cardToPermanent, cardToStackItem, getCardSummary, detectTargetRequirement, parseActivatedAbilities, abilityToStackItem } from "./cardMapper";
export type { ActivatedAbilityInfo } from "./cardMapper";
export * from "./types";
export { generateId, getOpponent } from "./utils";
