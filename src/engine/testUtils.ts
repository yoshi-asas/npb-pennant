import type { HeadToHead, LeagueId, TeamId, TeamRecord } from './types.ts';
import { getTeam } from './teams.ts';

/** テスト用に TeamRecord を組み立てる。省略した項目は 0 埋め */
export function makeRecord(
	teamId: TeamId,
	init: Partial<Omit<TeamRecord, 'teamId' | 'league'>> = {}
): TeamRecord {
	const wins = init.wins ?? 0;
	const losses = init.losses ?? 0;
	const draws = init.draws ?? 0;
	return {
		teamId,
		league: getTeam(teamId).league,
		games: init.games ?? wins + losses + draws,
		wins,
		losses,
		draws,
		runsScored: init.runsScored ?? 0,
		runsAllowed: init.runsAllowed ?? 0,
		leagueWins: init.leagueWins ?? wins,
		leagueLosses: init.leagueLosses ?? losses,
		leagueDraws: init.leagueDraws ?? draws,
		h2h: init.h2h ?? ({} as Record<TeamId, HeadToHead>)
	};
}

/** a 対 b の対戦成績を両方向に書き込む */
export function setHeadToHead(
	records: Map<TeamId, TeamRecord>,
	a: TeamId,
	b: TeamId,
	wins: number,
	losses: number,
	draws = 0
): void {
	const recordA = records.get(a);
	const recordB = records.get(b);
	if (!recordA || !recordB) throw new Error('球団が見つからない');
	recordA.h2h[b] = { wins, losses, draws };
	recordB.h2h[a] = { wins: losses, losses: wins, draws };
}

export function recordMap(records: TeamRecord[]): Map<TeamId, TeamRecord> {
	return new Map(records.map((r) => [r.teamId, r]));
}

export const CENTRAL: LeagueId = 'central';
export const PACIFIC: LeagueId = 'pacific';

/** テスト用に LeagueState を直接組み立てる（143試合の前提に縛られずシナリオを作れる） */
export function makeState(
	league: LeagueId,
	teams: { id: TeamId; wins: number; losses: number; draws?: number; remaining: number }[],
	pairs: [TeamId, TeamId, number][]
): import('./leagueState.ts').LeagueState {
	const teamIds = teams.map((t) => t.id);
	const record = new Map(
		teams.map((t) => [t.id, { wins: t.wins, losses: t.losses, draws: t.draws ?? 0 }])
	);
	const remaining = new Map(teams.map((t) => [t.id, t.remaining]));
	const h2h = new Map<TeamId, Map<TeamId, number>>(teamIds.map((id) => [id, new Map()]));
	for (const [a, b, games] of pairs) {
		h2h.get(a)?.set(b, games);
		h2h.get(b)?.set(a, games);
	}
	for (const a of teamIds) {
		for (const b of teamIds) {
			if (a !== b && !h2h.get(a)?.has(b)) h2h.get(a)?.set(b, 0);
		}
	}
	return { league, teamIds, record, remaining, h2h };
}
