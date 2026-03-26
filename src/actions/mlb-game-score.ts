/**
 * @module actions/mlb-game-score
 *
 * Stream Deck **key action** that shows the score for the selected team’s current game when **Live**,
 * otherwise the most recent **Final** game in the schedule window (see {@link ../services/mlb-schedule.ts}).
 *
 * **Settings:** `team` — Stats API team id (`string` or `number` from Property Inspector).
 *
 * **Behavior:** On appear / settings change / key press (with valid team), fetches schedule and sets a
 * two-line title. A background interval re-fetches every {@link REFRESH_MS}. Team id is trimmed and
 * normalized to a string when persisted value differs (e.g. number vs string).
 *
 * **Display:** Uses `setTitle` with lines from {@link formatGameScoreTitle} or short fallbacks (`Team?`, `—`, errors).
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
	fetchTeamScorePick,
	formatGameScoreTitle,
} from "../services/mlb-schedule";

/** Poll interval so live scores update without requiring a key press. */
const REFRESH_MS = 45_000;

/**
 * Persisted per-key JSON. Keys must match Property Inspector `setting="..."` attributes.
 */
type MlbGameScoreSettings = {
	/** Stats API team id (PI may persist string or number). */
	team?: string | number;
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

const refreshTimers = new Map<string, ReturnType<typeof setInterval>>();

function clearRefreshTimer(context: string): void {
	const t = refreshTimers.get(context);
	if (t !== undefined) {
		clearInterval(t);
		refreshTimers.delete(context);
	}
}

/**
 * Fetches schedule, sets title from {@link formatGameScoreTitle} or fallbacks; on failure logs and shows a short error title.
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
	try {
		const pick = await fetchTeamScorePick(idNum);
		if (pick.kind === "none") {
			await key.setTitle(`${abbrevForNumericTeamId(idNum, teamId)}\n—`);
			return;
		}
		await key.setTitle(formatGameScoreTitle(pick.game));
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

	override async onKeyDown(
		ev: KeyDownEvent<MlbGameScoreSettings>,
	): Promise<void> {
		const teamId = teamIdString(ev.payload.settings);
		if (!teamId || !isNumericTeamId(teamId)) {
			await ev.action.setTitle("Set team");
			return;
		}
		await syncMlbGameScoreKey(ev.action, ev.payload.settings, {
			normalizePersistedTeam: false,
		});
	}
}
