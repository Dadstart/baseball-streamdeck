/**
 * @module services/mlb-roster
 *
 * Fetches MLB team rosters from the MLB Stats API.
 */

const MLB_TEAM_ROSTER_API_BASE = "https://statsapi.mlb.com/api/v1/teams";
const ROSTER_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const rosterCache = new Map<
	number,
	{
		readonly players: readonly MlbRosterPlayer[];
		readonly cachedAtMs: number;
	}
>();

export type MlbRosterPlayer = {
	readonly id: number;
	readonly fullName: string;
	readonly primaryPositionAbbreviation: string;
	readonly jerseyNumber: string | null;
};

type MlbRosterResponse = {
	readonly roster?: ReadonlyArray<{
		readonly person?: {
			readonly id?: number;
			readonly fullName?: string;
		};
		readonly jerseyNumber?: string;
		readonly position?: {
			readonly abbreviation?: string;
		};
	}>;
};

/**
 * Clears all in-memory team roster cache entries.
 */
export function clearMlbTeamRosterCache(): void {
	rosterCache.clear();
}

/**
 * Fetches active roster players for a team and returns a name-sorted list.
 *
 * @param teamId - MLB Stats API team id.
 */
export async function fetchMlbTeamActiveRoster(
	teamId: number,
): Promise<readonly MlbRosterPlayer[]> {
	const now = Date.now();
	const cached = rosterCache.get(teamId);
	if (
		cached !== undefined &&
		now - cached.cachedAtMs <= ROSTER_CACHE_TTL_MS
	) {
		return cached.players;
	}
	rosterCache.delete(teamId);

	const q = new URLSearchParams({ rosterType: "active" });
	const url = `${MLB_TEAM_ROSTER_API_BASE}/${teamId}/roster?${q.toString()}`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`MLB roster HTTP ${res.status}`);
	}

	const body = (await res.json()) as MlbRosterResponse;
	const rows: MlbRosterPlayer[] = [];
	for (const row of body.roster ?? []) {
		const id = Math.floor(Number(row.person?.id));
		const fullName = String(row.person?.fullName ?? "").trim();
		if (!Number.isFinite(id) || fullName === "") {
			continue;
		}
		rows.push({
			id,
			fullName,
			primaryPositionAbbreviation: String(
				row.position?.abbreviation ?? "",
			).trim(),
			jerseyNumber: String(row.jerseyNumber ?? "").trim() || null,
		});
	}

	rows.sort((a, b) =>
		a.fullName.localeCompare(b.fullName, "en", { sensitivity: "base" }),
	);
	const frozenRows = Object.freeze([...rows]) as readonly MlbRosterPlayer[];
	rosterCache.set(teamId, {
		players: frozenRows,
		cachedAtMs: now,
	});
	return frozenRows;
}
