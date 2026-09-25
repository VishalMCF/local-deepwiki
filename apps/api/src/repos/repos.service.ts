import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RepoStatus } from '@prisma/client';
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { readGitInfo } from '../common/git.util';
import { uniqueSlug } from '../common/slug.util';
import { PrismaService } from '../prisma/prisma.service';
import { IndexerService } from '../wiki/indexer.service';
import { CreateRepoDto } from './dto';
import { repoNameFromPath, scanRepo, validateRepoPath } from './scanner.util';

@Injectable()
export class ReposService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly indexer: IndexerService,
  ) {}

  async list() {
    const repos = await this.prisma.repo.findMany({ orderBy: { createdAt: 'desc' } });
    return Promise.all(repos.map((r) => this.decorate(r)));
  }

  async create(dto: CreateRepoDto) {
    const path = expandPath(dto.path);

    const check = await validateRepoPath(path);
    if (!check.ok) throw new BadRequestException(check.reason);

    const existing = await this.prisma.repo.findUnique({ where: { path } });
    if (existing) throw new BadRequestException(`Already imported as "${existing.name}"`);

    const [scan, git] = await Promise.all([scanRepo(path), readGitInfo(path)]);
    if (scan.fileCount === 0) throw new BadRequestException('Directory contains no readable files');

    const name = dto.name?.trim() || repoNameFromPath(path);
    const slug = await uniqueSlug(name, async (s) =>
      Boolean(await this.prisma.repo.findUnique({ where: { slug: s } })),
    );

    const repo = await this.prisma.repo.create({
      data: {
        slug,
        name,
        path,
        language: scan.primaryLanguage ?? null,
        fileCount: scan.fileCount,
        gitBranch: git.branch ?? null,
        gitRemote: git.remote ?? null,
        headSha: git.sha ?? null,
        status: RepoStatus.PENDING,
        defaultPreset: dto.presetKey ?? 'fast',
      },
    });

    this.indexer.start(repo.id, dto.presetKey, 'full');
    return this.decorate(repo);
  }

  async findBySlug(slug: string) {
    const repo = await this.prisma.repo.findUnique({ where: { slug } });
    if (!repo) throw new NotFoundException('Repo not found');
    return this.decorate(repo);
  }

  async findById(id: string) {
    const repo = await this.prisma.repo.findUnique({ where: { id } });
    if (!repo) throw new NotFoundException('Repo not found');
    return repo;
  }

  async remove(id: string) {
    await this.findById(id);
    this.indexer.cancel(id);
    await this.prisma.repo.delete({ where: { id } });
    return { ok: true };
  }

  async refresh(id: string, presetKey?: string, mode: 'full' | 'refresh' = 'refresh') {
    const repo = await this.findById(id);
    if (this.indexer.isRunning(id)) throw new BadRequestException('Indexing already in progress');
    this.indexer.start(repo.id, presetKey ?? repo.defaultPreset, mode);
    return { ok: true, mode };
  }

  async cancel(id: string) {
    this.indexer.cancel(id);
    await this.prisma.repo.update({ where: { id }, data: { status: RepoStatus.FAILED, error: 'Cancelled' } });
    return { ok: true };
  }

  /** Adds live git state so the UI can show the "Refresh this wiki" stale badge. */
  private async decorate(repo: any) {
    const git = await readGitInfo(repo.path);
    const [pageCount, readyCount, threadCount] = await Promise.all([
      this.prisma.wikiPage.count({ where: { repoId: repo.id } }),
      this.prisma.wikiPage.count({ where: { repoId: repo.id, status: 'READY' } }),
      this.prisma.thread.count({ where: { repoId: repo.id } }),
    ]);

    return {
      ...repo,
      headSha: git.sha ?? repo.headSha,
      shortSha: (git.sha ?? repo.indexedSha)?.slice(0, 7) ?? null,
      indexedShortSha: repo.indexedSha?.slice(0, 7) ?? null,
      isGitRepo: git.isRepo,
      stale: Boolean(repo.indexedSha && git.sha && repo.indexedSha !== git.sha),
      pageCount,
      readyCount,
      threadCount,
      indexing: this.indexer.isRunning(repo.id),
    };
  }
}

/** Accept ~, relative and trailing-slash forms of a path. */
export function expandPath(input: string): string {
  let p = input.trim().replace(/\/+$/, '');
  if (p.startsWith('~')) p = p.replace(/^~/, homedir());
  return isAbsolute(p) ? p : resolve(process.cwd(), p);
}
