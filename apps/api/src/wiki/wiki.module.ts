import { Module, forwardRef } from '@nestjs/common';
import { AgentModule } from '../agents/agent.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ReposModule } from '../repos/repos.module';
import { IndexerService } from './indexer.service';
import { WikiController } from './wiki.controller';
import { WikiService } from './wiki.service';

@Module({
  imports: [PrismaModule, AgentModule, forwardRef(() => ReposModule)],
  controllers: [WikiController],
  providers: [WikiService, IndexerService],
  exports: [WikiService, IndexerService],
})
export class WikiModule {}
