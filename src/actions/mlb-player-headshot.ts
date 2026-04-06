/**
 * @module actions/mlb-player-headshot
 *
 * Stream Deck key action that renders an MLB player headshot.
 *
 * Settings are written by Property Inspector `mlb-player-headshot.html`:
 * - `team` (MLB Stats API team id)
 * - `playerId` (MLB Stats API person id)
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

import { getMlbTeamById, isNumericTeamId, teamIdString } from "../mlb/mlb-teams";
import {
	clearMlbPlayerHeadshotCache,
	fetchMlbPlayerHeadshotDataUrl,
	isNumericPlayerId,
	playerIdString,
} from "../services/mlb-headshots";
import {
	clearMlbTeamRosterCache,
	fetchMlbTeamActiveRoster,
} from "../services/mlb-roster";

type MlbPlayerHeadshotSettings = {
	/** Stats API team id (PI may persist string or number). */
	team?: string | number;
	/** Stats API person id (PI may persist string or number). */
	playerId?: string | number;
	/** Updated by Property Inspector cache-clear button; used to trigger cache invalidation in plugin. */
	cacheClearToken?: string | number;
	/** Property Inspector toggle: enables automatic roster cycling while key is visible. */
	autoCycleEnabled?: string | boolean;
	/** Auto-cycle interval in seconds (PI writes string values). */
	autoCycleIntervalSeconds?: string | number;
};

let lastCacheClearToken = "";
const DEFAULT_AUTO_CYCLE_SECONDS = 10;
const MIN_AUTO_CYCLE_SECONDS = 3;
const MAX_AUTO_CYCLE_SECONDS = 120;
const autoCycleTimers = new Map<string, ReturnType<typeof setInterval>>();

/** Key title when we cannot render a valid headshot yet. */
function titleForHeadshotSettings(settings: MlbPlayerHeadshotSettings): string {
	const teamId = teamIdString(settings.team);
	if (!teamId || !isNumericTeamId(teamId)) {
		return "Team?";
	}
	const playerId = playerIdString(settings.playerId);
	if (!playerId || !isNumericPlayerId(playerId)) {
		const abbr = getMlbTeamById(Number(teamId))?.abbreviation ?? teamId;
		return `${abbr}\nPlayer?`;
	}
	return "";
}

function isAutoCycleEnabled(settings: MlbPlayerHeadshotSettings): boolean {
	const raw = String(settings.autoCycleEnabled ?? "").trim().toLowerCase();
	return raw === "true" || raw === "1" || settings.autoCycleEnabled === true;
}

function resolveAutoCycleSeconds(settings: MlbPlayerHeadshotSettings): number {
	const raw = String(settings.autoCycleIntervalSeconds ?? "").trim();
	if (raw === "") {
		return DEFAULT_AUTO_CYCLE_SECONDS;
	}
	const n = Math.floor(Number(raw));
	if (!Number.isFinite(n)) {
		return DEFAULT_AUTO_CYCLE_SECONDS;
	}
	return Math.max(MIN_AUTO_CYCLE_SECONDS, Math.min(MAX_AUTO_CYCLE_SECONDS, n));
}

function clearAutoCycleTimer(context: string): void {
	const timer = autoCycleTimers.get(context);
	if (timer !== undefined) {
		clearInterval(timer);
		autoCycleTimers.delete(context);
	}
}

