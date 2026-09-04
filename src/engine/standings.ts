import { TEAMS, getTeam } from './teams.ts';
import type { Game, HeadToHead, LeagueId, SeasonShape, TeamId, TeamRecord } from './types.ts';

function emptyRecord(teamId: TeamId): TeamRecord {
	return {
		teamId,
		league: getTeam(teamId).league,
		games: 0,
		wins: 0,
		losses: 0,
		draws: 0,
		runsScored: 0,
		runsAllowed: 0,
		leagueWins: 0,
		leagueLosses: 0,
		leagueDraws: 0,
		h2h: {} as Record<TeamId, HeadToHead>
	};
}

function h2hSlot(record: TeamRecord, opponent: TeamId): HeadToHead {
	let slot = record.h2h[opponent];
	if (!slot) {
		slot = { wins: 0, losses: 0, draws: 0 };
		record.h2h[opponent] = slot;
	}
	return slot;
}

/**
 * 試合ログから全球団の成績を復元する。
 * 中止（cancelled）と未実施（scheduled）は消化試合に数えない。
 */
export function buildRecords(games: readonly Game[]): Map<TeamId, TeamRecord> {
	const records = new Map<TeamId, TeamRecord>(TEAMS.map((t) => [t.id, emptyRecord(t.id)]));

	for (const game of games) {
		if (game.status !== 'final') continue;
		if (game.homeScore === null || game.awayScore === null) continue;

		const home = records.get(game.home);
		const away = records.get(game.away);
		if (!home || !away) throw new Error(`未知の球団: ${game.home} vs ${game.away}`);

		const sameLeague = home.league === away.league;
		const homeH2h = h2hSlot(home, game.away);
		const awayH2h = h2hSlot(away, game.home);

		home.games++;
		away.games++;
		home.runsScored += game.homeScore;
		home.runsAllowed += game.awayScore;
		away.runsScored += game.awayScore;
		away.runsAllowed += game.homeScore;

		if (game.homeScore > game.awayScore) {
			home.wins++;
			away.losses++;
			homeH2h.wins++;
			awayH2h.losses++;
			if (sameLeague) {
				home.leagueWins++;
				away.leagueLosses++;
			}
		} else if (game.homeScore < game.awayScore) {
			away.wins++;
			home.losses++;
			awayH2h.wins++;
			homeH2h.losses++;
			if (sameLeague) {
				away.leagueWins++;
				home.leagueLosses++;
			}
		} else {
			home.draws++;
			away.draws++;
			homeH2h.draws++;
			awayH2h.draws++;
			if (sameLeague) {
				home.leagueDraws++;
				away.leagueDraws++;
			}
		}
	}

	return records;
}

/** 残り試合数 = 総試合数 − 消化試合数。中止で再編成待ちの試合も自動的にここに含まれる */
export function remainingGames(record: TeamRecord, season: SeasonShape): number {
	return season.totalGames - record.games;
}

/**
 * 同一リーグ内の残り直接対決数の行列。
 *
 * 日程表の未消化カードを数えるのではなく `25 −（消化数）` で導出する。
 * こうすると雨天中止でまだ再編成日が決まっていない試合も取りこぼさない。
 */
export function remainingHeadToHead(
	records: ReadonlyMap<TeamId, TeamRecord>,
	league: LeagueId,
	season: SeasonShape
): Map<TeamId, Map<TeamId, number>> {
	const teams = TEAMS.filter((t) => t.league === league);
	const matrix = new Map<TeamId, Map<TeamId, number>>();

	for (const a of teams) {
		const row = new Map<TeamId, number>();
		const recordA = records.get(a.id);
		if (!recordA) throw new Error(`成績が見つからない: ${a.id}`);

		for (const b of teams) {
			if (a.id === b.id) continue;
			const played = recordA.h2h[b.id];
			const playedCount = played ? played.wins + played.losses + played.draws : 0;
			row.set(b.id, Math.max(0, season.intraLeagueGamesPerPair - playedCount));
		}
		matrix.set(a.id, row);
	}

	return matrix;
}

/** ゲーム差 = ((首位勝 − 対象勝) + (対象敗 − 首位敗)) / 2 */
export function gamesBehind(leader: TeamRecord, team: TeamRecord): number {
	return (leader.wins - team.wins + (team.losses - leader.losses)) / 2;
}
