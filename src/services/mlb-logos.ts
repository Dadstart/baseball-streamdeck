/**
 * @module services/mlb-logos
 *
 * HTTP and URL helpers for **MLB.com static CDN** team logo SVGs served from
 * `https://www.mlbstatic.com/team-logos/`. No authentication; suitable for `fetch` in the plugin.
 *
 * **URL shape:** `{base}/{variant}/{teamId}.svg` where `teamId` is the Stats API integer as a string
 * (e.g. `"147"`). Variant slugs match folders used on MLB web properties (cap vs primary, light vs dark).
 *
 * **Stream Deck:** raw SVG strings are not reliable for `setImage`; callers should wrap results in a
 * `data:image/svg+xml,...` URL (see the team logo action).
 *
 * @see `mlb/mlb-teams.ts` for valid Stats API team ids
 */

/** CDN path prefix for team logo SVG assets (no trailing slash). */
const MLB_TEAM_LOGOS_BASE = "https://www.mlbstatic.com/team-logos";

/**
 * Known logo style segments from mlbstatic. Values are URL path segments, not filenames.
 * Property Inspector options should use the same string values for `logoVariant` settings.
 */
export const MlbLogoVariant = {
	TeamCapOnDark: "team-cap-on-dark",
	TeamCapOnLight: "team-cap-on-light",
	TeamPrimaryOnDark: "team-primary-on-dark",
	TeamPrimaryOnLight: "team-primary-on-light",
} as const;

/** Union of {@link MlbLogoVariant} string values. */
export type MlbLogoVariant =
	(typeof MlbLogoVariant)[keyof typeof MlbLogoVariant];

/** Used when settings omit or contain an unknown `logoVariant`. */
export const DEFAULT_MLB_LOGO_VARIANT = MlbLogoVariant.TeamCapOnDark;

/**
 * Builds the absolute URL for a team logo SVG.
 *
 * @param teamId - Stats API id as digits only (e.g. `"147"`).
 * @param variant - Path segment under `team-logos/` (see {@link MlbLogoVariant}).
 */
export function mlbTeamLogoUrl(
	teamId: string,
	variant: MlbLogoVariant,
): string {
	return `${MLB_TEAM_LOGOS_BASE}/${variant}/${teamId}.svg`;
}

/** Options for {@link fetchMlbLogoSvg} / {@link fetchMlbTeamLogoSvg}. */
export type FetchMlbLogoSvgOptions = {
	/**
	 * Called when `Content-Type` is neither `svg` nor `text`; the response body is still read as text.
	 * Use for logging—some edge caches may report generic types while still returning SVG.
	 */
	onUnexpectedContentType?: (contentType: string) => void;
};

/**
 * GETs a logo URL and returns the response body as UTF-8 text (expected: SVG markup).
 *
 * @throws Error when HTTP status is not ok.
 * @param url - Full URL, typically from {@link mlbTeamLogoUrl}.
 */
export async function fetchMlbLogoSvg(
	url: string,
	options?: FetchMlbLogoSvgOptions,
): Promise<string> {
	const res = await fetch(url, {
		headers: { Accept: "image/svg+xml,*/*" },
	});
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} for ${url}`);
	}
	const contentType = res.headers.get("content-type") ?? "";
	if (
		options?.onUnexpectedContentType &&
		!contentType.includes("svg") &&
		!contentType.includes("text")
	) {
		options.onUnexpectedContentType(contentType);
	}
	return res.text();
}

/**
 * Convenience: resolve URL from team id + variant, then {@link fetchMlbLogoSvg}.
 */
export async function fetchMlbTeamLogoSvg(
	teamId: string,
	variant: MlbLogoVariant,
	options?: FetchMlbLogoSvgOptions,
): Promise<string> {
	return fetchMlbLogoSvg(mlbTeamLogoUrl(teamId, variant), options);
}
