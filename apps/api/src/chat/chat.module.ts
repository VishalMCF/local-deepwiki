import { Module } from '@nestjs/common';
import { AgentModule } from '../agents/agent.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReposModule } from '../repos/repos.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [PrismaModule, AgentModule, ReposModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
