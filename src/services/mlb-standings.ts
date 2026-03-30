/**
 * @module services/mlb-standings
 *
 * Fetches **regular-season division standings** from the MLB Stats API
 * (`/api/v1/standings`) for keypad title text.
 */

import { getMlbTeamById } from "../mlb/mlb-teams";

const MLB_STATS_STANDINGS = "https://statsapi.mlb.com/api/v1/standings";

/**
 * Stats API division ids in cycle order: AL East → AL Central → AL West → NL East →
 * NL Central → NL West. (See `/api/v1/divisions?sportId=1` — AL West is **200**, NL West is **203**, not 206.)
 */
export const MLB_DIVISION_STANDINGS_IDS = [
	201, 202, 200, 204, 205, 203,
] as const;

export const MLB_DIVISION_STANDINGS_COUNT = MLB_DIVISION_STANDINGS_IDS.length;

const DIVISION_TITLE: Readonly<Record<number, string>> = {
	200: "AL West",
	201: "AL East",
	202: "AL Central",
	203: "NL West",
	204: "NL East",
	205: "NL Central",
};

export type MlbDivisionStandingRow = {
	readonly rank: number;
	readonly abbreviation: string;
	readonly wins: number;
	readonly losses: number;
	readonly ties: number;
	/** First place uses `"-"`; trailing teams show e.g. `"3.0"`. */
	readonly gamesBack: string;
};

export type MlbDivisionStandingsBlock = {
	readonly divisionId: number;
	readonly title: string;
	readonly rows: readonly MlbDivisionStandingRow[];
};

type StandingsRecord = {
	readonly division?: { readonly id?: number };
	readonly teamRecords?: ReadonlyArray<{
		readonly divisionRank?: string;
		readonly team?: { readonly id?: number; readonly name?: string };
		readonly leagueRecord?: {
			readonly wins?: number;
			readonly losses?: number;
			readonly ties?: number;
		};
		readonly gamesBack?: string;
	}>;
};

type StandingsResponse = {
	readonly records?: ReadonlyArray<StandingsRecord>;
};

/** Prefer {@link getMlbTeamById}; else first three letters of API name. */
function abbrevForTeam(teamId: number, fallbackName: string): string {
	return (
		getMlbTeamById(teamId)?.abbreviation ??
		fallbackName.slice(0, 3).toUpperCase()
	);
}

/** Builds division id → sorted rows from `/api/v1/standings` JSON. */
function parseStandingsBody(body: StandingsResponse): Map<
	number,
	MlbDivisionStandingRow[]
> {
	const map = new Map<number, MlbDivisionStandingRow[]>();
	for (const rec of body.records ?? []) {
		const divId = rec.division?.id;
		if (divId === undefined) {
			continue;
		}
		const rows: MlbDivisionStandingRow[] = [];
		for (const tr of rec.teamRecords ?? []) {
			const teamId = tr.team?.id;
			if (teamId === undefined) {
				continue;
			}
			const lr = tr.leagueRecord;
			const wins = lr?.wins ?? 0;
			const losses = lr?.losses ?? 0;
			const ties = lr?.ties ?? 0;
			const rankRaw = (tr.divisionRank ?? "0").trim();
			const rankDigits = rankRaw.replace(/^T/i, "");
			const rank = Math.floor(Number.parseInt(rankDigits, 10)) || 0;
			rows.push({
				rank,
				abbreviation: abbrevForTeam(teamId, tr.team?.name ?? ""),
				wins,
				losses,
				ties,
				gamesBack: tr.gamesBack ?? "-",
			});
		}
		rows.sort((a, b) => a.rank - b.rank);
		map.set(divId, rows);
	}
	return map;
}

/**
 * Fetches all six division standings (AL/NL × E/C/W). Omits `season` so the API
 * uses the active season.
 */
export async function fetchMlbDivisionStandingsMap(): Promise<
	Map<number, MlbDivisionStandingRow[]>
> {
	const url = `${MLB_STATS_STANDINGS}?leagueId=103,104`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`standings HTTP ${res.status}`);
	}
	const body = (await res.json()) as StandingsResponse;
	return parseStandingsBody(body);
}

export function divisionStandingsBlock(
	byDivision: Map<number, MlbDivisionStandingRow[]>,
	divisionIndex: number,
): MlbDivisionStandingsBlock | null {
	const safeIdx =
		((divisionIndex % MLB_DIVISION_STANDINGS_COUNT) +
			MLB_DIVISION_STANDINGS_COUNT) %
		MLB_DIVISION_STANDINGS_COUNT;
	const divisionId = MLB_DIVISION_STANDINGS_IDS[safeIdx]!;
	const rows = byDivision.get(divisionId);
	if (!rows?.length) {
		return null;
	}
	return {
		divisionId,
		title: DIVISION_TITLE[divisionId] ?? `Div ${divisionId}`,
		rows,
	};
}

/** Leader / tied-first: API uses `"-"`; show `0` games back. */
function gamesBackDisplay(gamesBack: string): string {
	const t = gamesBack.trim();
	if (t === "" || t === "-") {
		return "0";
	}
	return t;
}

/**
 * Multi-line keypad title: division name, then one line per team (abbr + space-padded games back).
 * GB is the only numeric column, right-aligned in a fixed-width column (monospace approximation).
 */
export function formatMlbDivisionStandingsTitle(
	block: MlbDivisionStandingsBlock,
): string {
	const maxAbbr = Math.max(
		1,
		...block.rows.map((r) => r.abbreviation.length),
	);
	const gbCells = block.rows.map((r) => gamesBackDisplay(r.gamesBack));
	const maxGb = Math.max(0, ...gbCells.map((g) => g.length));

	const lines: string[] = [block.title];
	const gapBetween = 1;
	for (let i = 0; i < block.rows.length; i++) {
		const r = block.rows[i]!;
		const gb = gbCells[i]!;
		const left = r.abbreviation.padEnd(maxAbbr, " ");
		const right = maxGb > 0 ? gb.padStart(maxGb, " ") : "";
		const spacer =
			maxGb > 0 ? " ".repeat(gapBetween) : "";
		lines.push(`${left}${spacer}${right}`);
	}
	return lines.join("\n");
}
