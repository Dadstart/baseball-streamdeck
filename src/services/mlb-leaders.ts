/**
 * @module services/mlb-leaders
 *
 * Fetches **stat leaders** from the MLB Stats API (`/api/v1/stats/leaders`) and formats compact titles:
 * header line (stat + league, optional season), then fixed-width name/value rows
 * (see {@link formatStatLeaderRowLine}).
 *
 * Settings use `statGroup|leaderCategory` keys aligned with {@link MLB_LEADER_STAT_LABEL}.
 */

const MLB_STATS_LEADERS = "https://statsapi.mlb.com/api/v1/stats/leaders";

/** Regular season only (matches typical leaderboard expectations). */
const GAME_TYPE_R = "R";

export type MlbStatLeadersLeagueScope = "mlb" | "al" | "nl";

export type MlbStatLeaderRow = {
	readonly rank: number;
	/** Last name from the API (used to build a fixed-width line with ellipsis). */
	readonly lastName: string;
	readonly value: string;
};

/** Monospace columns Stream Deck keys typically fit per line (Courier). */
export const MLB_STAT_LEADER_LINE_MAX_CHARS = 9;

const NAME_VALUE_SEPARATOR = " ";
const ELLIPSIS = "…";

export type MlbStatLeadersBlock = {
	readonly statLabel: string;
	readonly leagueTag: string;
	readonly seasonNote: string | null;
	readonly rows: readonly MlbStatLeaderRow[];
};

type LeaderPerson = {
	readonly fullName?: string;
	readonly firstName?: string;
	readonly lastName?: string;
};

type LeaderEntry = {
	readonly rank?: number;
	readonly value?: string | number;
	readonly person?: LeaderPerson;
};

type LeagueLeadersSplit = {
	readonly leaderCategory?: string;
	readonly season?: string;
	readonly statGroup?: string;
	readonly leaders?: readonly LeaderEntry[];
};

type LeadersResponse = {
	readonly leagueLeaders?: readonly LeagueLeadersSplit[];
};

export type MlbStatLeadersFetchParams = {
	readonly statGroup: string;
	readonly leaderCategory: string;
	readonly leagueScope: MlbStatLeadersLeagueScope;
	/** `undefined` or empty: API uses current season. */
	readonly season?: string;
	/** When true, append a short year to the title (set when `season` is fixed in PI). */
	readonly showSeasonInTitle?: boolean;
	/** Rows to show; fetches extra to absorb ties. */
	readonly rowCount: number;
};

/**
 * Preset label for keypad header. Keys are `statGroup|leaderCategory` as stored in settings.
 */
export const MLB_LEADER_STAT_LABEL: Readonly<Record<string, string>> = {
	"derived|war": "WAR",
	"hitting|homeRuns": "HR",
	"hitting|runsBattedIn": "RBI",
	"hitting|runs": "R",
	"hitting|battingAverage": "AVG",
	"hitting|onBasePlusSlugging": "OPS",
	"hitting|stolenBases": "SB",
	"hitting|hits": "H",
	"hitting|doubles": "2B",
	"hitting|triples": "3B",
	"pitching|earnedRunAverage": "ERA",
	"pitching|walksAndHitsPerInningPitched": "WHIP",
	"pitching|strikeouts": "K",
	"pitching|saves": "SV",
	"pitching|wins": "W",
	"pitching|inningsPitched": "IP",
};

export const MLB_LEADER_STAT_KEYS_DEFAULT_ORDER = [
	"derived|war",
	"hitting|homeRuns",
	"hitting|runsBattedIn",
	"hitting|runs",
	"hitting|battingAverage",
	"hitting|onBasePlusSlugging",
	"hitting|stolenBases",
	"hitting|hits",
	"hitting|doubles",
	"hitting|triples",
	"pitching|earnedRunAverage",
	"pitching|walksAndHitsPerInningPitched",
	"pitching|strikeouts",
	"pitching|saves",
	"pitching|wins",
	"pitching|inningsPitched",
] as const;

const DERIVED_WAR_FETCH_CAP = 50;

type DerivedWarCategoryConfig = {
	readonly statGroup: "hitting" | "pitching";
	readonly category: string;
	readonly weight: number;
	readonly invert: boolean;
};

