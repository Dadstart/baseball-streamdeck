/**
 * @module services/mlb-leaders
 *
 * Fetches **stat leaders** from the MLB Stats API (`/api/v1/stats/leaders`) for keypad titles.
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

export function leaderStatLabel(statKey: string): string {
	return MLB_LEADER_STAT_LABEL[statKey] ?? statKey;
}

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

function valueToString(v: string | number | undefined): string {
	if (v === undefined || v === null) {
		return "—";
	}
	return String(v);
}

/**
 * Fetches leaders and returns the first split (single category request). Truncates to `rowCount` rows.
 */
export async function fetchMlbStatLeaders(
	params: MlbStatLeadersFetchParams,
): Promise<MlbStatLeadersBlock> {
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
