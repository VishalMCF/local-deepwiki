import { Controller, Get } from '@nestjs/common';
import { AgentService } from './agent.service';

@Controller('api/presets')
export class AgentController {
  constructor(private readonly agents: AgentService) {}

  @Get()
  list() {
    return this.agents.listPresets();
  }
}
