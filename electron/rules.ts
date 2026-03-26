import type { AppSettings, RuleSet } from './types';

function normalizeRuleSets(ruleSets: RuleSet[] | undefined) {
  if (!Array.isArray(ruleSets)) {
    return [] as RuleSet[];
  }

  return ruleSets.filter((ruleSet) => Boolean(ruleSet && Array.isArray(ruleSet.rules)));
}

function normalizeActiveRuleSetIds(activeRuleSetIds: string[] | undefined) {
  if (!Array.isArray(activeRuleSetIds)) {
    return [] as string[];
  }

  return activeRuleSetIds.filter((id) => typeof id === 'string' && id.length > 0);
}

export function getActiveRuleSets(settings: Pick<AppSettings, 'ruleSets' | 'activeRuleSetIds'>) {
  const ruleSets = normalizeRuleSets(settings.ruleSets);
  const activeRuleSetIds = normalizeActiveRuleSetIds(settings.activeRuleSetIds);
  const selected = ruleSets.filter((ruleSet) => activeRuleSetIds.includes(ruleSet.id));
  return selected.length ? selected : ruleSets.slice(0, 1);
}

export function getActiveRules(settings: Pick<AppSettings, 'ruleSets' | 'activeRuleSetIds'>) {
  return getActiveRuleSets(settings).flatMap((ruleSet) => ruleSet.rules.filter((rule) => typeof rule === 'string'));
}

export function getActiveRuleSetNames(settings: Pick<AppSettings, 'ruleSets' | 'activeRuleSetIds'>) {
  return getActiveRuleSets(settings).map((ruleSet) => ruleSet.name);
}

export function ensureActiveRuleSetIds(ruleSets: RuleSet[], activeRuleSetIds: string[]) {
  const normalizedRuleSets = normalizeRuleSets(ruleSets);
  const availableIds = new Set(normalizedRuleSets.map((ruleSet) => ruleSet.id));
  const normalizedIds = normalizeActiveRuleSetIds(activeRuleSetIds).filter((id) => availableIds.has(id));

  if (normalizedIds.length) {
    return normalizedIds;
  }

  return normalizedRuleSets[0] ? [normalizedRuleSets[0].id] : [];
}
