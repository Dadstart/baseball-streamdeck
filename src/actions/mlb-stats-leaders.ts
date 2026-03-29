/**
 * @module actions/mlb-stats-leaders
 *
 * Stream Deck key that shows **MLB stat leaders** (Stats API `/api/v1/stats/leaders`). **Key press**
 * cycles league scope: MLB → AL → NL → MLB.
 *
 * **Settings:** `leaderStatKey`, `leaderLeagueScope`, `leaderRowCount`, `leaderSeason`
 * — see Property Inspector `mlb-stats-leaders.html`. Refetch interval is fixed at 30 minutes.
 */

import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	WillDisappearEvent,
	type KeyAction,
} from "@elgato/streamdeck";

import {
	type MlbStatLeadersLeagueScope,
	fetchMlbStatLeaders,
	formatMlbStatLeadersTitle,
	parseLeaderStatKey,
} from "../services/mlb-leaders";

const REFRESH_MS = 30 * 60_000;
const DEFAULT_ROW_COUNT = 4;
const MIN_ROW_COUNT = 3;
const MAX_ROW_COUNT = 7;

const LEAGUE_CYCLE: readonly MlbStatLeadersLeagueScope[] = [
	"mlb",
	"al",
	"nl",
] as const;

type MlbStatsLeadersSettings = {
	leaderStatKey?: string;
	leaderLeagueScope?: string;
	leaderRowCount?: number | string;
	/** Four-digit season, or empty for current. */
	leaderSeason?: string;
};

function resolveLeagueScope(raw: string | undefined): MlbStatLeadersLeagueScope {
	const t = (raw ?? "").trim().toLowerCase();
	if (t === "al" || t === "103") {
		return "al";
	}
	if (t === "nl" || t === "104") {
		return "nl";
	}
	return "mlb";
}

function resolveRowCount(settings: MlbStatsLeadersSettings): number {
	const raw = settings.leaderRowCount;
	if (raw === undefined || raw === null) {
		return DEFAULT_ROW_COUNT;
	}
	const s = String(raw).trim();
	if (s === "") {
		return DEFAULT_ROW_COUNT;
	}
	const n = Math.floor(Number(s));
	if (!Number.isFinite(n)) {
		return DEFAULT_ROW_COUNT;
	}
	return Math.min(MAX_ROW_COUNT, Math.max(MIN_ROW_COUNT, n));
}

function resolveSeason(settings: MlbStatsLeadersSettings): {
	season: string | undefined;
	showInTitle: boolean;
} {
	const t = (settings.leaderSeason ?? "").trim();
	if (t === "") {
		return { season: undefined, showInTitle: false };
	}
	if (/^\d{4}$/.test(t)) {
		return { season: t, showInTitle: true };
	}
	return { season: undefined, showInTitle: false };
}

function nextLeagueScope(
	current: MlbStatLeadersLeagueScope,
): MlbStatLeadersLeagueScope {
	const i = LEAGUE_CYCLE.indexOf(current);
	if (i < 0) {
		return "al";
	}
	return LEAGUE_CYCLE[(i + 1) % LEAGUE_CYCLE.length]!;
}

const refreshTimers = new Map<string, ReturnType<typeof setInterval>>();

function clearRefreshTimer(context: string): void {
	const t = refreshTimers.get(context);
	if (t !== undefined) {
		clearInterval(t);
		refreshTimers.delete(context);
	}
}

async function applyLeadersToKey(
	key: KeyAction<MlbStatsLeadersSettings>,
	settings: MlbStatsLeadersSettings,
): Promise<void> {
	const { statGroup, leaderCategory } = parseLeaderStatKey(
		settings.leaderStatKey,
	);
	const leagueScope = resolveLeagueScope(settings.leaderLeagueScope);
	const rowCount = resolveRowCount(settings);
	const { season, showInTitle } = resolveSeason(settings);

	try {
		const block = await fetchMlbStatLeaders({
			statGroup,
			leaderCategory,
			leagueScope,
			season,
			showSeasonInTitle: showInTitle,
			rowCount,
		});
		await key.setTitle(formatMlbStatLeadersTitle(block));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		streamDeck.logger.error(`MlbStatsLeaders: ${message}`);
		await key.setTitle("Leaders\nerr");
	}
}

function scheduleRefresh(
	key: KeyAction<MlbStatsLeadersSettings>,
	context: string,
): void {
	clearRefreshTimer(context);
	refreshTimers.set(
		context,
		setInterval(() => {
			void key.getSettings().then((s) => applyLeadersToKey(key, s));
		}, REFRESH_MS),
	);
}

async function syncLeadersKey(
	key: KeyAction<MlbStatsLeadersSettings>,
	settings: MlbStatsLeadersSettings,
): Promise<void> {
	await applyLeadersToKey(key, settings);
	scheduleRefresh(key, key.id);
}

@action({ UUID: "com.dadstart.baseball.statsleaders" })
export class MlbStatsLeaders extends SingletonAction<MlbStatsLeadersSettings> {
	override async onWillAppear(
		ev: WillAppearEvent<MlbStatsLeadersSettings>,
	): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		await syncLeadersKey(ev.action, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<MlbStatsLeadersSettings>): void {
		clearRefreshTimer(ev.action.id);
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<MlbStatsLeadersSettings>,
	): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		await syncLeadersKey(ev.action, ev.payload.settings);
	}

	override async onKeyDown(
		ev: KeyDownEvent<MlbStatsLeadersSettings>,
	): Promise<void> {
		const settings = ev.payload.settings;
		const current = resolveLeagueScope(settings.leaderLeagueScope);
		const nextScope = nextLeagueScope(current);
		const merged: MlbStatsLeadersSettings = {
			...settings,
			leaderLeagueScope: nextScope,
		};
		await ev.action.setSettings(merged);
		await syncLeadersKey(ev.action, merged);
	}
}
