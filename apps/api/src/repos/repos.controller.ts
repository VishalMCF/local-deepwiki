import { Body, Controller, Delete, Get, Param, Post, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { EventsService } from '../events/events.service';
import { CreateRepoDto, RefreshRepoDto } from './dto';
import { ReposService } from './repos.service';

@Controller('api/repos')
export class ReposController {
  constructor(
    private readonly repos: ReposService,
    private readonly events: EventsService,
  ) {}

  @Get()
  list() {
    return this.repos.list();
  }

  @Post()
  create(@Body() dto: CreateRepoDto) {
    return this.repos.create(dto);
  }

  @Get(':slug')
  get(@Param('slug') slug: string) {
    return this.repos.findBySlug(slug);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.repos.remove(id);
  }

  @Post(':id/refresh')
  refresh(@Param('id') id: string, @Body() dto: RefreshRepoDto) {
    return this.repos.refresh(id, dto.presetKey, dto.mode ?? 'refresh');
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.repos.cancel(id);
  }

  /** Live indexing progress: status, outline, page, scanning, progress, done. */
  @Sse(':id/events')
  events$(@Param('id') id: string): Observable<{ data: string }> {
    return this.events.channel(`repo:${id}`);
  }
}
