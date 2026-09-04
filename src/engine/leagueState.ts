import { remainingGames, remainingHeadToHead } from './standings.ts';
import { teamsOf } from './teams.ts';
import type { LeagueId, SeasonShape, TeamId, TeamRecord, WinLoss } from './types.ts';

/**
 * マジック・敗退判定・シミュレーションが共通で使う、1リーグ分の「今の状態」。
 * TeamRecord から必要な数字だけを抜き出した軽い形にしてある。
 */
export interface LeagueState {
	league: LeagueId;
	teamIds: TeamId[];
	/** 現在の勝敗分 */
	record: Map<TeamId, { wins: number; losses: number; draws: number }>;
	/** 残り試合数（143 − 消化数）。中止で再編成待ちの試合も含む */
	remaining: Map<TeamId, number>;
	/** 残り直接対決数 */
	h2h: Map<TeamId, Map<TeamId, number>>;
}

export function buildLeagueState(
	records: ReadonlyMap<TeamId, TeamRecord>,
	league: LeagueId,
	season: SeasonShape
): LeagueState {
	const teamIds = teamsOf(league).map((t) => t.id);
	const record = new Map<TeamId, { wins: number; losses: number; draws: number }>();
	const remaining = new Map<TeamId, number>();

	for (const id of teamIds) {
		const source = records.get(id);
		if (!source) throw new Error(`成績が見つからない: ${id}`);
		record.set(id, { wins: source.wins, losses: source.losses, draws: source.draws });
		remaining.set(id, remainingGames(source, season));
	}

	return {
		league,
		teamIds,
		record,
		remaining,
		h2h: remainingHeadToHead(records, league, season)
	};
}

export function currentOf(
	state: LeagueState,
	teamId: TeamId
): {
	wins: number;
	losses: number;
	draws: number;
} {
	const value = state.record.get(teamId);
	if (!value) throw new Error(`成績が見つからない: ${teamId}`);
	return value;
}

export function remainingOf(state: LeagueState, teamId: TeamId): number {
	return state.remaining.get(teamId) ?? 0;
}

export function h2hOf(state: LeagueState, a: TeamId, b: TeamId): number {
	return state.h2h.get(a)?.get(b) ?? 0;
}

/** 引き分けを考えない前提での最終成績（残りを w 勝 / それ以外は全敗とした場合） */
export function finalRecord(current: WinLoss, remaining: number, wins: number): WinLoss {
	return { wins: current.wins + wins, losses: current.losses + (remaining - wins) };
}
