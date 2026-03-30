/**
 * @module actions/mlb-game-score
 *
 * Stream Deck **key action** that cycles through four views for the selected team (see
 * {@link ../services/mlb-schedule.ts} {@link fetchCurrentOrNextMlbGame} and
 * {@link ../services/mlb-schedule.ts} {@link fetchMlbGameScoreCycleViews}):
 *
 * 1. **Live or next upcoming** — current live game if any; otherwise earliest game not yet live/final.
 * 2–4. **Previous three games** — most recent finals, newest first (date + scores).
 *
 * **Settings:** `team` — Stats API team id (`string` or `number`). `scoreViewIndex` — `0…3` (persisted;
 * advanced with each key press).
 *
 * **Behavior:** On appear / settings change, shows the view for the current index. **Key press** cycles
 * the index (with `setSettings` merge so `team` is preserved). Poll interval re-fetches using the saved index.
 * Team id is trimmed when persisted value differs from trimmed form.
 *
 * **Display:** {@link formatMlbCycleGameTitle} and short fallbacks (`Team?`, `—`, errors).
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

import { getMlbTeamById } from "../mlb/mlb-teams";
import {
	fetchCurrentOrNextMlbGame,
	fetchMlbGameScoreCycleViews,
	formatMlbCycleGameTitle,
} from "../services/mlb-schedule";

/** Poll interval so live / upcoming data updates without requiring a key press. */
const REFRESH_MS = 45_000;

/** Slots: upcoming, then three prior finals. */
const SCORE_VIEW_SLOT_COUNT = 4;

/**
 * Persisted per-key JSON. Keys must match Property Inspector `setting="..."` attributes where applicable.
 */
type MlbGameScoreSettings = {
	/** Stats API team id (PI may persist string or number). */
	team?: string | number;
	/** Cycle position `0…{@link SCORE_VIEW_SLOT_COUNT} - 1`; unset means `0`. */
	scoreViewIndex?: number;
};

/** Trims string form of `settings.team`; empty if missing. */
function teamIdString(settings: MlbGameScoreSettings): string {
	const raw = settings.team;
	if (raw === undefined || raw === null) {
		return "";
	}
	return String(raw).trim();
}

/** True for non-empty digit-only ids (Stats API team ids are positive integers). */
function isNumericTeamId(id: string): boolean {
	return /^\d+$/.test(id);
}

/** Abbreviation for title lines when we only have a numeric id. */
function abbrevForNumericTeamId(idNum: number, fallbackId: string): string {
	return getMlbTeamById(idNum)?.abbreviation ?? fallbackId;
}

/**
 * Key title when not showing a loaded score: `Team?` if missing/invalid id, else known abbreviation or id.
 */
function titleForMlbGameScoreSettings(settings: MlbGameScoreSettings): string {
	const id = teamIdString(settings);
	if (!id || !isNumericTeamId(id)) {
		return "Team?";
	}
	return abbrevForNumericTeamId(Number(id), id);
}

function resolveScoreViewIndex(settings: MlbGameScoreSettings): number {
	const raw = settings.scoreViewIndex ?? 0;
	const n = Math.floor(Number(raw));
	if (!Number.isFinite(n)) {
		return 0;
	}
	return ((n % SCORE_VIEW_SLOT_COUNT) + SCORE_VIEW_SLOT_COUNT) % SCORE_VIEW_SLOT_COUNT;
}

const refreshTimers = new Map<string, ReturnType<typeof setInterval>>();

function clearRefreshTimer(context: string): void {
	const t = refreshTimers.get(context);
	if (t !== undefined) {
		clearInterval(t);
		refreshTimers.delete(context);
	}
}

/**
 * Fetches the active slot’s data source, formats the title for {@link resolveScoreViewIndex}; on failure
 * logs and shows a short error title.
 */
