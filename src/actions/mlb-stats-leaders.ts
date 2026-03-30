/**
 * @module actions/mlb-stats-leaders
 *
 * Stream Deck key that shows **MLB stat leaders** ({@link fetchMlbStatLeaders} → Stats API `/api/v1/stats/leaders`).
 * **Key press** cycles league scope: MLB → AL → NL → MLB (see {@link LEAGUE_CYCLE}).
 *
 * **Settings:** `leaderStatKey`, `leaderLeagueScope`, `leaderRowCount`, `leaderSeason` — Property Inspector
 * `mlb-stats-leaders.html`. Default row count matches PI (`3`); see {@link DEFAULT_ROW_COUNT}.
 *
 * **Refresh:** {@link REFRESH_MS} while the key is visible.
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
/** Used when `leaderRowCount` is missing or invalid; must stay aligned with PI default. */
const DEFAULT_ROW_COUNT = 3;
const MIN_ROW_COUNT = 3;
const MAX_ROW_COUNT = 7;

/** Order for key-press cycling; values are persisted as `leaderLeagueScope`. */
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

/** Maps PI / stored strings to API scope; accepts Stats API league ids `103` / `104`. */
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

/** Clamps to {@link MIN_ROW_COUNT}…{@link MAX_ROW_COUNT}; invalid / empty → {@link DEFAULT_ROW_COUNT}. */
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

/** Four-digit year enables API `season` query and a short year suffix on the title. */
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

/** Next scope in {@link LEAGUE_CYCLE}; unknown current falls through to `"al"`. */
function nextLeagueScope(
	current: MlbStatLeadersLeagueScope,
): MlbStatLeadersLeagueScope {
	const i = LEAGUE_CYCLE.indexOf(current);
	if (i < 0) {
		return "al";
	}
	return LEAGUE_CYCLE[(i + 1) % LEAGUE_CYCLE.length]!;
}

/** One refresh interval per Stream Deck key `context` id. */
const refreshTimers = new Map<string, ReturnType<typeof setInterval>>();

function clearRefreshTimer(context: string): void {
	const t = refreshTimers.get(context);
	if (t !== undefined) {
		clearInterval(t);
		refreshTimers.delete(context);
	}
}

/** Fetches leaders for resolved settings and sets the key title (or error). */
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

/** Re-fetches on {@link REFRESH_MS} using latest saved settings. */
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

/** Key UUID `com.dadstart.baseball.statsleaders` (see manifest). */
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

	/** Stop polling when the key leaves the canvas. */
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

	/** Persist {@link nextLeagueScope} and refresh. */
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
