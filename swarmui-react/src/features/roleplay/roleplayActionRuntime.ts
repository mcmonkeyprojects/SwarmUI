import type {
  ChatMessage,
  RoleplayPromptBlockPosition,
  RoleplayPromptBlockRole,
  RoleplayQuickReply,
  RoleplayScriptVariable,
} from '../../types/roleplay';

export type RoleplayScriptSource = 'slash' | 'quick-reply' | 'hook';

export type RoleplayScriptEffect =
  | { type: 'message'; role: ChatMessage['role']; content: string }
  | {
      type: 'inject';
      label: string;
      content: string;
      role: RoleplayPromptBlockRole;
      position: RoleplayPromptBlockPosition;
      depth: number | null;
    }
  | { type: 'clear-injections' }
  | { type: 'set-variable'; name: string; value: string }
  | { type: 'unset-variable'; name: string }
  | { type: 'remember'; content: string }
  | { type: 'thread'; content: string }
  | { type: 'generation'; mode: 'continue' | 'swipe' | 'regenerate' | 'impersonate' | 'quiet' }
  | { type: 'notice'; message: string };

export interface RoleplayScriptExecutionResult {
  ok: boolean;
  effects: RoleplayScriptEffect[];
  message: string;
  commandCount: number;
}

export interface RoleplayScriptContext {
  globalVariables: Record<string, RoleplayScriptVariable>;
  sessionVariables: Record<string, RoleplayScriptVariable>;
  quickReplies: RoleplayQuickReply[];
}

