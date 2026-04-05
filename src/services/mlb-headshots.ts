/**
 * @module services/mlb-headshots
 *
 * URL and fetch helpers for MLB player headshots from mlbstatic.
 * Returned values are Stream Deck-ready data URLs.
 */

/**
 * CDN path prefix for player headshots (Cloudinary transforms).
 * Square canvas + pad preserves aspect ratio so Stream Deck does not stretch the key image.
 */
const MLB_PLAYER_HEADSHOTS_BASE =
	"https://img.mlbstatic.com/mlb-photos/image/upload/w_344,h_344,c_pad,b_transparent,q_auto:best,f_png/v1/people";

/** Reuse fetched headshots across key refreshes in one plugin process. */
const headshotDataUrlCache = new Map<
	string,
	{
		readonly dataUrl: string;
		readonly cachedAtMs: number;
	}
>();

/** Keep image cache entries for one week. */
const HEADSHOT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Clears all in-memory player headshot cache entries.
 */
export function clearMlbPlayerHeadshotCache(): void {
	headshotDataUrlCache.clear();
}

/**
 * Trims a Property Inspector `playerId` value (sdpi may store ids as string or number).
 *
 * @param playerId - Raw `settings.playerId`; `undefined` / `null` yields `""`.
 */
export function playerIdString(
	playerId: string | number | undefined | null,
): string {
	if (playerId === undefined || playerId === null) {
		return "";
	}
	return String(playerId).trim();
}

/**
 * @param id - After {@link playerIdString}; empty string is not numeric.
 * @returns Whether `id` is suitable as an MLB Stats API player id (`/^\d+$/`).
 */
export function isNumericPlayerId(id: string): boolean {
	return /^\d+$/.test(id);
}

/**
 * Builds the absolute URL for a player headshot image.
 *
 * @param playerId - MLB Stats API person id as digits only (e.g. `"592450"`).
 */
export function mlbPlayerHeadshotUrl(playerId: string): string {
	return `${MLB_PLAYER_HEADSHOTS_BASE}/${playerId}/headshot/67/current`;
}

/**
 * Fetches a player headshot and returns a Stream Deck image data URL.
 *
 * @throws Error when HTTP status is not ok.
 */
export async function fetchMlbPlayerHeadshotDataUrl(
	playerId: string,
): Promise<string> {
	const now = Date.now();
	const cached = headshotDataUrlCache.get(playerId);
	if (
		cached !== undefined &&
		now - cached.cachedAtMs <= HEADSHOT_CACHE_TTL_MS
	) {
		return cached.dataUrl;
	}
	headshotDataUrlCache.delete(playerId);

	const res = await fetch(mlbPlayerHeadshotUrl(playerId), {
		headers: { Accept: "image/avif,image/webp,image/jpeg,image/png,*/*" },
	});
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} for player ${playerId}`);
	}

	const contentType =
		(res.headers.get("content-type") ?? "").trim() || "image/png";
	const bytes = await res.arrayBuffer();
	const base64 = Buffer.from(bytes).toString("base64");
	const dataUrl = `data:${contentType};base64,${base64}`;
	headshotDataUrlCache.set(playerId, {
		dataUrl,
		cachedAtMs: now,
	});
	return dataUrl;
}
