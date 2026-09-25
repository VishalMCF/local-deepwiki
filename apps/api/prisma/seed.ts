import { PrismaClient } from '@prisma/client';
import { DEFAULT_PRESETS } from '../src/agents/presets';

const prisma = new PrismaClient();

async function main() {
  for (const preset of DEFAULT_PRESETS) {
    await prisma.agentPreset.upsert({
      where: { key: preset.key },
      update: {
        label: preset.label,
        cli: preset.cli,
        model: preset.model ?? null,
        effort: preset.effort ?? null,
        hint: preset.hint ?? null,
        order: preset.order,
        isDefault: Boolean(preset.isDefault),
      },
      create: {
        key: preset.key,
        label: preset.label,
        cli: preset.cli,
        model: preset.model ?? null,
        effort: preset.effort ?? null,
        hint: preset.hint ?? null,
        order: preset.order,
        isDefault: Boolean(preset.isDefault),
      },
    });
  }
  console.log(`seeded ${DEFAULT_PRESETS.length} agent presets`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
