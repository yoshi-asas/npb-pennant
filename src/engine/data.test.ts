import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rankTeams } from './compare.ts';
import { buildRecords, remainingHeadToHead } from './standings.ts';
import { getTeam, teamsOf, TEAMS } from './teams.ts';
import { SEASON_2026, type Game, type LeagueId } from './types.ts';

/**
 * コミットされている games.json 自体の整合性チェック。
 * ネットワークを使わないので CI でも毎回走る（公式との照合は scripts/verify-standings.ts）。
 */
const games = JSON.parse(readFileSync('data/2026/games.json', 'utf8')) as Game[];
const records = buildRecords(games);

describe('games.json の整合性', () => {
	it('全試合が12球団のいずれかで、日付が YYYY-MM-DD 形式', () => {
		const ids = new Set(TEAMS.map((t) => t.id));
		for (const game of games) {
			expect(ids.has(game.home), `未知のホーム: ${game.home}`).toBe(true);
			expect(ids.has(game.away), `未知のビジター: ${game.away}`).toBe(true);
			expect(game.home).not.toBe(game.away);
			expect(game.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
		}
	});

	it('確定試合はスコアを持ち、未確定試合は持たない', () => {
		for (const game of games) {
			if (game.status === 'final') {
				expect(game.homeScore).not.toBeNull();
				expect(game.awayScore).not.toBeNull();
			} else {
				expect(game.homeScore).toBeNull();
				expect(game.awayScore).toBeNull();
			}
		}
	});

	it('どの球団も143試合を超えていない', () => {
		for (const team of TEAMS) {
			const record = records.get(team.id)!;
			expect(record.games, team.short).toBeLessThanOrEqual(SEASON_2026.totalGames);
			expect(record.games).toBe(record.wins + record.losses + record.draws);
		}
	});

	it('対戦成績が両方向で一致している', () => {
		for (const team of TEAMS) {
			const record = records.get(team.id)!;
			for (const opponent of TEAMS) {
				if (opponent.id === team.id) continue;
				const mine = record.h2h[opponent.id];
				const theirs = records.get(opponent.id)!.h2h[team.id];
				if (!mine && !theirs) continue;
				expect(mine?.wins ?? 0, `${team.short} 対 ${opponent.short}`).toBe(theirs?.losses ?? 0);
				expect(mine?.draws ?? 0).toBe(theirs?.draws ?? 0);
			}
		}
	});

	it('同一リーグの対戦は25試合を超えず、残り試合数と辻褄が合う', () => {
		for (const league of ['central', 'pacific'] as LeagueId[]) {
			const matrix = remainingHeadToHead(records, league, SEASON_2026);
			for (const team of teamsOf(league)) {
				const record = records.get(team.id)!;
				for (const opponent of teamsOf(league)) {
					if (opponent.id === team.id) continue;
					const h2h = record.h2h[opponent.id];
					const played = h2h ? h2h.wins + h2h.losses + h2h.draws : 0;
					expect(played, `${team.short} 対 ${opponent.short}`).toBeLessThanOrEqual(
						SEASON_2026.intraLeagueGamesPerPair
					);
				}
				// 交流戦は終了しているので、残り試合は全て同一リーグ内のはず
				const remainingIntra = [...(matrix.get(team.id)?.values() ?? [])].reduce(
					(a, b) => a + b,
					0
				);
				expect(remainingIntra, team.short).toBe(SEASON_2026.totalGames - record.games);
			}
		}
	});

	it('リーグ戦と交流戦の内訳が総成績と一致する', () => {
		for (const team of TEAMS) {
			const record = records.get(team.id)!;
			expect(record.leagueWins).toBeLessThanOrEqual(record.wins);
			const interleagueGames =
				record.games - (record.leagueWins + record.leagueLosses + record.leagueDraws);
			expect(interleagueGames, team.short).toBe(
				SEASON_2026.interLeagueGamesPerPair * 6 // 交流戦18試合（終了済み）
			);
		}
	});

	it('順位表が矛盾なく並ぶ（同順位が発生しない）', () => {
		for (const league of ['central', 'pacific'] as LeagueId[]) {
			const ranked = rankTeams(
				teamsOf(league).map((t) => records.get(t.id)!),
				league
			);
			expect(ranked).toHaveLength(6);
			expect(new Set(ranked.map((r) => r.teamId)).size).toBe(6);
			// 勝率は単調に下がるはず
			for (let i = 1; i < ranked.length; i++) {
				const above = ranked[i - 1]!;
				const below = ranked[i]!;
				const pctAbove = above.wins / (above.wins + above.losses);
				const pctBelow = below.wins / (below.wins + below.losses);
				expect(
					pctAbove,
					`${getTeam(above.teamId).short} >= ${getTeam(below.teamId).short}`
				).toBeGreaterThanOrEqual(pctBelow - 1e-12);
			}
		}
	});
});
