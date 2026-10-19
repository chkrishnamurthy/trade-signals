/**
 * A robots.txt reader (RFC 9309), enforced in code before every IPO request
 * (docs/planning/ipos-plan.md §5.3). Pure: text in, decision out.
 *
 * Group selection: the group naming our product token (`equitywise`) wins;
 * otherwise the `*` group applies. Within a group the LONGEST matching rule
 * wins, and on a tie `Allow` beats `Disallow`. `*` and a trailing `$` are
 * supported. No group, or no file, means everything is allowed.
 */

interface Rule {
  readonly allow: boolean;
  readonly pattern: string;
}

export interface RobotsRules {
  readonly groups: ReadonlyMap<string, readonly Rule[]>;
}

export const ALLOW_ALL: RobotsRules = { groups: new Map() };

export function parseRobots(text: string): RobotsRules {
  const groups = new Map<string, Rule[]>();
  let agents: string[] = [];
  let inRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line === '') continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === 'user-agent') {
      // A user-agent line after rules starts a new group.
      if (inRules) {
        agents = [];
        inRules = false;
      }
      const agent = value.toLowerCase();
      agents.push(agent);
      if (!groups.has(agent)) groups.set(agent, []);
    } else if (field === 'allow' || field === 'disallow') {
      inRules = true;
      // An empty Disallow means "allow everything" and adds no rule.
      if (value === '') continue;
      for (const agent of agents)
        groups.get(agent)?.push({ allow: field === 'allow', pattern: value });
    }
  }
  return { groups };
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** Whether `pathAndQuery` (e.g. `/api/ipo-detail?symbol=VNL`) may be fetched by `agent`. */
export function isAllowed(rules: RobotsRules, agent: string, pathAndQuery: string): boolean {
  const own = rules.groups.get(agent.toLowerCase());
  const group = own ?? rules.groups.get('*');
  if (group === undefined) return true;
  let best: Rule | null = null;
  for (const rule of group) {
    if (!patternToRegExp(rule.pattern).test(pathAndQuery)) continue;
    if (
      best === null ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    )
      best = rule;
  }
  return best === null ? true : best.allow;
}
