import { readFile } from 'node:fs/promises';
import { getTeam, TEAMS } from '../src/engine/teams.ts';
import type { Game, TeamId } from '../src/engine/types.ts';

const games = JSON.parse(await readFile('data/2026/games.json', 'utf8')) as Game[];

const homeGames = new Map<TeamId, number>();
const awayGames = new Map<TeamId, number>();
const homeWins = new Map<TeamId, number>();
const venues = new Map<TeamId, Map<string, number>>();

for (const game of games) {
	if (game.status !== 'final' || game.homeScore === null || game.awayScore === null) continue;
	homeGames.set(game.home, (homeGames.get(game.home) ?? 0) + 1);
	awayGames.set(game.away, (awayGames.get(game.away) ?? 0) + 1);
	if (game.homeScore > game.awayScore) homeWins.set(game.home, (homeWins.get(game.home) ?? 0) + 1);
	const perTeam = venues.get(game.home) ?? new Map<string, number>();
	perTeam.set(game.venue, (perTeam.get(game.venue) ?? 0) + 1);
	venues.set(game.home, perTeam);
}

console.log('球団       ホーム ビジター ホーム勝  最頻球場');
for (const team of TEAMS) {
	const top = [...(venues.get(team.id) ?? new Map())].sort((a, b) => b[1] - a[1])[0];
	console.log(
		[
			team.short.padEnd(6, '　'),
			String(homeGames.get(team.id) ?? 0).padStart(6),
			String(awayGames.get(team.id) ?? 0).padStart(8),
			String(homeWins.get(team.id) ?? 0).padStart(8),
			`  ${top ? `${top[0]} (${top[1]})` : '-'}`
		].join(' ')
	);
}

for (const league of ['central', 'pacific'] as const) {
	let wins = 0;
	let decided = 0;
	for (const game of games) {
		if (game.status !== 'final' || game.homeScore === null || game.awayScore === null) continue;
		if (getTeam(game.home).league !== league || getTeam(game.away).league !== league) continue;
		if (game.homeScore === game.awayScore) continue;
		decided++;
		if (game.homeScore > game.awayScore) wins++;
	}
	const rate = wins / decided;
	// 二項分布の標準誤差
	const stderr = Math.sqrt(0.25 / decided);
	console.log(
		`\n${league}: ホーム ${wins}/${decided} = ${(rate * 100).toFixed(1)}% ` +
			`(.500 からの乖離 ${((rate - 0.5) / stderr).toFixed(1)}σ)`
	);
}
