/**
 * @module actions/mlb-division-standings
 *
 * Stream Deck key that shows **MLB division standings** (Stats API). **Key press**
 * advances to the next division (AL East → … → NL West → wrap).
 *
 * **Settings:** `divisionStandingsIndex` — `0…5` (persisted).
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
	MLB_DIVISION_STANDINGS_COUNT,
	fetchMlbDivisionStandingsMap,
	formatMlbDivisionStandingsTitle,
	divisionStandingsBlock,
} from "../services/mlb-standings";

const REFRESH_MS = 60_000;

type MlbDivisionStandingsSettings = {
	divisionStandingsIndex?: number;
};

function resolveDivisionStandingsIndex(
	settings: MlbDivisionStandingsSettings,
): number {
	const raw = settings.divisionStandingsIndex ?? 0;
	const n = Math.floor(Number(raw));
	if (!Number.isFinite(n)) {
		return 0;
	}
	return (
		((n % MLB_DIVISION_STANDINGS_COUNT) + MLB_DIVISION_STANDINGS_COUNT) %
		MLB_DIVISION_STANDINGS_COUNT
	);
}

const refreshTimers = new Map<string, ReturnType<typeof setInterval>>();

function clearRefreshTimer(context: string): void {
	const t = refreshTimers.get(context);
	if (t !== undefined) {
		clearInterval(t);
		refreshTimers.delete(context);
	}
}

async function applyStandingsToKey(
	key: KeyAction<MlbDivisionStandingsSettings>,
	settings: MlbDivisionStandingsSettings,
): Promise<void> {
	const idx = resolveDivisionStandingsIndex(settings);
	try {
		const map = await fetchMlbDivisionStandingsMap();
		const block = divisionStandingsBlock(map, idx);
		if (!block) {
			await key.setTitle("Standings\n—");
			return;
		}
		await key.setTitle(formatMlbDivisionStandingsTitle(block));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		streamDeck.logger.error(`MlbDivisionStandings: ${message}`);
		await key.setTitle("Standings\nerr");
	}
}

function scheduleRefresh(
	key: KeyAction<MlbDivisionStandingsSettings>,
	context: string,
): void {
	clearRefreshTimer(context);
	refreshTimers.set(
		context,
		setInterval(() => {
			void key.getSettings().then((s) => applyStandingsToKey(key, s));
		}, REFRESH_MS),
	);
}

async function syncDivisionStandingsKey(
	key: KeyAction<MlbDivisionStandingsSettings>,
	settings: MlbDivisionStandingsSettings,
): Promise<void> {
	await applyStandingsToKey(key, settings);
	scheduleRefresh(key, key.id);
}

@action({ UUID: "com.dadstart.baseball.divisionstandings" })
export class MlbDivisionStandings extends SingletonAction<MlbDivisionStandingsSettings> {
	override async onWillAppear(
		ev: WillAppearEvent<MlbDivisionStandingsSettings>,
	): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		await syncDivisionStandingsKey(ev.action, ev.payload.settings);
	}

	override onWillDisappear(
		ev: WillDisappearEvent<MlbDivisionStandingsSettings>,
	): void {
		clearRefreshTimer(ev.action.id);
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<MlbDivisionStandingsSettings>,
	): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		await syncDivisionStandingsKey(ev.action, ev.payload.settings);
	}

	override async onKeyDown(
		ev: KeyDownEvent<MlbDivisionStandingsSettings>,
	): Promise<void> {
		const settings = ev.payload.settings;
		const nextIdx =
			(resolveDivisionStandingsIndex(settings) + 1) %
			MLB_DIVISION_STANDINGS_COUNT;
		const merged: MlbDivisionStandingsSettings = {
			...settings,
			divisionStandingsIndex: nextIdx,
		};
		await ev.action.setSettings(merged);
		await applyStandingsToKey(ev.action, merged);
		scheduleRefresh(ev.action, ev.action.id);
	}
}
