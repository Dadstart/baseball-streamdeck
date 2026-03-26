/**
 * @module services/mlb-schedule
 *
 * Fetches team schedules from the **MLB Stats API** and picks the best game for score display:
 * an in-progress game if any, otherwise the most recent completed ({@link abstractGameState} `Final`).
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
	const live = mine.filter((g) => g.status.abstractGameState === "Live");
	if (live.length > 0) {
		return { kind: "live", game: live[live.length - 1]! };
	}
	const finals = mine.filter((g) => g.status.abstractGameState === "Final");
	if (finals.length > 0) {
		return { kind: "final", game: finals[finals.length - 1]! };
	}
	return { kind: "none" };
}

function abbrevForTeamId(id: number): string {
	return getMlbTeamById(id)?.abbreviation ?? String(id);
}

/**
 * Two-line title: away line, then home line (`"AWY 3\\nHOM 5"`).
 */
export function formatGameScoreTitle(game: MlbScheduleGame): string {
	const a = game.teams.away;
	const h = game.teams.home;
	const awayAbbr = abbrevForTeamId(a.team.id);
	const homeAbbr = abbrevForTeamId(h.team.id);
	const awayScore = a.score ?? 0;
	const homeScore = h.score ?? 0;
	return `${awayAbbr} ${awayScore}\n${homeAbbr} ${homeScore}`;
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
 * Loads schedule for `teamId` from roughly the last 730 calendar days (Eastern) through tomorrow,
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
		new Date(Date.now() - 730 * 24 * 60 * 60 * 1000),
	);
	const url = scheduleUrl(teamId, start, end);
	const res = await fetch(url, init);
	if (!res.ok) {
		throw new Error(`MLB schedule HTTP ${res.status}`);
	}
	const body = (await res.json()) as ScheduleResponse;
	return pickRelevantScoreGame(flattenGames(body), teamId);
}
