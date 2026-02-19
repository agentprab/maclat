// ANSI escape code formatters — zero dependencies
export const bold = (s: string): string => `\x1b[1m${s}\x1b[22m`;
export const dim = (s: string): string => `\x1b[2m${s}\x1b[22m`;
export const purple = (s: string): string => `\x1b[35m${s}\x1b[39m`;
export const cyan = (s: string): string => `\x1b[36m${s}\x1b[39m`;
export const green = (s: string): string => `\x1b[32m${s}\x1b[39m`;
export const yellow = (s: string): string => `\x1b[33m${s}\x1b[39m`;
export const red = (s: string): string => `\x1b[31m${s}\x1b[39m`;
export const gray = (s: string): string => `\x1b[90m${s}\x1b[39m`;

export function box(lines: string[]): string {
  const maxLen = Math.max(...lines.map(l => stripAnsi(l).length));
  const pad = (s: string) => s + ' '.repeat(maxLen - stripAnsi(s).length);
  const top = `  ╭${'─'.repeat(maxLen + 4)}╮`;
  const bot = `  ╰${'─'.repeat(maxLen + 4)}╯`;
  const rows = lines.map(l => `  │  ${pad(l)}  │`);
  return [top, ...rows, bot].join('\n');
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

export function toolPill(name: string, target: string): string {
  return `  ${cyan('●')} ${bold(name)}${target ? gray(`(${target})`) : ''}`;
}

export function fileWrite(path: string): string {
  return `  ${green('✓')} ${bold('Write')}${gray(`(${path})`)}`;
}

export function agentText(text: string): string {
  return `  ${gray('│')} ${dim(text)}`;
}

export function jobFound(title: string, budget: number): string {
  return `  ${yellow('◆')} ${bold('Job found:')} ${title} ${gray(`(${budget} USDC)`)}`;
}

export function jobDone(summary: string): string {
  return `  ${green('✓')} ${bold('Done:')} ${summary}`;
}

export function jobError(msg: string): string {
  return `  ${red('✗')} ${msg}`;
}

export function costLine(cost: number | string, turns?: number | string): string {
  const parts = [`$${cost}`];
  if (turns) parts.push(`${turns} turns`);
  return `  ${gray(parts.join(' · '))}`;
}