async function cycleToNextRosterPlayer(
	key: KeyAction<MlbPlayerHeadshotSettings>,
	settings: MlbPlayerHeadshotSettings,
): Promise<void> {
	const teamId = teamIdString(settings.team);
	if (!teamId || !isNumericTeamId(teamId)) {
		await key.setTitle("Set team");
		return;
	}

	try {
		const roster = await fetchMlbTeamActiveRoster(Number(teamId));
		if (roster.length === 0) {
			await key.setTitle("No\nroster");
			return;
		}

		const currentPlayerId = playerIdString(settings.playerId);
		const currentIndex = roster.findIndex(
			(p) => String(p.id) === currentPlayerId,
		);
		const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % roster.length;
		const nextPlayerId = String(roster[nextIndex]!.id);

		const merged: MlbPlayerHeadshotSettings = {
			...settings,
			playerId: nextPlayerId,
		};
		await key.setSettings(merged);
		await updateHeadshotKeyForSettings(key, merged, {
			normalizePersistedIds: false,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		streamDeck.logger.error(`MlbPlayerHeadshot: failed to cycle player: ${message}`);
		await key.setTitle("Roster\nerr");
	}
}

function scheduleAutoCycleForKey(
	key: KeyAction<MlbPlayerHeadshotSettings>,
	settings: MlbPlayerHeadshotSettings,
): void {
	clearAutoCycleTimer(key.id);
	if (!isAutoCycleEnabled(settings)) {
		return;
	}
	const intervalMs = resolveAutoCycleSeconds(settings) * 1000;
	autoCycleTimers.set(
		key.id,
		setInterval(() => {
			void key.getSettings().then((latest) => cycleToNextRosterPlayer(key, latest));
		}, intervalMs),
	);
}

/**
 * Updates key image/title from settings. When `normalizePersistedIds` is true, rewrites `team` and
 * `playerId` as trimmed strings if the stored values differ.
 */
async function updateHeadshotKeyForSettings(
	key: KeyAction<MlbPlayerHeadshotSettings>,
	settings: MlbPlayerHeadshotSettings,
	{ normalizePersistedIds }: { normalizePersistedIds: boolean },
): Promise<void> {
	let effective = settings;
	const teamId = teamIdString(effective.team);
	const playerId = playerIdString(effective.playerId);

	if (
		normalizePersistedIds &&
		(
			String(effective.team ?? "").trim() !== teamId ||
			String(effective.playerId ?? "").trim() !== playerId
		)
	) {
		effective = {
			...effective,
			team: teamId,
			playerId: playerId,
		};
		await key.setSettings(effective);
	}

	const cacheClearToken = String(effective.cacheClearToken ?? "").trim();
	if (cacheClearToken !== "" && cacheClearToken !== lastCacheClearToken) {
		clearMlbPlayerHeadshotCache();
		clearMlbTeamRosterCache();
		lastCacheClearToken = cacheClearToken;
		streamDeck.logger.info("MlbPlayerHeadshot: cleared roster/headshot caches");
	}

	if (
		!teamId ||
		!isNumericTeamId(teamId) ||
		!playerId ||
		!isNumericPlayerId(playerId)
	) {
		await key.setTitle(titleForHeadshotSettings(effective));
		scheduleAutoCycleForKey(key, effective);
		return;
	}

	try {
		const imageDataUrl = await fetchMlbPlayerHeadshotDataUrl(playerId);
		await key.setImage(imageDataUrl);
		await key.setTitle("");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		streamDeck.logger.error(`MlbPlayerHeadshot: ${message}`);
		await key.setTitle("Headshot\nerr");
	}

	scheduleAutoCycleForKey(key, effective);
}

/** Key action UUID `com.dadstart.baseball.playerheadshot` (see manifest). */
@action({ UUID: "com.dadstart.baseball.playerheadshot" })
export class MlbPlayerHeadshot extends SingletonAction<MlbPlayerHeadshotSettings> {
	override async onWillAppear(
		ev: WillAppearEvent<MlbPlayerHeadshotSettings>,
	): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		await updateHeadshotKeyForSettings(ev.action, ev.payload.settings, {
			normalizePersistedIds: true,
		});
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<MlbPlayerHeadshotSettings>,
	): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		await updateHeadshotKeyForSettings(ev.action, ev.payload.settings, {
			normalizePersistedIds: false,
		});
	}

	override onWillDisappear(ev: WillDisappearEvent<MlbPlayerHeadshotSettings>): void {
		clearAutoCycleTimer(ev.action.id);
	}

	/** Key press re-renders from latest saved settings. */
	override async onKeyDown(
		ev: KeyDownEvent<MlbPlayerHeadshotSettings>,
	): Promise<void> {
		await cycleToNextRosterPlayer(ev.action, ev.payload.settings);
	}
}
