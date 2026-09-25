import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PageNode {
  id: string;
  slug: string;
  title: string;
  summary?: string;
  status: string;
  order: number;
  children: PageNode[];
}

@Injectable()
export class WikiService {
  constructor(private readonly prisma: PrismaService) {}

  /** The left-hand navigation tree. */
  async tree(repoId: string): Promise<PageNode[]> {
    const pages = await this.prisma.wikiPage.findMany({
      where: { repoId },
      orderBy: { order: 'asc' },
      select: { id: true, slug: true, title: true, summary: true, status: true, order: true, parentId: true },
    });

    const byId = new Map<string, PageNode>();
    for (const p of pages) {
      byId.set(p.id, {
        id: p.id,
        slug: p.slug,
        title: p.title,
        summary: p.summary ?? undefined,
        status: p.status,
        order: p.order,
        children: [],
      });
    }

    const roots: PageNode[] = [];
    for (const p of pages) {
      const node = byId.get(p.id)!;
      if (p.parentId && byId.has(p.parentId)) byId.get(p.parentId)!.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async page(repoId: string, slug: string) {
    const page = await this.prisma.wikiPage.findUnique({
      where: { repoId_slug: { repoId, slug } },
      include: { citations: { orderBy: { order: 'asc' } } },
    });
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }

  /** First readable page, used when landing on /repo/:slug with no page selected. */
  async firstPage(repoId: string) {
    return this.prisma.wikiPage.findFirst({
      where: { repoId },
      orderBy: { order: 'asc' },
      select: { slug: true },
    });
  }

  async jobs(repoId: string) {
    return this.prisma.job.findMany({
      where: { repoId },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
  }
}
