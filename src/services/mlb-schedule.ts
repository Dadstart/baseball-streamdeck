/**
 * @module services/mlb-schedule
 *
 * Fetches team schedules from the **MLB Stats API** for score display:
 *
 * - **Single “headline” pick** — {@link pickRelevantScoreGame}: live game if any, else latest final.
 * - **Slot 0 pick** — {@link pickCurrentOrNextGame} / {@link fetchCurrentOrNextMlbGame}: live game if any,
 *   else earliest game that is not yet live or final.
 * - **Strict upcoming pick** — {@link pickNextUpcomingGame} / {@link fetchNextUpcomingMlbGame}: earliest
 *   game that is not yet live or final.
 * - **Cycle views** — {@link buildMlbGameScoreCycleViews} / {@link fetchMlbGameScoreCycleViews}: next
 *   non-final game (upcoming or live; Preview shows opponent + system-local date/time) plus three recent finals.
 */

import { getMlbTeamById } from "../mlb/mlb-teams";

const MLB_STATS_SCHEDULE =
	"https://statsapi.mlb.com/api/v1/schedule";

/** Calendar date `YYYY-MM-DD` in `America/New_York` (MLB’s usual “day” boundary). */
export function mlbDateStringEastern(date: Date): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: "America/New_York",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

export type MlbScheduleGameTeamSide = {
	readonly team: { readonly id: number; readonly name: string };
	readonly score?: number;
};

export type MlbScheduleGame = {
	readonly gameDate: string;
	readonly gameNumber: number;
	readonly status: {
		readonly abstractGameState: string;
		readonly detailedState: string;
	};
	readonly teams: {
		readonly away: MlbScheduleGameTeamSide;
		readonly home: MlbScheduleGameTeamSide;
	};
};

export type MlbScorePick =
	| { readonly kind: "live"; readonly game: MlbScheduleGame }
	| { readonly kind: "final"; readonly game: MlbScheduleGame }
	| { readonly kind: "none" };

/** Data for the game-score key’s four-way cycle: upcoming, then three previous finals (newest first). */
export type MlbGameScoreCycleViews = {
	/** Earliest chronologically non-{@link MlbScheduleGame.status} `Final` game, or `null` if none. */
	readonly upcoming: MlbScheduleGame | null;
	/** Up to three most recent finals, **newest first**. */
	readonly recentFinals: readonly MlbScheduleGame[];
};

type ScheduleResponse = {
	readonly dates?: ReadonlyArray<{
		readonly games?: ReadonlyArray<MlbScheduleGame>;
	}>;
};

function flattenGames(body: ScheduleResponse): MlbScheduleGame[] {
	const out: MlbScheduleGame[] = [];
	for (const d of body.dates ?? []) {
		for (const g of d.games ?? []) {
			out.push(g);
		}
	}
	return out;
}

function gameSortKey(g: MlbScheduleGame): number {
	const t = Date.parse(g.gameDate);
	const safeT = Number.isFinite(t) ? t : 0;
	return safeT * 100 + (g.gameNumber ?? 1);
}

function teamParticipates(game: MlbScheduleGame, teamId: number): boolean {
	return (
		game.teams.away.team.id === teamId ||
		game.teams.home.team.id === teamId
	);
}

function isLiveGame(game: MlbScheduleGame): boolean {
	return game.status.abstractGameState === "Live";
}

function isFinalGame(game: MlbScheduleGame): boolean {
	return game.status.abstractGameState === "Final";
}

function isUpcomingGame(game: MlbScheduleGame): boolean {
	return !isLiveGame(game) && !isFinalGame(game);
}

/**
 * Picks the latest **Live** game, or if none, the latest **Final** game involving `teamId`.
 * Games are ordered by {@link MlbScheduleGame.gameDate} then {@link MlbScheduleGame.gameNumber}.
 */
export function pickRelevantScoreGame(
	games: readonly MlbScheduleGame[],
	teamId: number,
): MlbScorePick {
	const mine = games.filter((g) => teamParticipates(g, teamId));
	if (mine.length === 0) {
		return { kind: "none" };
	}
	mine.sort((a, b) => gameSortKey(a) - gameSortKey(b));
	const live = mine.filter((g) => isLiveGame(g));
	if (live.length > 0) {
		return { kind: "live", game: live[live.length - 1]! };
	}
	const finals = mine.filter((g) => isFinalGame(g));
	if (finals.length > 0) {
		return { kind: "final", game: finals[finals.length - 1]! };
	}
	return { kind: "none" };
}

