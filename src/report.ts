import type { Quest } from './quest';

/** Discord Components V2 webhook report. */
const IS_COMPONENTS_V2 = 1 << 15;
const C = { ROW: 1, BUTTON: 2, SECTION: 9, TEXT: 10, THUMB: 11, GALLERY: 12, SEP: 14, CONTAINER: 17 } as const;
const COLOR = { OK: 0x57f287, WARN: 0xfee75c, FAIL: 0xed4245, BRAND: 0x5865f2 };

export type QuestStatus = 'completed' | 'failed' | 'skipped';
export interface QuestResult {
	quest: Quest;
	status: QuestStatus;
	reason?: string;
	durationMs: number;
}

const TASK_LABEL: Record<string, string> = {
	WATCH_VIDEO: '🎬 Просмотр видео',
	WATCH_VIDEO_ON_MOBILE: '📱 Видео (моб.)',
	PLAY_ON_DESKTOP: '🎮 Игра на ПК',
	PLAY_ON_XBOX: '🟩 Игра на Xbox',
	PLAY_ON_PLAYSTATION: '🟦 Игра на PlayStation',
	STREAM_ON_DESKTOP: '📡 Стрим',
	PLAY_ACTIVITY: '🧩 Activity',
	ACHIEVEMENT_IN_ACTIVITY: '🏆 Достижение в Activity',
};

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const esc = (s: string) => String(s ?? '').replace(/([*_`~|>\\])/g, '\\$1');

export function fmtDuration(ms: number) {
	const s = Math.max(0, Math.round(ms / 1000));
	const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
	return [h && `${h} ч`, m && `${m} мин`, `${sec} с`].filter(Boolean).join(' ');
}

function taskInfo(q: Quest) {
	const tasks = (q as any).config?.task_config_v2?.tasks ?? {};
	const key = Object.keys(TASK_LABEL).find((k) => tasks[k]) ?? Object.keys(tasks)[0];
	return { label: TASK_LABEL[key] ?? key ?? '—', target: tasks[key]?.target as number | undefined };
}

function reward(q: Quest) {
	const r = (q as any).config?.rewards_config?.rewards?.[0];
	return r?.messages?.name_with_article ?? r?.messages?.name ?? 'Награда';
}

function asset(q: Quest, name?: string) {
	if (!name) return undefined;
	if (/^https?:/.test(name)) return name;
	if (name.includes('/')) return `https://cdn.discordapp.com/${name}`;
	return `https://cdn.discordapp.com/quests/${q.id}/${name}`;
}

function isImage(url?: string) {
	return !!url && !/\.(mp4|webm|mov)(\?|$)/i.test(url);
}

function runUrl() {
	const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
	return GITHUB_REPOSITORY && GITHUB_RUN_ID
		? `${GITHUB_SERVER_URL ?? 'https://github.com'}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`
		: undefined;
}

const text = (content: string) => ({ type: C.TEXT, content: cut(content, 3900) });
const sep = (big = false) => ({ type: C.SEP, divider: true, spacing: big ? 2 : 1 });
const link = (label: string, url: string, emoji?: string) => ({
	type: C.BUTTON, style: 5, label, url, ...(emoji ? { emoji: { name: emoji } } : {}),
});

function questBlock(r: QuestResult) {
	const q: any = r.quest;
	const cfg = q.config ?? {};
	const name = esc(cfg.messages?.quest_name ?? 'Без названия');
	const game = esc(cfg.messages?.game_title ?? cfg.application?.name ?? '—');
	const { label, target } = taskInfo(r.quest);
	const exp = cfg.expires_at ? Math.floor(new Date(cfg.expires_at).getTime() / 1000) : 0;
	const icon = { completed: '✅', failed: '❌', skipped: '⏭️' }[r.status];
	const lines = [
		`### ${icon} ${name}`,
		`-# ${game}`,
		`**Тип:** ${label}${target ? ` · ${fmtDuration(target * 1000)}` : ''}`,
		`**Награда:** ${esc(reward(r.quest))}`,
		r.status === 'completed'
			? `**Время:** \`${fmtDuration(r.durationMs)}\``
			: `**Причина:** ${esc(cut(r.reason ?? 'неизвестно', 300))}`,
		exp ? `-# Истекает <t:${exp}:R>` : '',
	].filter(Boolean).join('\n');
	const thumb = asset(r.quest, cfg.assets?.game_tile ?? cfg.assets?.logotype);
	return isImage(thumb)
		? { type: C.SECTION, components: [text(lines)], accessory: { type: C.THUMB, media: { url: thumb }, description: cut(game, 100) } }
		: text(lines);
}

export interface ReportInput {
	results: QuestResult[];
	found: number;
	startedAt: number;
	userId?: string | null;
	fatal?: string;
}

export function buildReport({ results, found, startedAt, userId, fatal }: ReportInput) {
	const done = results.filter((r) => r.status === 'completed');
	const bad = results.filter((r) => r.status !== 'completed');
	const failed = results.filter((r) => r.status === 'failed').length;
	const hasErrors = !!fatal || failed > 0;
	const accent = fatal || (failed && !done.length) ? COLOR.FAIL : hasErrors || bad.length ? COLOR.WARN : done.length ? COLOR.OK : COLOR.BRAND;
	const now = Math.floor(Date.now() / 1000);
	const headline = fatal
		? '🚨 Запуск завершился с ошибкой'
		: !found ? '💤 Новых квестов нет'
		: bad.length ? '⚠️ Квесты обработаны частично' : '🎉 Все квесты выполнены';

	const inner: any[] = [text(`## Discord Quest · Отчёт\n${headline}\n-# <t:${now}:F>`)];

	const hero = done.map((r) => asset(r.quest, (r.quest as any).config?.assets?.hero)).filter(isImage).slice(0, 4) as string[];
	if (hero.length) inner.push({ type: C.GALLERY, items: hero.map((url) => ({ media: { url } })) });

	inner.push(sep(), text(
		[
			`📊 **Найдено:** \`${found}\``,
			`✅ **Выполнено:** \`${done.length}\``,
			`❌ **Ошибки:** \`${failed}\``,
			`⏭️ **Пропущено:** \`${bad.length - failed}\``,
			`⏱️ **Время работы:** \`${fmtDuration(Date.now() - startedAt)}\``,
		].join('\u2003'),
	));
	if (fatal) inner.push(sep(), text(`### 🚨 Критическая ошибка\n\`\`\`\n${cut(fatal, 1500)}\n\`\`\``));

	// Max 40 components per message — keep quest list bounded.
	const ordered = [...done, ...bad];
	const shown = ordered.slice(0, 8);
	if (done.length) inner.push(sep(true), text('### 🏅 Выполненные квесты'));
	shown.forEach((r, i) => {
		if (i === done.length && bad.length) inner.push(sep(true), text('### 🧾 Не выполнено'));
		else if (i) inner.push(sep());
		inner.push(questBlock(r));
	});
	if (ordered.length > shown.length) inner.push(text(`-# …и ещё ${ordered.length - shown.length} в логе`));

	const buttons: any[] = [link('Квесты Discord', 'https://discord.com/quest-home', '🧭')];
	const run = runUrl();
	if (run) buttons.push(link('Лог GitHub Actions', run, '📜'));
	done.slice(0, 3).forEach((r) =>
		buttons.push(link(cut((r.quest as any).config?.messages?.quest_name ?? 'Квест', 80), `https://discord.com/quests/${r.quest.id}`, '🎁')),
	);
	inner.push(sep(true), { type: C.ROW, components: buttons.slice(0, 5) });
	inner.push(text(`-# Discord Quest Bot${process.env.GITHUB_ACTIONS === 'true' ? ' · GitHub Actions' : ' · локальный запуск'}`));

	const components: any[] = [];
	const ping = hasErrors && userId;
	if (ping) components.push(text(`<@${userId}> требуется внимание`));
	components.push({ type: C.CONTAINER, accent_color: accent, components: inner });

	return {
		flags: IS_COMPONENTS_V2,
		components,
		allowed_mentions: { parse: [], users: ping ? [userId] : [] },
	};
}

export async function sendReport(input: ReportInput) {
	const url = process.env.WEBHOOK_URL;
	if (!url) return;
	const u = new URL(url);
	u.searchParams.set('with_components', 'true');
	u.searchParams.set('wait', 'true');
	const body = { username: 'Discord Quest', ...buildReport(input) };
	try {
		const res = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (!res.ok) console.error(`[Webhook] ${res.status}: ${(await res.text()).slice(0, 500)}`);
		else console.log('[Webhook] Report sent.');
	} catch (e: any) {
		console.error('[Webhook] Failed to send report:', e?.message);
	}
}
