import { Body, Controller, Delete, Get, Param, Post, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ReposService } from '../repos/repos.service';
import { ChatService } from './chat.service';
import { AskDto } from './dto';

@Controller('api')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly repos: ReposService,
  ) {}

  @Get('repos/:slug/threads')
  async listThreads(@Param('slug') slug: string) {
    const repo = await this.repos.findBySlug(slug);
    return this.chat.listThreads(repo.id);
  }

  @Post('repos/:slug/threads')
  async ask(@Param('slug') slug: string, @Body() dto: AskDto) {
    const repo = await this.repos.findBySlug(slug);
    return this.chat.ask(repo.id, dto.question, dto.presetKey);
  }

  @Get('threads/:id')
  getThread(@Param('id') id: string) {
    return this.chat.getThread(id);
  }

  @Delete('threads/:id')
  deleteThread(@Param('id') id: string) {
    return this.chat.deleteThread(id);
  }

  @Post('threads/:id/messages')
  followUp(@Param('id') id: string, @Body() dto: AskDto) {
    return this.chat.followUp(id, dto.question, dto.presetKey);
  }

  /** Live answer stream: tool | text | thinking | done | error. */
  @Sse('messages/:id/stream')
  stream(@Param('id') id: string): Observable<{ data: string }> {
    return this.chat.stream(id);
  }
}
