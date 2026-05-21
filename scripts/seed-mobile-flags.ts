/**
 * One-shot seed — insert the 5 mobile.* feature flags with
 * defaultValue = true so the mobile kill-switches return ON when
 * not flipped by admin.
 *
 * Why this exists:
 *   PR #9 shipped mobile-side `useFlag()` calls before the API's
 *   `FEATURE_FLAG_REGISTRY` knew about these keys. evaluateFlags()
 *   returns `false` for unregistered keys (safest off-by-default
 *   posture), which made the mobile UI hide hero / categories /
 *   country marquee on first launch.
 *
 *   This script inserts the missing rows with defaultValue=true
 *   so the API returns true → mobile renders the sections.
 *
 *   Permanent fix lives alongside this: adding these entries to
 *   `src/modules/feature-flags/registry.ts` so the on-boot seeder
 *   creates them on every fresh DB.
 *
 * Idempotent — skips rows that already exist (admin may have
 * flipped them; we don't overwrite admin work).
 *
 * Usage:
 *   railway run --service api npx tsx scripts/seed-mobile-flags.ts
 */
import { PrismaClient } from '@prisma/client';

interface MobileFlagDef {
  key: string;
  name: string;
  description: string;
  defaultValue: boolean;
}

const FLAGS: MobileFlagDef[] = [
  {
    key: 'mobile_show_hero',
    name: 'Mobile — show hero slider',
    description:
      'Kill-switch for the hero image slider at the top of the mobile Home screen. Default ON. Flip OFF as an instant kill-switch if a slide regresses or admin needs a slot empty without editing content overrides — customers immediately see Home without the hero, all other sections intact. No redeploy needed.',
    defaultValue: true,
  },
  {
    key: 'mobile_show_categories',
    name: 'Mobile — show category chip row',
    description:
      "Kill-switch for the horizontal category chip row on the mobile Home screen. Default ON. Flip OFF if the /api/categories endpoint is regressing or admin is mid-rename — customers see Home without the chips, all other sections intact.",
    defaultValue: true,
  },
  {
    key: 'mobile_show_country_marquee',
    name: 'Mobile — show country marquee',
    description:
      'Kill-switch for the "Shop by country" flag tile row on the mobile Home screen. Default ON. Flip OFF if the FEATURED_COUNTRY_CODES list needs a curation pause — customers see Home without the country row.',
    defaultValue: true,
  },
  {
    key: 'mobile_animations_enabled',
    name: 'Mobile — animations master switch',
    description:
      'Reserved for the global animation kill-switch on mobile. Default ON. Flip OFF as a perf safety valve if an animation regression hits a specific device class.',
    defaultValue: true,
  },
  {
    key: 'mobile_show_kebab_menu',
    name: 'Mobile — show PDP kebab menu',
    description:
      'Reserved for the kebab menu in the Grocery PDP hero. Default ON. Flip OFF if the share/report flow it opens regresses.',
    defaultValue: true,
  },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    let created = 0;
    let skipped = 0;
    for (const def of FLAGS) {
      const existing = await prisma.featureFlag.findUnique({
        where: { key: def.key },
        select: { key: true },
      });
      if (existing) {
        console.log(`- ${def.key} already exists, skipping`);
        skipped++;
        continue;
      }
      await prisma.featureFlag.create({
        data: {
          key: def.key,
          name: def.name,
          description: def.description,
          defaultValue: def.defaultValue,
          isActive: true,
        },
      });
      console.log(`+ Created ${def.key} (default=${def.defaultValue})`);
      created++;
    }
    console.log('');
    console.log(`Created: ${created}, skipped: ${skipped}`);
    console.log('');
    console.log('Verify:');
    console.log(
      '  curl "https://api.afrizonemart.com/api/flags?keys=mobile_show_hero,mobile_show_categories,mobile_show_country_marquee,mobile_animations_enabled,mobile_show_kebab_menu"',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
