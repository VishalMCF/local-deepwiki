import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { AgyRunner } from './runners/agy.runner';
import { ClaudeRunner } from './runners/claude.runner';
import { CodexRunner } from './runners/codex.runner';

@Module({
  imports: [PrismaModule],
  controllers: [AgentController],
  providers: [AgentService, ClaudeRunner, CodexRunner, AgyRunner],
  exports: [AgentService],
})
export class AgentModule {}
