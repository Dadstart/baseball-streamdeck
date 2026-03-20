/**
 * MLB team metadata (Stats API team id, abbreviation, full name, division).
 */
export type MlbTeam = {
	readonly id: number;
	readonly abbreviation: string;
	readonly name: string;
	readonly division: string;
};

/**
 * All 30 MLB clubs. Source: MLB Stats API team ids.
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

/** Full team name → team (exact match). */
export const MLB_TEAM_BY_NAME: Readonly<Record<string, MlbTeam>> = Object.fromEntries(
	MLB_TEAMS.map((t) => [t.name, t]),
);

/** Numeric Stats API id → team */
export const MLB_TEAM_BY_ID: Readonly<Record<number, MlbTeam>> = Object.fromEntries(
	MLB_TEAMS.map((t) => [t.id, t]),
);

/** Full team name → numeric id (exact match on {@link MlbTeam.name}). */
export const MLB_TEAM_ID_BY_NAME: Readonly<Record<string, number>> = Object.fromEntries(
	MLB_TEAMS.map((t) => [t.name, t.id]),
);

export function getMlbTeamByName(name: string): MlbTeam | undefined {
	return MLB_TEAM_BY_NAME[name];
}

export function getMlbTeamIdByName(name: string): number | undefined {
	return MLB_TEAM_ID_BY_NAME[name];
}

export function getMlbTeamById(id: number): MlbTeam | undefined {
	return MLB_TEAM_BY_ID[id];
}