const DERIVED_WAR_CATEGORIES: readonly DerivedWarCategoryConfig[] = [
	{ statGroup: "hitting", category: "onBasePlusSlugging", weight: 0.4, invert: false },
	{ statGroup: "hitting", category: "homeRuns", weight: 0.2, invert: false },
	{ statGroup: "hitting", category: "runsBattedIn", weight: 0.14, invert: false },
	{ statGroup: "hitting", category: "runs", weight: 0.1, invert: false },
	{ statGroup: "hitting", category: "stolenBases", weight: 0.06, invert: false },
	{ statGroup: "hitting", category: "hits", weight: 0.06, invert: false },
	{ statGroup: "hitting", category: "doubles", weight: 0.04, invert: false },
	{ statGroup: "pitching", category: "earnedRunAverage", weight: 0.3, invert: true },
	{
		statGroup: "pitching",
		category: "walksAndHitsPerInningPitched",
		weight: 0.25,
		invert: true,
	},
	{ statGroup: "pitching", category: "strikeouts", weight: 0.18, invert: false },
	{ statGroup: "pitching", category: "wins", weight: 0.12, invert: false },
	{ statGroup: "pitching", category: "inningsPitched", weight: 0.1, invert: false },
	{ statGroup: "pitching", category: "saves", weight: 0.05, invert: false },
] as const;

/** Short label for the key header, or the raw key if unmapped. */
export function leaderStatLabel(statKey: string): string {
	return MLB_LEADER_STAT_LABEL[statKey] ?? statKey;
}

/**
 * Parses `leaderStatKey` from settings (`hitting|homeRuns`). Invalid or empty input defaults to home runs.
 */
export function parseLeaderStatKey(raw: string | undefined): {
	statGroup: string;
	leaderCategory: string;
	statKey: string;
} {
	const key = (raw ?? "").trim();
	const parts = key.split("|");
	if (parts.length === 2) {
		const [g, c] = parts;
		const statGroup = (g ?? "").trim();
		const leaderCategory = (c ?? "").trim();
		if (statGroup !== "" && leaderCategory !== "") {
			return {
				statGroup,
				leaderCategory,
				statKey: `${statGroup}|${leaderCategory}`,
			};
		}
	}
	return {
		statGroup: "hitting",
		leaderCategory: "homeRuns",
		statKey: "hitting|homeRuns",
	};
}

function leaderLastName(person: LeaderPerson | undefined): string {
	const last = (person?.lastName ?? "").trim();
	if (last !== "") {
		return last;
	}
	const full = (person?.fullName ?? "").trim();
	if (full === "") {
		return "?";
	}
	const parts = full.split(/\s+/).filter(Boolean);
	const tail = parts[parts.length - 1] ?? full;
	return tail;
}

/**
 * One keypad line: as much of `lastName` as fits, then `…` if truncated, one space, then `value` flush right
 * in a field of width {@link MLB_STAT_LEADER_LINE_MAX_CHARS}.
 */
export function formatStatLeaderRowLine(
	lastName: string,
	value: string,
	maxChars: number = MLB_STAT_LEADER_LINE_MAX_CHARS,
): string {
	const v = valueToString(value).trim();
	const sepLen = NAME_VALUE_SEPARATOR.length;
	const valueSlot = v.length;
	const roomForName = maxChars - sepLen - valueSlot;
	if (roomForName < 1) {
		return v.length <= maxChars ? v.padStart(maxChars, " ") : v.slice(-maxChars);
	}
	const name = lastName.trim() || "?";
	const ellLen = ELLIPSIS.length;
	if (name.length <= roomForName) {
		const pad = roomForName - name.length;
		return `${name}${" ".repeat(pad)}${NAME_VALUE_SEPARATOR}${v}`;
	}
	const keep = roomForName - ellLen;
	if (keep >= 1) {
		return `${name.slice(0, keep)}${ELLIPSIS}${NAME_VALUE_SEPARATOR}${v}`;
	}
	return `${name.slice(0, roomForName)}${NAME_VALUE_SEPARATOR}${v}`;
}