/**
 * Picks the earliest chronologically upcoming game involving `teamId`, excluding games already marked
 * **Live** or **Final**.
 */
export function pickNextUpcomingGame(
	games: readonly MlbScheduleGame[],
	teamId: number,
): MlbScheduleGame | null {
	const mine = games.filter((g) => teamParticipates(g, teamId));
	if (mine.length === 0) {
		return null;
	}
	const sorted = [...mine].sort((a, b) => gameSortKey(a) - gameSortKey(b));
	return sorted.find((g) => isUpcomingGame(g)) ?? null;
}

/**
 * Picks the latest currently **Live** game involving `teamId`; if none are live, falls back to the earliest
 * chronologically upcoming game.
 */
export function pickCurrentOrNextGame(
	games: readonly MlbScheduleGame[],
	teamId: number,
): MlbScheduleGame | null {
	const mine = games.filter((g) => teamParticipates(g, teamId));
	if (mine.length === 0) {
		return null;
	}
	const sorted = [...mine].sort((a, b) => gameSortKey(a) - gameSortKey(b));
	const live = sorted.filter((g) => isLiveGame(g));
	if (live.length > 0) {
		return live[live.length - 1]!;
	}
	return sorted.find((g) => isUpcomingGame(g)) ?? null;
}

/**
 * Builds {@link MlbGameScoreCycleViews} from a flat game list: earliest non-final as **upcoming**, and the
 * last three **Final** games (newest first in `recentFinals`).
 */
export function buildMlbGameScoreCycleViews(
	games: readonly MlbScheduleGame[],
	teamId: number,
): MlbGameScoreCycleViews {
	const mine = games.filter((g) => teamParticipates(g, teamId));
	if (mine.length === 0) {
		return { upcoming: null, recentFinals: [] };
	}
	const sorted = [...mine].sort((a, b) => gameSortKey(a) - gameSortKey(b));
	const finals = sorted.filter((g) => isFinalGame(g));
	const recentFinals = finals.slice(-3).reverse();
	const nonFinal = sorted.filter((g) => !isFinalGame(g));
	const upcoming = nonFinal.length > 0 ? nonFinal[0]! : null;
	return { upcoming, recentFinals };
}

function abbrevForTeamId(id: number): string {
	return getMlbTeamById(id)?.abbreviation ?? String(id);
}

function formatShortGameDateEastern(iso: string): string {
	const ms = Date.parse(iso);
	if (!Number.isFinite(ms)) {
		return "";
	}
	return new Intl.DateTimeFormat("en-US", {
		timeZone: "America/New_York",
		month: "short",
		day: "numeric",
	}).format(new Date(ms));
}

/** First line for key titles: Eastern calendar date, optional doubleheader suffix. */
function formatGameDateHeader(game: MlbScheduleGame): string {
	const d = formatShortGameDateEastern(game.gameDate);
	const g2 = game.gameNumber > 1 ? " · G2" : "";
	return `${d || "—"}${g2}`;
}

/**
 * Local calendar date and time for a **scheduled** game (`Intl` default timezone = user’s system TZ).
 */
function formatUpcomingPreviewLocalDateTime(game: MlbScheduleGame): {
	readonly dateLine: string;
	readonly timeLine: string;
} {
	const ms = Date.parse(game.gameDate);
	if (!Number.isFinite(ms)) {
		return { dateLine: "—", timeLine: "—" };
	}
	const d = new Date(ms);
	const dateLine = new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
	}).format(d);
	const timeLine = new Intl.DateTimeFormat(undefined, {
		hour: "numeric",
		minute: "2-digit",
	}).format(d);
	return { dateLine, timeLine };
}

/**
 * **Preview** upcoming key title: opponent from `teamId`’s perspective, then local date and local time.
 * Doubleheader marker rides on the opponent line.
 */
