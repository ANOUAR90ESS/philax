/**
 * Operational entry point bundled with the API: `node dist/ops.js migrate|seed`.
 * Lets a deployment run migrations and load the curated seed without dev tooling.
 */
import { loadDotEnv, loadEnv } from '@philax/config';
import { CHARACTER_STYLES } from '@philax/media';
import {
  CharacterMediaService,
  ElevenLabsVoiceProvider,
  HeyGenVideoAvatarProvider,
  JoggAIVideoAvatarProvider,
  LiveAvatarProvider,
  MediaProfileRepository,
  runMediaCommand,
} from '@philax/media-service';
import {
  loadSeed,
  migrate,
  MIGRATIONS_DIR,
  PoolDb,
  readMigrations,
  readSeedData,
  SEEDS_DIR,
} from '@philax/database';

loadDotEnv();
const env = loadEnv();
const command = process.argv[2];
const db = new PoolDb(env.DATABASE_URL, { max: 1 });
try {
  if (command === 'migrate') {
    const r = await migrate(db, await readMigrations(MIGRATIONS_DIR));
    console.info(`[ops] migrations applied: ${r.applied.join(', ') || 'none'}`);
  } else if (command === 'seed') {
    const r = await loadSeed(db, await readSeedData(SEEDS_DIR));
    console.info(
      `[ops] seed: ${r.characters} characters, ${r.chunks} chunks (${r.retiredChunks} retired)`,
    );
    const briefs = await new MediaProfileRepository(db).syncBriefs(CHARACTER_STYLES);
    console.info(`[ops] media identity briefs: ${briefs.length}`);
  } else if (command?.startsWith('media:')) {
    const repository = new MediaProfileRepository(db);
    const elevenlabs = new ElevenLabsVoiceProvider({
      apiKey: env.ELEVENLABS_API_KEY,
      modelId: env.ELEVENLABS_MODEL_ID,
    });
    const avatar =
      env.MEDIA_AVATAR_MODE === 'live'
        ? new LiveAvatarProvider({ apiKey: env.LIVEAVATAR_API_KEY })
        : env.MEDIA_AVATAR_MODE === 'video'
          ? env.MEDIA_VIDEO_AVATAR_PROVIDER === 'joggai'
            ? new JoggAIVideoAvatarProvider({ apiKey: env.JOGGAI_API_KEY })
            : new HeyGenVideoAvatarProvider({ apiKey: env.HEYGEN_API_KEY })
          : null;
    const service = new CharacterMediaService({
      repository,
      voice: elevenlabs,
      avatar,
      voiceModel: env.ELEVENLABS_MODEL_ID,
    });
    process.exitCode = await runMediaCommand(command, process.argv.slice(3), {
      repository,
      service,
      elevenlabs,
      log: (line) => console.info(line),
    });
  } else {
    console.error(
      'usage: node dist/ops.js <migrate|seed|media:sync|media:configure|media:verify|media:design-voice>',
    );
    process.exitCode = 2;
  }
} finally {
  await db.close();
}
