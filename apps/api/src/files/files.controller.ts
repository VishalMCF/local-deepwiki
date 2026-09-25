import { BadRequestException, Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, relative, resolve, sep } from 'node:path';
import { ReposService } from '../repos/repos.service';

const MAX_BYTES = 2 * 1024 * 1024;

@Controller('api/repos/:slug/file')
export class FilesController {
  constructor(private readonly repos: ReposService) {}

  /**
   * Serve a file from the imported repo for the right-hand code viewer.
   * Paths are resolved against the repo root and rejected if they escape it.
   */
  @Get()
  async read(@Param('slug') slug: string, @Query('path') path: string) {
    if (!path) throw new BadRequestException('path is required');

    const repo = await this.repos.findBySlug(slug);
    const root = resolve(repo.path);
    const target = resolve(join(root, path));

    if (target !== root && !target.startsWith(root + sep)) {
      throw new BadRequestException('Path escapes the repository root');
    }

    let info;
    try {
      info = await stat(target);
    } catch {
      throw new NotFoundException(`No such file: ${path}`);
    }
    if (!info.isFile()) throw new BadRequestException('Not a file');
    if (info.size > MAX_BYTES) throw new BadRequestException('File too large to display');

    const content = await readFile(target, 'utf8');
    return {
      path: relative(root, target),
      language: languageOf(target),
      size: info.size,
      lineCount: content.split('\n').length,
      content,
    };
  }
}

const LANGS: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'jsx', '.mjs': 'javascript',
  '.cjs': 'javascript', '.go': 'go', '.py': 'python', '.rb': 'ruby', '.rs': 'rust',
  '.java': 'java', '.kt': 'kotlin', '.swift': 'swift', '.c': 'c', '.h': 'c', '.cc': 'cpp',
  '.cpp': 'cpp', '.hpp': 'cpp', '.cs': 'csharp', '.php': 'php', '.scala': 'scala',
  '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash', '.sql': 'sql', '.json': 'json',
  '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.md': 'markdown', '.html': 'html',
  '.css': 'css', '.scss': 'scss', '.vue': 'vue', '.svelte': 'svelte', '.dart': 'dart',
  '.ex': 'elixir', '.exs': 'elixir', '.lua': 'lua', '.zig': 'zig', '.xml': 'xml',
};

function languageOf(file: string): string {
  const base = file.split(sep).pop() ?? '';
  if (base === 'Dockerfile') return 'dockerfile';
  if (base === 'Makefile') return 'makefile';
  return LANGS[extname(base).toLowerCase()] ?? 'text';
}
