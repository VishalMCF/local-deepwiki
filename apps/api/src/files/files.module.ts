import { Module } from '@nestjs/common';
import { ReposModule } from '../repos/repos.module';
import { FilesController } from './files.controller';

@Module({
  imports: [ReposModule],
  controllers: [FilesController],
})
export class FilesModule {}