function formatUpcomingPreviewTitleForTeam(
	game: MlbScheduleGame,
	teamId: number,
): string {
	const g2 = game.gameNumber > 1 ? " · G2" : "";
	const a = game.teams.away;
	const h = game.teams.home;
	const awayAbbr = abbrevForTeamId(a.team.id);
	const homeAbbr = abbrevForTeamId(h.team.id);
	let oppLine: string;
	if (teamId === a.team.id) {
		oppLine = `@ ${homeAbbr}${g2}`;
	} else if (teamId === h.team.id) {
		oppLine = `vs ${awayAbbr}${g2}`;
	} else {
		oppLine = `${awayAbbr} @ ${homeAbbr}${g2}`;
	}
	const { dateLine, timeLine } = formatUpcomingPreviewLocalDateTime(game);
	return `${oppLine}\n${dateLine}\n${timeLine}`;
}

/**
 * Three-line title: game date, then away line and home line (`"Apr 3\\nAWY 3\\nHOM 5"`).
 */
export function formatGameScoreTitle(game: MlbScheduleGame): string {
	const a = game.teams.away;
	const h = game.teams.home;
	const awayAbbr = abbrevForTeamId(a.team.id);
	const homeAbbr = abbrevForTeamId(h.team.id);
	const awayScore = a.score ?? 0;
	const homeScore = h.score ?? 0;
	const head = formatGameDateHeader(game);
	return `${head}\n${awayAbbr} ${awayScore}\n${homeAbbr} ${homeScore}`;
}

/**
 * Title for one cycle slot: **recent** slots use scores (with date). **Upcoming** uses scores for Live/Final;
 * otherwise for **Preview**, opponent + local date/time in the runtime’s local timezone (see
 * {@link formatUpcomingPreviewTitleForTeam}).
 */
export function formatMlbCycleGameTitle(
	game: MlbScheduleGame,
	role: "upcoming" | "recent",
	teamId?: number,
): string {
	const state = game.status.abstractGameState;
	if (role === "recent" || state === "Live" || state === "Final") {
		const isFinal = state === "Final";
		if (!isFinal || teamId === undefined || !Number.isFinite(teamId)) {
			return formatGameScoreTitle(game);
		}
		const a = game.teams.away;
		const h = game.teams.home;
		const awayAbbr = abbrevForTeamId(a.team.id);
		const homeAbbr = abbrevForTeamId(h.team.id);
		const awayScore = a.score ?? 0;
		const homeScore = h.score ?? 0;
		const head = formatGameDateHeader(game);
		if (teamId === a.team.id) {
			const marker = awayScore > homeScore ? "✅" : awayScore < homeScore ? "❌" : "";
			if (!marker) {
				return `${head}\n${awayAbbr} ${awayScore}\n${homeAbbr} ${homeScore}`;
			}
			return `${head}\n${awayAbbr} ${awayScore}\n${marker}`;
		}
		if (teamId === h.team.id) {
			const marker = homeScore > awayScore ? "✅" : homeScore < awayScore ? "❌" : "";
			if (!marker) {
				return `${head}\n${awayAbbr} ${awayScore}\n${homeAbbr} ${homeScore}`;
			}
			return `${head}\n${homeAbbr} ${homeScore}\n${marker}`;
		}
		return formatGameScoreTitle(game);
	}
	if (teamId !== undefined && Number.isFinite(teamId)) {
		return formatUpcomingPreviewTitleForTeam(game, teamId);
	}
	const a = game.teams.away;
	const h = game.teams.home;
	const awayAbbr = abbrevForTeamId(a.team.id);
	const homeAbbr = abbrevForTeamId(h.team.id);
	const { dateLine, timeLine } = formatUpcomingPreviewLocalDateTime(game);
	const g2 = game.gameNumber > 1 ? " · G2" : "";
	return `${awayAbbr} @ ${homeAbbr}${g2}\n${dateLine}\n${timeLine}`;
}

function scheduleUrl(teamId: number, startDate: string, endDate: string): string {
	const q = new URLSearchParams({
		sportId: "1",
		teamId: String(teamId),
		startDate,
		endDate,
	});
	return `${MLB_STATS_SCHEDULE}?${q.toString()}`;
}

/**
 * Keep lookback short and recent.
 *
 * The MLB schedule endpoint can truncate very large windows in ways that skip
 * current-season games for some teams. A 10-day lookback is enough for recent
 * finals while reliably keeping current games in the payload.
 */
