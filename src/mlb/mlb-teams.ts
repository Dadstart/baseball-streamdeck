/**
 * @module mlb/mlb-teams
 *
 * Offline catalog of the 30 MLB clubs for use in the plugin (Property Inspector labels,
 * key titles, validation). Identifiers match the **MLB Stats API** `team.id` (integer),
 * which is also what **mlbstatic.com** team logo URLs use.
 *
 * This module does not call the Stats API; update the list if franchises or ids change.
 *
 * @see https://statsapi.mlb.com/ — team ids from `/api/v1/teams`
 */

/**
 * One club: numeric Stats API id, short code, full name, and division label for grouping.
 */
export type MlbTeam = {
	/** Stats API `team.id` (e.g. `147` for Yankees). */
	readonly id: number;
	/** Display abbreviation on keys / UI (e.g. `NYY`, `ATH`). */
	readonly abbreviation: string;
	/** Official club name; keys for {@link MLB_TEAM_BY_NAME}. */
	readonly name: string;
	/** Human-readable league / division (for optgroups or filters). */
	readonly division: string;
};

/**
 * All 30 MLB teams in arbitrary order; treat as source of truth for derived maps below.
 * Keep in sync with Stats API ids used elsewhere (logos, future API calls).
 */
export const MLB_TEAMS: readonly MlbTeam[] = [
	{ id: 109, abbreviation: "AZ", name: "Arizona Diamondbacks", division: "National League West" },
	{ id: 133, abbreviation: "ATH", name: "Athletics", division: "American League West" },
	{ id: 144, abbreviation: "ATL", name: "Atlanta Braves", division: "National League East" },
	{ id: 110, abbreviation: "BAL", name: "Baltimore Orioles", division: "American League East" },
	{ id: 111, abbreviation: "BOS", name: "Boston Red Sox", division: "American League East" },
	{ id: 112, abbreviation: "CHC", name: "Chicago Cubs", division: "National League Central" },
	{ id: 145, abbreviation: "CWS", name: "Chicago White Sox", division: "American League Central" },
	{ id: 113, abbreviation: "CIN", name: "Cincinnati Reds", division: "National League Central" },
	{ id: 114, abbreviation: "CLE", name: "Cleveland Guardians", division: "American League Central" },
	{ id: 115, abbreviation: "COL", name: "Colorado Rockies", division: "National League West" },
	{ id: 116, abbreviation: "DET", name: "Detroit Tigers", division: "American League Central" },
	{ id: 117, abbreviation: "HOU", name: "Houston Astros", division: "American League West" },
	{ id: 118, abbreviation: "KC", name: "Kansas City Royals", division: "American League Central" },
	{ id: 108, abbreviation: "LAA", name: "Los Angeles Angels", division: "American League West" },
	{ id: 119, abbreviation: "LAD", name: "Los Angeles Dodgers", division: "National League West" },
	{ id: 146, abbreviation: "MIA", name: "Miami Marlins", division: "National League East" },
	{ id: 158, abbreviation: "MIL", name: "Milwaukee Brewers", division: "National League Central" },
	{ id: 142, abbreviation: "MIN", name: "Minnesota Twins", division: "American League Central" },
	{ id: 121, abbreviation: "NYM", name: "New York Mets", division: "National League East" },
	{ id: 147, abbreviation: "NYY", name: "New York Yankees", division: "American League East" },
	{ id: 143, abbreviation: "PHI", name: "Philadelphia Phillies", division: "National League East" },
	{ id: 134, abbreviation: "PIT", name: "Pittsburgh Pirates", division: "National League Central" },
	{ id: 135, abbreviation: "SD", name: "San Diego Padres", division: "National League West" },
	{ id: 137, abbreviation: "SF", name: "San Francisco Giants", division: "National League West" },
	{ id: 136, abbreviation: "SEA", name: "Seattle Mariners", division: "American League West" },
	{ id: 138, abbreviation: "STL", name: "St. Louis Cardinals", division: "National League Central" },
	{ id: 139, abbreviation: "TB", name: "Tampa Bay Rays", division: "American League East" },
	{ id: 140, abbreviation: "TEX", name: "Texas Rangers", division: "American League West" },
	{ id: 141, abbreviation: "TOR", name: "Toronto Blue Jays", division: "American League East" },
	{ id: 120, abbreviation: "WSH", name: "Washington Nationals", division: "National League East" },
] as const;

/**
 * Lookup by exact {@link MlbTeam.name} (e.g. `"New York Yankees"`).
 */
export const MLB_TEAM_BY_NAME: Readonly<Record<string, MlbTeam>> = Object.fromEntries(
	MLB_TEAMS.map((t) => [t.name, t]),
);

/**
 * Lookup by Stats API numeric id.
 */
export const MLB_TEAM_BY_ID: Readonly<Record<number, MlbTeam>> = Object.fromEntries(
	MLB_TEAMS.map((t) => [t.id, t]),
);

/**
 * Map full name → Stats API id; same keys as {@link MLB_TEAM_BY_NAME}.
 */
export const MLB_TEAM_ID_BY_NAME: Readonly<Record<string, number>> = Object.fromEntries(
	MLB_TEAMS.map((t) => [t.name, t.id]),
);

/**
 * @param name - Exact {@link MlbTeam.name}
 * @returns The team row, or `undefined` if no match.
 */
export function getMlbTeamByName(name: string): MlbTeam | undefined {
	return MLB_TEAM_BY_NAME[name];
}

/**
 * @param name - Exact {@link MlbTeam.name}
 * @returns Stats API team id, or `undefined` if no match.
 */
export function getMlbTeamIdByName(name: string): number | undefined {
	return MLB_TEAM_ID_BY_NAME[name];
}

/**
 * @param id - Stats API `team.id`
 * @returns The team row, or `undefined` if id is unknown.
 */
export function getMlbTeamById(id: number): MlbTeam | undefined {
	return MLB_TEAM_BY_ID[id];
}

/**
 * Trims a Property Inspector `team` value (sdpi may store ids as string or number).
 *
 * @param team - Raw `settings.team`; `undefined` / `null` yields `""`.
 */
export function teamIdString(team: string | number | undefined | null): string {
	if (team === undefined || team === null) {
		return "";
	}
	return String(team).trim();
}

/**
 * @param id - After {@link teamIdString}; empty string is not numeric.
 * @returns Whether `id` is suitable as a Stats API team id (`/^\d+$/`).
 */
export function isNumericTeamId(id: string): boolean {
	return /^\d+$/.test(id);
}
