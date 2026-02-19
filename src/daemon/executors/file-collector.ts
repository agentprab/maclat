import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

export function collectFiles(dir: string, base?: string): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  const root = base || dir;

  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        files.push(...collectFiles(fullPath, root));
      } else if (stat.isFile() && stat.size < 100_000) {
        try {
          const content = readFileSync(fullPath, 'utf-8');
          files.push({ path: relative(root, fullPath), content });
        } catch {
          // Binary file or unreadable, skip
        }
      }
    }
  } catch {
    // Directory doesn't exist or not readable
  }

  return files;
}