const CYCLE_PAST_DAYS = 10;
/** Enough lookahead that “next upcoming” is usually in the payload without another request. */
const CYCLE_FUTURE_DAYS = 60;
/** Small lookback keeps delayed / pregame entries in range without scanning full history. */
const UPCOMING_PAST_DAYS = 1;

async function fetchScheduleGamesForTeam(
	teamId: number,
	startDate: string,
	endDate: string,
	init?: RequestInit & { signal?: AbortSignal },
): Promise<MlbScheduleGame[]> {
	const url = scheduleUrl(teamId, startDate, endDate);
	const res = await fetch(url, init);
	if (!res.ok) {
		throw new Error(`MLB schedule HTTP ${res.status}`);
	}
	const body = (await res.json()) as ScheduleResponse;
	return flattenGames(body);
}

/**
 * Loads schedule for `teamId` from roughly the last {@link CYCLE_PAST_DAYS} Eastern calendar days through
 * {@link CYCLE_FUTURE_DAYS} days ahead, then {@link buildMlbGameScoreCycleViews}.
 */
export async function fetchMlbGameScoreCycleViews(
	teamId: number,
	init?: RequestInit & { signal?: AbortSignal },
): Promise<MlbGameScoreCycleViews> {
	const end = mlbDateStringEastern(
		new Date(Date.now() + CYCLE_FUTURE_DAYS * 24 * 60 * 60 * 1000),
	);
	const start = mlbDateStringEastern(
		new Date(Date.now() - CYCLE_PAST_DAYS * 24 * 60 * 60 * 1000),
	);
	const games = await fetchScheduleGamesForTeam(teamId, start, end, init);
	return buildMlbGameScoreCycleViews(games, teamId);
}

/**
 * Loads schedule for `teamId` from a small recent lookback window through {@link CYCLE_FUTURE_DAYS} days
 * ahead, then {@link pickNextUpcomingGame}.
 */
export async function fetchNextUpcomingMlbGame(
	teamId: number,
	init?: RequestInit & { signal?: AbortSignal },
): Promise<MlbScheduleGame | null> {
	const end = mlbDateStringEastern(
		new Date(Date.now() + CYCLE_FUTURE_DAYS * 24 * 60 * 60 * 1000),
	);
	const start = mlbDateStringEastern(
		new Date(Date.now() - UPCOMING_PAST_DAYS * 24 * 60 * 60 * 1000),
	);
	const games = await fetchScheduleGamesForTeam(teamId, start, end, init);
	return pickNextUpcomingGame(games, teamId);
}

/**
 * Loads schedule for `teamId` from a small recent lookback window through {@link CYCLE_FUTURE_DAYS} days
 * ahead, then {@link pickCurrentOrNextGame}.
 */
export async function fetchCurrentOrNextMlbGame(
	teamId: number,
	init?: RequestInit & { signal?: AbortSignal },
): Promise<MlbScheduleGame | null> {
	const end = mlbDateStringEastern(
		new Date(Date.now() + CYCLE_FUTURE_DAYS * 24 * 60 * 60 * 1000),
	);
	const start = mlbDateStringEastern(
		new Date(Date.now() - UPCOMING_PAST_DAYS * 24 * 60 * 60 * 1000),
	);
	const games = await fetchScheduleGamesForTeam(teamId, start, end, init);
	return pickCurrentOrNextGame(games, teamId);
}

/**
 * Loads schedule for `teamId` from roughly the last 10 calendar days (Eastern) through tomorrow,
 * then {@link pickRelevantScoreGame}.
 */
export async function fetchTeamScorePick(
	teamId: number,
	init?: RequestInit & { signal?: AbortSignal },
): Promise<MlbScorePick> {
	const end = mlbDateStringEastern(
		new Date(Date.now() + 24 * 60 * 60 * 1000),
	);
	const start = mlbDateStringEastern(
		new Date(Date.now() - CYCLE_PAST_DAYS * 24 * 60 * 60 * 1000),
	);
	const games = await fetchScheduleGamesForTeam(teamId, start, end, init);
	return pickRelevantScoreGame(games, teamId);
}
