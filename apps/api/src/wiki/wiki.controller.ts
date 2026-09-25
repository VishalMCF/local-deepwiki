import { Controller, Get, Param, Post } from '@nestjs/common';
import { ReposService } from '../repos/repos.service';
import { IndexerService } from './indexer.service';
import { WikiService } from './wiki.service';

@Controller('api/repos/:slug/wiki')
export class WikiController {
  constructor(
    private readonly wiki: WikiService,
    private readonly repos: ReposService,
    private readonly indexer: IndexerService,
  ) {}

  @Get('tree')
  async tree(@Param('slug') slug: string) {
    const repo = await this.repos.findBySlug(slug);
    return this.wiki.tree(repo.id);
  }

  @Get('jobs')
  async jobs(@Param('slug') slug: string) {
    const repo = await this.repos.findBySlug(slug);
    return this.wiki.jobs(repo.id);
  }

  @Get('pages/:pageSlug')
  async page(@Param('slug') slug: string, @Param('pageSlug') pageSlug: string) {
    const repo = await this.repos.findBySlug(slug);
    return this.wiki.page(repo.id, pageSlug);
  }

  /** Retry a single failed page without rebuilding the whole wiki. */
  @Post('pages/:pageSlug/regenerate')
  async regenerate(@Param('slug') slug: string, @Param('pageSlug') pageSlug: string) {
    const repo = await this.repos.findBySlug(slug);
    const page = await this.wiki.page(repo.id, pageSlug);
    this.indexer.start(repo.id, repo.defaultPreset, 'refresh');
    return { ok: true, pageId: page.id };
  }
}