function tokenizeCommand(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function normalizeVariableName(name: string): string {
  return name.trim().replace(/^[/$]+/, '').replace(/[^\w.-]/g, '').slice(0, 80);
}

function getVariables(context: RoleplayScriptContext): Record<string, string> {
  const variables: Record<string, string> = {};
  for (const [name, variable] of Object.entries(context.globalVariables)) {
    variables[name] = variable.value;
  }
  for (const [name, variable] of Object.entries(context.sessionVariables)) {
    variables[name] = variable.value;
  }
  return variables;
}

export function expandRoleplayScriptVariables(
  text: string,
  variables: Record<string, RoleplayScriptVariable> | Record<string, string>
): string {
  const flatVariables: Record<string, string> = {};
  for (const [name, value] of Object.entries(variables)) {
    flatVariables[name] = typeof value === 'string' ? value : value.value;
  }
  return text
    .replace(/\{\{var:([\w.-]+)\}\}/g, (_match, name: string) => flatVariables[name] ?? '')
    .replace(/\$([A-Za-z_][\w.-]*)/g, (_match, name: string) => flatVariables[name] ?? '');
}

function parseInjection(tokens: string[], content: string): RoleplayScriptEffect {
  const positionAliases: Record<string, RoleplayPromptBlockPosition> = {
    before: 'before-history',
    'before-history': 'before-history',
    after: 'after-history',
    'after-history': 'after-history',
    in: 'in-history',
    'in-history': 'in-history',
  };
  const roleAliases: Record<string, RoleplayPromptBlockRole> = {
    system: 'system',
    user: 'user',
    assistant: 'assistant',
  };
  const position = positionAliases[(tokens[1] ?? 'before').toLowerCase()] ?? 'before-history';
  const role = roleAliases[(tokens[2] ?? 'system').toLowerCase()] ?? 'system';
  const separatorIndex = content.indexOf('::');
  const label = separatorIndex >= 0 ? content.slice(0, separatorIndex).trim() : 'Script Injection';
  const body = separatorIndex >= 0 ? content.slice(separatorIndex + 2).trim() : content.trim();
  return {
    type: 'inject',
    label: label || 'Script Injection',
    content: body,
    role,
    position,
    depth: position === 'in-history' ? 4 : null,
  };
}

function executeCommandLine(
  rawLine: string,
  context: RoleplayScriptContext,
  seenTriggers: Set<string>
): RoleplayScriptEffect[] {
  const line = rawLine.trim();
  if (!line) {
    return [];
  }
  if (!line.startsWith('/')) {
    return [{ type: 'message', role: 'user', content: expandRoleplayScriptVariables(line, getVariables(context)) }];
  }

  const tokens = tokenizeCommand(line);
  const command = tokens[0].slice(1).toLowerCase();
  const rest = line.slice(tokens[0].length).trim();
  const expandedRest = expandRoleplayScriptVariables(rest, getVariables(context));

  if (command === 'help') {
    return [
      {
        type: 'notice',
        message:
          'Commands: /sendas, /inject, /clearinjects, /setvar, /getvar, /unsetvar, /remember, /thread, /trigger, /continue, /swipe, /regen, /impersonate, /quiet.',
      },
    ];
  }
  if (command === 'sendas') {
    const role = (tokens[1] ?? 'user').toLowerCase() as ChatMessage['role'];
    const content = expandedRest.slice((tokens[1] ?? '').length).trim();
    if (role !== 'user' && role !== 'assistant' && role !== 'system') {
      throw new Error('/sendas role must be user, assistant, or system.');
    }
    if (!content) {
      throw new Error('/sendas requires message text.');
    }
    return [{ type: 'message', role, content }];
  }
  if (command === 'inject') {
    const contentStart = tokens.slice(0, 3).join(' ').length;
    const content = expandedRest.slice(Math.max(0, contentStart - tokens[0].length)).trim();
    if (!content) {
      throw new Error('/inject requires content. Example: /inject before system Note :: Remember the door is locked.');
    }
    return [parseInjection(tokens, content)];
  }
  if (command === 'clearinjects') {
    return [{ type: 'clear-injections' }];
  }
  if (command === 'setvar') {
    const name = normalizeVariableName(tokens[1] ?? '');
    const value = expandedRest.slice((tokens[1] ?? '').length).trim();
    if (!name) {
      throw new Error('/setvar requires a variable name.');
    }
    return [{ type: 'set-variable', name, value }];
  }
  if (command === 'getvar') {
    const name = normalizeVariableName(tokens[1] ?? '');
    const value = getVariables(context)[name] ?? '';
    return [{ type: 'notice', message: value ? `${name} = ${value}` : `${name || 'Variable'} is not set.` }];
  }
  if (command === 'unsetvar') {
    const name = normalizeVariableName(tokens[1] ?? '');
    if (!name) {
      throw new Error('/unsetvar requires a variable name.');
    }
    return [{ type: 'unset-variable', name }];
  }
  if (command === 'remember') {
    if (!expandedRest) {
      throw new Error('/remember requires text.');
    }
    return [{ type: 'remember', content: expandedRest }];
  }
  if (command === 'thread') {
    if (!expandedRest) {
      throw new Error('/thread requires text.');
    }
    return [{ type: 'thread', content: expandedRest }];
  }
  if (command === 'trigger') {
    const target = expandedRest.toLowerCase();
    const quickReply = context.quickReplies.find(
      (reply) => reply.enabled && (reply.id.toLowerCase() === target || reply.label.toLowerCase() === target)
    );
    if (!quickReply) {
      throw new Error(`/trigger could not find quick reply "${expandedRest}".`);
    }
    if (seenTriggers.has(quickReply.id)) {
      throw new Error(`/trigger loop blocked for "${quickReply.label}".`);
    }
    seenTriggers.add(quickReply.id);
    return executeRoleplayScript(quickReply.script, context, seenTriggers).effects;
  }
  if (command === 'continue' || command === 'swipe' || command === 'impersonate' || command === 'quiet') {
    return [{ type: 'generation', mode: command }];
  }
  if (command === 'regen' || command === 'regenerate') {
    return [{ type: 'generation', mode: 'regenerate' }];
  }

  throw new Error(`Unknown roleplay command: /${command}`);
}

export function executeRoleplayScript(
  script: string,
  context: RoleplayScriptContext,
  seenTriggers = new Set<string>()
): RoleplayScriptExecutionResult {
  try {
    const effects: RoleplayScriptEffect[] = [];
    const workingContext: RoleplayScriptContext = {
      ...context,
      sessionVariables: { ...context.sessionVariables },
    };
    const lines = script.split(/\r?\n/).map((line) => line.trim()).filter((line) => line);
    for (const line of lines) {
      const lineEffects = executeCommandLine(line, workingContext, seenTriggers);
      for (const effect of lineEffects) {
        if (effect.type === 'set-variable') {
          workingContext.sessionVariables[effect.name] = {
            name: effect.name,
            value: effect.value,
            updatedAt: Date.now(),
          };
        } else if (effect.type === 'unset-variable') {
          delete workingContext.sessionVariables[effect.name];
        }
      }
      effects.push(...lineEffects);
    }
    return {
      ok: true,
      effects,
      message: effects.length === 1 ? '1 action executed.' : `${effects.length} actions executed.`,
      commandCount: lines.length,
    };
  } catch (error) {
    return {
      ok: false,
      effects: [],
      message: error instanceof Error ? error.message : 'Script failed.',
      commandCount: 0,
    };
  }
}
