/**
 * @module actions/mlb-team-logo
 *
 * Stream Deck **key action** that shows MLB team logos from {@link ../services/mlb-logos.ts}.
 *
 * **Settings** (Property Inspector `mlb-team-logo.html`):
 * - `team` — Stats API team id (`string` or `number` from sdpi-components).
 * - `logoVariant` — one of {@link MlbLogoVariant} values.
 *
 * **Behavior:** On appear / settings change, loads the logo for the current variant. Each key press
 * advances `logoVariant` in a fixed cycle (must merge full settings on `setSettings` so `team` is not dropped).
 *
 * **Display:** Uses `setImage` with an SVG data URL per Elgato SDK guidance; clears title when the logo shows.
 */

import streamDeck, {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	type KeyAction,
} from "@elgato/streamdeck";

import { getMlbTeamById } from "../mlb/mlb-teams";
import {
	DEFAULT_MLB_LOGO_VARIANT,
	fetchMlbTeamLogoSvg,
	MlbLogoVariant,
	mlbTeamLogoUrl,
} from "../services/mlb-logos";

/** Press order for cycling; matches `Object.values` order of {@link MlbLogoVariant} and PI `<option>` order. */
const LOGO_VARIANT_CYCLE: readonly MlbLogoVariant[] =
	Object.values(MlbLogoVariant) as MlbLogoVariant[];

const KNOWN_LOGO_VARIANTS = new Set<string>(LOGO_VARIANT_CYCLE);

/**
 * Persisted per-key JSON. Keys must match Property Inspector `setting="..."` attributes.
 */
type MlbLogoSettings = {
	/** Stats API team id (PI may persist string or number). */
	team?: string | number;
	logoVariant?: MlbLogoVariant;
};

/** Trims string form of `settings.team`; empty if missing. */
function teamIdString(settings: MlbLogoSettings): string {
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

/**
 * Key title when not showing a loaded logo: abbreviation from {@link getMlbTeamById}, or fallbacks.
 */
function titleForMlbLogoSettings(settings: MlbLogoSettings): string {
	const id = teamIdString(settings);
	if (!id || !isNumericTeamId(id)) {
		return "Team?";
	}
	return getMlbTeamById(Number(id))?.abbreviation ?? id;
}

/** Maps stored string to a known variant, else {@link DEFAULT_MLB_LOGO_VARIANT}. */
function resolveLogoVariant(value: string | undefined): MlbLogoVariant {
	if (value !== undefined && KNOWN_LOGO_VARIANTS.has(value)) {
		return value as MlbLogoVariant;
	}
	return DEFAULT_MLB_LOGO_VARIANT;
}

/** Next variant in {@link LOGO_VARIANT_CYCLE} (wraps). Unknown current falls back to index 0 then advances. */
function nextCycledLogoVariant(current: MlbLogoVariant): MlbLogoVariant {
	const i = LOGO_VARIANT_CYCLE.indexOf(current);
	const idx = i === -1 ? 0 : (i + 1) % LOGO_VARIANT_CYCLE.length;
	return LOGO_VARIANT_CYCLE[idx];
}

/** Encodes SVG for Stream Deck `setImage` (SDK recommends `data:image/svg+xml` + `encodeURIComponent`). */
function svgDataUrlForStreamDeck(svg: string): string {
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Fetches SVG from CDN, pushes to the key, clears title; on failure logs and sets a short error title.
 */
async function applyMlbTeamLogoToKey(
	key: KeyAction<MlbLogoSettings>,
	teamId: string,
	variant: MlbLogoVariant,
): Promise<void> {
	const url = mlbTeamLogoUrl(teamId, variant);
	try {
		const svg = await fetchMlbTeamLogoSvg(teamId, variant, {
			onUnexpectedContentType: (contentType) =>
				streamDeck.logger.warn(
					`Unexpected Content-Type for logo: ${contentType}`,
				),
		});
		await key.setImage(svgDataUrlForStreamDeck(svg));
		await key.setTitle("");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		streamDeck.logger.error(`MlbTeamLogo: failed to load ${url}: ${message}`);
		await key.setTitle("Logo err");
	}
}

/**
 * Updates image/title from settings. When `normalizePersistedTeam` is true, rewrites `team` as a trimmed
 * string if the stored value differed (e.g. number vs string) so PI and plugin stay aligned.
 */
async function updateKeyForSettings(
	key: KeyAction<MlbLogoSettings>,
	settings: MlbLogoSettings,
	{ normalizePersistedTeam }: { normalizePersistedTeam: boolean },
): Promise<void> {
	const teamId = teamIdString(settings);
	if (!teamId || !isNumericTeamId(teamId)) {
		await key.setTitle(titleForMlbLogoSettings(settings));
		return;
	}
	if (
		normalizePersistedTeam &&
		String(settings.team ?? "").trim() !== teamId
	) {
		await key.setSettings({ ...settings, team: teamId });
	}
	await applyMlbTeamLogoToKey(
		key,
		teamId,
		resolveLogoVariant(settings.logoVariant),
	);
}

/**
 * Key action UUID `com.dadstart.baseball.teamlogo` (see manifest).
 */
@action({ UUID: "com.dadstart.baseball.teamlogo" })
export class MlbTeamLogo extends SingletonAction<MlbLogoSettings> {
	/** Load or refresh logo when the key is shown; may normalize `team` in persisted settings. */
	override async onWillAppear(
		ev: WillAppearEvent<MlbLogoSettings>,
	): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		await updateKeyForSettings(ev.action, ev.payload.settings, {
			normalizePersistedTeam: true,
		});
	}

	/** Refresh after Property Inspector saves (merge-aware: do not re-normalize `team` here). */
	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<MlbLogoSettings>,
	): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		await updateKeyForSettings(ev.action, ev.payload.settings, {
			normalizePersistedTeam: false,
		});
	}

	/**
	 * Cycles `logoVariant`, merges settings (preserves `team`), fetches and displays the next logo.
	 */
	override async onKeyDown(
		ev: KeyDownEvent<MlbLogoSettings>,
	): Promise<void> {
		const settings = ev.payload.settings;
		const teamId = teamIdString(settings);
		if (!teamId || !isNumericTeamId(teamId)) {
			await ev.action.setTitle("Set team id");
			streamDeck.logger.warn(
				`MlbTeamLogo: settings.team must be a numeric MLB team id (e.g. 147). Current value: ${teamId}`,
			);
			return;
		}

		const variant = nextCycledLogoVariant(
			resolveLogoVariant(settings.logoVariant),
		);
		await ev.action.setSettings({ ...settings, logoVariant: variant });
		await applyMlbTeamLogoToKey(ev.action, teamId, variant);
	}
}
