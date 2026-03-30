/**
 * @module actions/mlb-division-standings
 *
 * Stream Deck key that shows **MLB division standings** from {@link fetchMlbDivisionStandingsMap}. **Key press**
 * advances to the next division (AL East → … → NL West → wrap).
 *
 * **Settings:** `divisionStandingsIndex` — `0…5` (persisted). There is no Property Inspector; cycling is the only control.
 *
 * **Refresh:** Standings are re-fetched on a fixed interval ({@link REFRESH_MS}) while the key is visible.
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

/** Poll interval while the key is shown (ms); matches stat leaders cadence. */
const REFRESH_MS = 30 * 60_000;

type MlbDivisionStandingsSettings = {
	divisionStandingsIndex?: number;
};

/** Normalizes index into `0…{@link MLB_DIVISION_STANDINGS_COUNT} - 1`. */
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

/** Clears the standings refresh timer for a key context. */
function clearRefreshTimer(context: string): void {
	const t = refreshTimers.get(context);
	if (t !== undefined) {
		clearInterval(t);
		refreshTimers.delete(context);
	}
}

/** Fetches the map, picks the division for {@link resolveDivisionStandingsIndex}, sets title or error. */
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

/** Re-fetches on {@link REFRESH_MS} using latest saved settings. */
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

/** Loads title and (re)starts refresh timer. */
async function syncDivisionStandingsKey(
	key: KeyAction<MlbDivisionStandingsSettings>,
	settings: MlbDivisionStandingsSettings,
): Promise<void> {
	await applyStandingsToKey(key, settings);
	scheduleRefresh(key, key.id);
}

/** Key UUID `com.dadstart.baseball.divisionstandings` (see manifest). */
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

	/** Stop polling when the key leaves the canvas. */
	override onWillDisappear(
		ev: WillDisappearEvent<MlbDivisionStandingsSettings>,
	): void {
		clearRefreshTimer(ev.action.id);
	}

	/** Rare: if settings are ever merged from outside (e.g. future PI). */
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