async function applyScoreToKey(
	key: KeyAction<MlbGameScoreSettings>,
	settings: MlbGameScoreSettings,
): Promise<void> {
	const teamId = teamIdString(settings);
	if (!teamId || !isNumericTeamId(teamId)) {
		await key.setTitle(titleForMlbGameScoreSettings(settings));
		return;
	}
	const idNum = Number(teamId);
	const slot = resolveScoreViewIndex(settings);
	const abbrLine = abbrevForNumericTeamId(idNum, teamId);
	try {
		if (slot === 0) {
			const currentOrNext = await fetchCurrentOrNextMlbGame(idNum);
			if (!currentOrNext) {
				await key.setTitle(`${abbrLine}\n—`);
				return;
			}
			await key.setTitle(
				formatMlbCycleGameTitle(currentOrNext, "upcoming", idNum),
			);
			return;
		}
		const views = await fetchMlbGameScoreCycleViews(idNum);
		const past = views.recentFinals[slot - 1];
		if (!past) {
			await key.setTitle(`${abbrLine}\n—`);
			return;
		}
		await key.setTitle(formatMlbCycleGameTitle(past, "recent", idNum));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		streamDeck.logger.error(`MlbGameScore: ${message}`);
		await key.setTitle("Score\nerr");
	}
}

function scheduleRefresh(
	key: KeyAction<MlbGameScoreSettings>,
	context: string,
): void {
	clearRefreshTimer(context);
	refreshTimers.set(
		context,
		setInterval(() => {
			void key.getSettings().then((s) => applyScoreToKey(key, s));
		}, REFRESH_MS),
	);
}

/**
 * Applies score title and (re)starts the refresh timer. When `normalizePersistedTeam` is true, rewrites `team`
 * as a trimmed string if storage differed so PI and plugin stay aligned.
 */
async function syncMlbGameScoreKey(
	key: KeyAction<MlbGameScoreSettings>,
	settings: MlbGameScoreSettings,
	{ normalizePersistedTeam }: { normalizePersistedTeam: boolean },
): Promise<void> {
	let effective = settings;
	if (normalizePersistedTeam) {
		const teamId = teamIdString(settings);
		if (
			teamId &&
			isNumericTeamId(teamId) &&
			String(settings.team ?? "").trim() !== teamId
		) {
			effective = { ...settings, team: teamId };
			await key.setSettings(effective);
		}
	}
	await applyScoreToKey(key, effective);
	scheduleRefresh(key, key.id);
}

/**
 * Key action UUID `com.dadstart.baseball.gamescore` (see manifest).
 */
@action({ UUID: "com.dadstart.baseball.gamescore" })
export class MlbGameScore extends SingletonAction<MlbGameScoreSettings> {
	/** Load score when the key is shown; may normalize `team` in persisted settings. */
	override async onWillAppear(
		ev: WillAppearEvent<MlbGameScoreSettings>,
	): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		await syncMlbGameScoreKey(ev.action, ev.payload.settings, {
			normalizePersistedTeam: true,
		});
	}

	override onWillDisappear(ev: WillDisappearEvent<MlbGameScoreSettings>): void {
		clearRefreshTimer(ev.action.id);
	}

	/** Refresh after Property Inspector saves (merge-aware: do not re-normalize `team` here). */
	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<MlbGameScoreSettings>,
	): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		await syncMlbGameScoreKey(ev.action, ev.payload.settings, {
			normalizePersistedTeam: false,
		});
	}

	/**
	 * Cycles {@link MlbGameScoreSettings.scoreViewIndex}, merges settings (preserves `team`), refreshes title.
	 */
	override async onKeyDown(
		ev: KeyDownEvent<MlbGameScoreSettings>,
	): Promise<void> {
		const teamId = teamIdString(ev.payload.settings);
		if (!teamId || !isNumericTeamId(teamId)) {
			await ev.action.setTitle("Set team");
			return;
		}
		const settings = ev.payload.settings;
		const nextIdx =
			(resolveScoreViewIndex(settings) + 1) % SCORE_VIEW_SLOT_COUNT;
		const merged: MlbGameScoreSettings = {
			...settings,
			scoreViewIndex: nextIdx,
		};
		await ev.action.setSettings(merged);
		await applyScoreToKey(ev.action, merged);
		scheduleRefresh(ev.action, ev.action.id);
	}
}
