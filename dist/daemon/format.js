// ANSI escape code formatters — zero dependencies
export const bold = (s) => `\x1b[1m${s}\x1b[22m`;
export const dim = (s) => `\x1b[2m${s}\x1b[22m`;
export const purple = (s) => `\x1b[35m${s}\x1b[39m`;
export const cyan = (s) => `\x1b[36m${s}\x1b[39m`;
export const green = (s) => `\x1b[32m${s}\x1b[39m`;
export const yellow = (s) => `\x1b[33m${s}\x1b[39m`;
export const red = (s) => `\x1b[31m${s}\x1b[39m`;
export const gray = (s) => `\x1b[90m${s}\x1b[39m`;
export function box(lines) {
    const maxLen = Math.max(...lines.map(l => stripAnsi(l).length));
    const pad = (s) => s + ' '.repeat(maxLen - stripAnsi(s).length);
    const top = `  ╭${'─'.repeat(maxLen + 4)}╮`;
    const bot = `  ╰${'─'.repeat(maxLen + 4)}╯`;
    const rows = lines.map(l => `  │  ${pad(l)}  │`);
    return [top, ...rows, bot].join('\n');
}
function stripAnsi(s) {
    return s.replace(/\x1b\[[0-9;]*m/g, '');
}
export function toolPill(name, target) {
    return `  ${cyan('●')} ${bold(name)}${target ? gray(`(${target})`) : ''}`;
}
export function fileWrite(path) {
    return `  ${green('✓')} ${bold('Write')}${gray(`(${path})`)}`;
}
export function agentText(text) {
    return `  ${gray('│')} ${dim(text)}`;
}
export function jobFound(title, budget) {
    return `  ${yellow('◆')} ${bold('Job found:')} ${title} ${gray(`(${budget} USDC)`)}`;
}
export function jobDone(summary) {
    return `  ${green('✓')} ${bold('Done:')} ${summary}`;
}
export function jobError(msg) {
    return `  ${red('✗')} ${msg}`;
}
export function costLine(cost, turns) {
    const parts = [`$${cost}`];
    if (turns)
        parts.push(`${turns} turns`);
    return `  ${gray(parts.join(' · '))}`;
}
//# sourceMappingURL=format.js.map