import {
	action,
	DidReceiveSettingsEvent,
	KeyDownEvent,
	SingletonAction,
	WillAppearEvent,
	type KeyAction,
} from "@elgato/streamdeck";
import streamDeck from "@elgato/streamdeck";

import { getMlbTeamById } from "../mlb-teams";

/** Base URL for SVGs: `…/team-logos/{variant}/{teamId}.svg` */
const MLB_TEAM_LOGOS_BASE = "https://www.mlbstatic.com/team-logos";

export const MlbLogoVariant = {
	TeamCapOnDark: "team-cap-on-dark",
	TeamCapOnLight: "team-cap-on-light",
	TeamPrimaryOnDark: "team-primary-on-dark",
	TeamPrimaryOnLight: "team-primary-on-light",
} as const;

export type MlbLogoVariant =
	(typeof MlbLogoVariant)[keyof typeof MlbLogoVariant];

const DEFAULT_LOGO_VARIANT = MlbLogoVariant.TeamCapOnDark;

/** Key-press order; matches Property Inspector options top-to-bottom. */
const LOGO_VARIANT_CYCLE: readonly MlbLogoVariant[] = [
	MlbLogoVariant.TeamCapOnDark,
	MlbLogoVariant.TeamCapOnLight,
	MlbLogoVariant.TeamPrimaryOnDark,
	MlbLogoVariant.TeamPrimaryOnLight,
];

function nextCycledLogoVariant(current: MlbLogoVariant): MlbLogoVariant {
	const i = LOGO_VARIANT_CYCLE.indexOf(current);
	const idx = i === -1 ? 0 : (i + 1) % LOGO_VARIANT_CYCLE.length;
	return LOGO_VARIANT_CYCLE[idx];
}

/**
 * Settings for {@link MlbTeamLogo}.
 * `team` should be the MLB Stats API numeric team id (e.g. `"147"` for Yankees).
 */
type MlbLogoSettings = {
	team?: string | number;
	logoVariant?: MlbLogoVariant;
};

/** Normalize persisted `team` (PI may send string or number). */
function teamIdString(settings: MlbLogoSettings): string {
	const raw = settings.team;
	if (raw === undefined || raw === null) {
		return "";
	}
	return String(raw).trim();
}

function titleForMlbLogoSettings(settings: MlbLogoSettings): string {
	const teamIdStr = teamIdString(settings);
	if (!teamIdStr || !/^\d+$/.test(teamIdStr)) {
		return "Team?";
	}
	const id = Number(teamIdStr);
	const meta = getMlbTeamById(id);
	return meta?.abbreviation ?? teamIdStr;
}

function resolveLogoVariant(
	value: string | undefined,
): MlbLogoVariant {
	if (
		value !== undefined &&
		(Object.values(MlbLogoVariant) as string[]).includes(value)
	) {
		return value as MlbLogoVariant;
	}
	return DEFAULT_LOGO_VARIANT;
}

function mlbTeamLogoUrl(teamId: string, variant: MlbLogoVariant): string {
	return `${MLB_TEAM_LOGOS_BASE}/${variant}/${teamId}.svg`;
}

async function fetchMlbLogoSvg(url: string): Promise<string> {
	const res = await fetch(url, {
		headers: { Accept: "image/svg+xml,*/*" },
	});
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} for ${url}`);
	}
	const contentType = res.headers.get("content-type") ?? "";
	if (!contentType.includes("svg") && !contentType.includes("text")) {
		streamDeck.logger.warn(
			`Unexpected Content-Type for logo: ${contentType}`,
		);
	}
	return res.text();
}

/** Data URL form required by Stream Deck for dynamic SVGs (see SDK keys guide). */
function svgDataUrlForStreamDeck(svg: string): string {
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

async function applyMlbTeamLogoToKey(
	key: KeyAction<MlbLogoSettings>,
	teamId: string,
	variant: MlbLogoVariant,
): Promise<void> {
	const url = mlbTeamLogoUrl(teamId, variant);
	try {
		const svg = await fetchMlbLogoSvg(url);
		await key.setImage(svgDataUrlForStreamDeck(svg));
		await key.setTitle("");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		streamDeck.logger.error(`MlbTeamLogo: failed to load ${url}: ${message}`);
		await key.setTitle("Logo err");
	}
}

/**
 * Shows the selected MLB team logo (SVG from mlbstatic) on key press.
 */
@action({ UUID: "com.dadstart.baseball.teamlogo" })
export class MlbTeamLogo extends SingletonAction<MlbLogoSettings> {
	override async onWillAppear(
		ev: WillAppearEvent<MlbLogoSettings>,
	): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		const settings = ev.payload.settings;
		const teamId = teamIdString(settings);
		if (!teamId || !/^\d+$/.test(teamId)) {
			await ev.action.setTitle(titleForMlbLogoSettings(settings));
			return;
		}
		if (String(settings.team ?? "").trim() !== teamId) {
			await ev.action.setSettings({ ...settings, team: teamId });
		}
		await applyMlbTeamLogoToKey(
			ev.action,
			teamId,
			resolveLogoVariant(settings.logoVariant),
		);
	}

	/**
	 * Runs when the Property Inspector saves settings (and on getSettings).
	 * Without this, the key title stays whatever onWillAppear last set.
	 */
	override onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<MlbLogoSettings>,
	): void | Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		const settings = ev.payload.settings;
		const teamId = teamIdString(settings);
		if (!teamId || !/^\d+$/.test(teamId)) {
			return ev.action.setTitle(titleForMlbLogoSettings(settings));
		}
		return applyMlbTeamLogoToKey(
			ev.action,
			teamId,
			resolveLogoVariant(settings.logoVariant),
		);
	}

	override async onKeyDown(
		ev: KeyDownEvent<MlbLogoSettings>,
	): Promise<void> {
		const teamId = teamIdString(ev.payload.settings);
		if (!teamId || !/^\d+$/.test(teamId)) {
			await ev.action.setTitle("Set team id");
			streamDeck.logger.warn(
				`MlbTeamLogo: settings.team must be a numeric MLB team id (e.g. 147). Current value: ${teamId}`,
			);
			return;
		}

		const variant = nextCycledLogoVariant(
			resolveLogoVariant(ev.payload.settings.logoVariant),
		);
		await ev.action.setSettings({
			...ev.payload.settings,
			logoVariant: variant,
		});
		await applyMlbTeamLogoToKey(ev.action, teamId, variant);
	}
}