function leagueIdForScope(scope: MlbStatLeadersLeagueScope): string | undefined {
	if (scope === "al") {
		return "103";
	}
	if (scope === "nl") {
		return "104";
	}
	return undefined;
}

function leagueTagForScope(scope: MlbStatLeadersLeagueScope): string {
	if (scope === "al") {
		return "AL";
	}
	if (scope === "nl") {
		return "NL";
	}
	return "MLB";
}

/** JSON value or missing → display string (em dash for absent). */
function valueToString(v: string | number | undefined): string {
	if (v === undefined || v === null) {
		return "—";
	}
	return String(v);
}

function parseFiniteNumber(v: string | number | undefined): number | null {
	if (v === undefined || v === null) {
		return null;
	}
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

type DerivedWarPlayer = {
	readonly lastName: string;
	readonly values: Map<string, number>;
};

function playerKeyFromEntry(e: LeaderEntry): string {
	const full = (e.person?.fullName ?? "").trim();
	if (full !== "") {
		return full.toLowerCase();
	}
	return leaderLastName(e.person).toLowerCase();
}

async function fetchLeaderSplits(
	params: MlbStatLeadersFetchParams,
	statGroup: "hitting" | "pitching",
	categories: readonly string[],
	limit: number,
): Promise<readonly LeagueLeadersSplit[]> {
	const q = new URLSearchParams();
	q.set("leaderCategories", categories.join(","));
	q.set("statGroup", statGroup);
	q.set("statType", "season");
	q.set("limit", String(limit));
	q.set("gameType", GAME_TYPE_R);
	const lid = leagueIdForScope(params.leagueScope);
	if (lid !== undefined) {
		q.set("leagueId", lid);
	}
	const season = (params.season ?? "").trim();
	if (season !== "") {
		q.set("season", season);
	}
	const res = await fetch(`${MLB_STATS_LEADERS}?${q.toString()}`);
	if (!res.ok) {
		throw new Error(`leaders HTTP ${res.status}`);
	}
	const body = (await res.json()) as LeadersResponse;
	return body.leagueLeaders ?? [];
}

function normalizeValue(
	value: number,
	min: number,
	max: number,
	invert: boolean,
): number {
	if (max <= min) {
		return 0.5;
	}
	const normalized = (value - min) / (max - min);
	return invert ? 1 - normalized : normalized;
}

async function fetchDerivedWarLeaders(
	params: MlbStatLeadersFetchParams,
): Promise<MlbStatLeadersBlock> {
	const hittingCategories = DERIVED_WAR_CATEGORIES.filter(
		(c) => c.statGroup === "hitting",
	).map((c) => c.category);
	const pitchingCategories = DERIVED_WAR_CATEGORIES.filter(
		(c) => c.statGroup === "pitching",
	).map((c) => c.category);

	const [hittingSplits, pitchingSplits] = await Promise.all([
		fetchLeaderSplits(params, "hitting", hittingCategories, DERIVED_WAR_FETCH_CAP),
		fetchLeaderSplits(params, "pitching", pitchingCategories, DERIVED_WAR_FETCH_CAP),
	]);
	const allSplits = [...hittingSplits, ...pitchingSplits];

	const players = new Map<string, DerivedWarPlayer>();
	const valuesByCategory = new Map<string, number[]>();
	for (const split of allSplits) {
		const category = (split.leaderCategory ?? "").trim();
		if (category === "") {
			continue;
		}
		for (const e of split.leaders ?? []) {
			const parsedValue = parseFiniteNumber(e.value);
			if (parsedValue === null) {
				continue;
			}
			const key = playerKeyFromEntry(e);
			const existing = players.get(key);
			const player: DerivedWarPlayer = existing ?? {
				lastName: leaderLastName(e.person),
				values: new Map<string, number>(),
			};
			player.values.set(category, parsedValue);
			if (!existing) {
				players.set(key, player);
			}
			const bucket = valuesByCategory.get(category) ?? [];
			bucket.push(parsedValue);
			valuesByCategory.set(category, bucket);
		}
	}

	const scored = [...players.values()]
		.map((player) => {
			let score = 0;
			for (const cfg of DERIVED_WAR_CATEGORIES) {
				const value = player.values.get(cfg.category);
				if (value === undefined) {
					continue;
				}
				const categoryValues = valuesByCategory.get(cfg.category) ?? [];
				if (!categoryValues.length) {
					continue;
				}
				const min = Math.min(...categoryValues);
				const max = Math.max(...categoryValues);
				score += cfg.weight * normalizeValue(value, min, max, cfg.invert);
			}
			return {
				lastName: player.lastName,
				war: Math.max(-1, Math.min(10, -1 + score * 11)),
			};
		})
		.sort((a, b) => b.war - a.war)
		.slice(0, params.rowCount);

	const seasonFromApi =
		(hittingSplits[0]?.season ?? pitchingSplits[0]?.season ?? "").trim();
	const seasonNote =
		params.showSeasonInTitle && seasonFromApi !== "" ? seasonFromApi : null;

	const rows: MlbStatLeaderRow[] = scored.map((row, index) => ({
		rank: index + 1,
		lastName: row.lastName,
		value: row.war.toFixed(1),
	}));
	return {
		statLabel: "WAR",
		leagueTag: leagueTagForScope(params.leagueScope),
		seasonNote,
		rows,
	};
}

/**
 * Fetches leaders and returns the first API split (one category). Stops after `rowCount` display rows;
 * `limit` on the request is oversized so ties still fill the key.
 */
export async function fetchMlbStatLeaders(
	params: MlbStatLeadersFetchParams,
): Promise<MlbStatLeadersBlock> {
	if (params.statGroup === "derived" && params.leaderCategory === "war") {
		return fetchDerivedWarLeaders(params);
	}

	const fetchCap = Math.min(50, Math.max(params.rowCount * 4, params.rowCount + 8));
	const q = new URLSearchParams();
	q.set("leaderCategories", params.leaderCategory);
	q.set("statGroup", params.statGroup);
	q.set("statType", "season");
	q.set("limit", String(fetchCap));
	q.set("gameType", GAME_TYPE_R);
	const lid = leagueIdForScope(params.leagueScope);
	if (lid !== undefined) {
		q.set("leagueId", lid);
	}
	const season = (params.season ?? "").trim();
	if (season !== "") {
		q.set("season", season);
	}

	const url = `${MLB_STATS_LEADERS}?${q.toString()}`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`leaders HTTP ${res.status}`);
	}
	const body = (await res.json()) as LeadersResponse;
	const split = body.leagueLeaders?.[0];
	const rawLeaders = split?.leaders ?? [];
	const statKey = `${params.statGroup}|${params.leaderCategory}`;
	const statLabel = leaderStatLabel(statKey);
	const leagueTag = leagueTagForScope(params.leagueScope);
	const apiSeason = (split?.season ?? "").trim();
	const seasonNote =
		params.showSeasonInTitle && apiSeason !== "" ? apiSeason : null;

	const rows: MlbStatLeaderRow[] = [];
	for (const e of rawLeaders) {
		if (rows.length >= params.rowCount) {
			break;
		}
		const rank = Math.floor(Number(e.rank));
		rows.push({
			rank: Number.isFinite(rank) ? rank : rows.length + 1,
			lastName: leaderLastName(e.person),
			value: valueToString(e.value),
		});
	}

	return {
		statLabel,
		leagueTag,
		seasonNote,
		rows,
	};
}

/**
 * Multi-line keypad title: `STAT LEAGUE` (optional season), then one fixed-width line per leader
 * (last name + optional ellipsis, value at end — see {@link formatStatLeaderRowLine}).
 */
export function formatMlbStatLeadersTitle(block: MlbStatLeadersBlock): string {
	const head =
		block.seasonNote !== null
			? `${block.statLabel} ${block.leagueTag} '${String(block.seasonNote).slice(-2)}`
			: `${block.statLabel} ${block.leagueTag}`;
	const lines: string[] = [head];
	if (!block.rows.length) {
		lines.push("—");
		return lines.join("\n");
	}
	for (const r of block.rows) {
		lines.push(formatStatLeaderRowLine(r.lastName, r.value));
	}
	return lines.join("\n");
}
