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
};

let lastCacheClearToken = "";

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

	/** Key press re-renders from latest saved settings. */
	override async onKeyDown(
		ev: KeyDownEvent<MlbPlayerHeadshotSettings>,
	): Promise<void> {
		const settings = ev.payload.settings;
		const teamId = teamIdString(settings.team);
		if (!teamId || !isNumericTeamId(teamId)) {
			await ev.action.setTitle("Set team");
			return;
		}

		try {
			const roster = await fetchMlbTeamActiveRoster(Number(teamId));
			if (roster.length === 0) {
				await ev.action.setTitle("No\nroster");
				return;
			}

			const currentPlayerId = playerIdString(settings.playerId);
			const currentIndex = roster.findIndex(
				(p) => String(p.id) === currentPlayerId,
			);
			const nextIndex =
				currentIndex < 0 ? 0 : (currentIndex + 1) % roster.length;
			const nextPlayerId = String(roster[nextIndex]!.id);

			const merged: MlbPlayerHeadshotSettings = {
				...settings,
				playerId: nextPlayerId,
			};
			await ev.action.setSettings(merged);
			await updateHeadshotKeyForSettings(ev.action, merged, {
				normalizePersistedIds: false,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			streamDeck.logger.error(`MlbPlayerHeadshot: failed to cycle player: ${message}`);
			await ev.action.setTitle("Roster\nerr");
		}
	}
}
