import { GatewayDispatchEvents } from 'discord-api-types/v10';
import { ClientQuest } from './src/client';
import { sendReport, type QuestResult } from './src/report';

const startedAt = Date.now();
let currentUserId: string | null = null;

const client = new ClientQuest(process.env.TOKEN!);

const UNSUPPORTED: Record<string, string> = {
	STREAM_ON_DESKTOP: 'Стримы не поддерживаются в Node — выполни в приложении Discord',
};

client.once(GatewayDispatchEvents.Ready, async ({ data }) => {
	currentUserId = data.user.id;
	console.log(process.env.GITHUB_ACTIONS === 'true' ? 'Logged in!' : `Logged in as @${data.user.username}`);

	const results: QuestResult[] = [];
	let found = 0;
	let fatal: string | undefined;
	try {
		await client.fetchQuests(false);
		const quests = client.questManager!.filterQuestsValidToDo();
		found = quests.length;
		console.log(`Found ${found} valid quests to do.`);
		await Promise.all(
			quests.map(async (quest) => {
				const t0 = Date.now();
				const tasks = (quest as any).config?.task_config_v2?.tasks ?? {};
				const unsupported = Object.keys(UNSUPPORTED).find((k) => tasks[k]);
				try {
					await client.questManager!.doingQuest(quest);
					const ok = client.completedQuests.has(quest.id);
					results.push({
						quest,
						durationMs: Date.now() - t0,
						status: ok ? 'completed' : unsupported ? 'skipped' : 'failed',
						reason: ok ? undefined : unsupported ? UNSUPPORTED[unsupported] : client.questErrors.get(quest.id) ?? 'Квест не завершён — подробности в логе',
					});
				} catch (e: any) {
					results.push({ quest, status: 'failed', durationMs: Date.now() - t0, reason: e?.message ?? String(e) });
				}
			}),
		);
	} catch (e: any) {
		fatal = e?.message ?? String(e);
		console.error('Failed to process quests:', fatal);
	}

	await sendReport({ results, found, startedAt, userId: currentUserId, fatal });
	console.log('All quests processed. Disconnecting...');
	await client.destroy();
});

process.on('unhandledRejection', () => console.error('[Error:] Unhandled Rejection'));
process.on('uncaughtException', (error) => console.error('Uncaught Exception:', error.message));

client.connect();
