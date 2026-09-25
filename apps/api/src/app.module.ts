import { Module } from '@nestjs/common';
import { AgentModule } from './agents/agent.module';
import { ChatModule } from './chat/chat.module';
import { EventsModule } from './events/events.module';
import { FilesModule } from './files/files.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReposModule } from './repos/repos.module';
import { WikiModule } from './wiki/wiki.module';

@Module({
  imports: [PrismaModule, EventsModule, AgentModule, ReposModule, WikiModule, ChatModule, FilesModule],
})
export class AppModule {}
