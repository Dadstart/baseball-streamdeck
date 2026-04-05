/**
 * @module services/mlb-roster
 *
 * Fetches MLB team rosters from the MLB Stats API.
 */

const MLB_TEAM_ROSTER_API_BASE = "https://statsapi.mlb.com/api/v1/teams";

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
 * Fetches active roster players for a team and returns a name-sorted list.
 *
 * @param teamId - MLB Stats API team id.
 */
export async function fetchMlbTeamActiveRoster(
	teamId: number,
): Promise<readonly MlbRosterPlayer[]> {
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
	return rows;
}

