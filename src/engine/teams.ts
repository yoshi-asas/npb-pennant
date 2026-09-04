import type { LeagueId, Team, TeamId } from './types.ts';

/**
 * 12球団のマスタ。
 * prevRank は2025年の最終順位（NPB公式 年度別成績より）。
 *   セ: 阪神 / DeNA / 巨人 / 中日 / 広島 / ヤクルト
 *   パ: ソフトバンク / 日本ハム / オリックス / 楽天 / 西武 / ロッテ
 */
export const TEAMS: readonly Team[] = [
	{
		id: 't',
		league: 'central',
		name: '阪神タイガース',
		short: '阪神',
		slug: 'tigers',
		color: '#f2c200',
		prevRank: 1
	},
	{
		id: 'db',
		league: 'central',
		name: '横浜DeNAベイスターズ',
		short: 'DeNA',
		slug: 'baystars',
		color: '#0091e1',
		prevRank: 2
	},
	{
		id: 'g',
		league: 'central',
		name: '読売ジャイアンツ',
		short: '巨人',
		slug: 'giants',
		color: '#f97709',
		prevRank: 3
	},
	{
		id: 'd',
		league: 'central',
		name: '中日ドラゴンズ',
		short: '中日',
		slug: 'dragons',
		color: '#002569',
		prevRank: 4
	},
	{
		id: 'c',
		league: 'central',
		name: '広島東洋カープ',
		short: '広島',
		slug: 'carp',
		color: '#e60012',
		prevRank: 5
	},
	{
		id: 's',
		league: 'central',
		name: '東京ヤクルトスワローズ',
		short: 'ヤクルト',
		slug: 'swallows',
		color: '#00913a',
		prevRank: 6
	},
	{
		id: 'h',
		league: 'pacific',
		name: '福岡ソフトバンクホークス',
		short: 'ソフトバンク',
		slug: 'hawks',
		color: '#f5c400',
		prevRank: 1
	},
	{
		id: 'f',
		league: 'pacific',
		name: '北海道日本ハムファイターズ',
		short: '日本ハム',
		slug: 'fighters',
		color: '#005bac',
		prevRank: 2
	},
	{
		id: 'b',
		league: 'pacific',
		name: 'オリックス・バファローズ',
		short: 'オリックス',
		slug: 'buffaloes',
		color: '#9e7c42',
		prevRank: 3
	},
	{
		id: 'e',
		league: 'pacific',
		name: '東北楽天ゴールデンイーグルス',
		short: '楽天',
		slug: 'eagles',
		color: '#860010',
		prevRank: 4
	},
	{
		id: 'l',
		league: 'pacific',
		name: '埼玉西武ライオンズ',
		short: '西武',
		slug: 'lions',
		color: '#102961',
		prevRank: 5
	},
	{
		id: 'm',
		league: 'pacific',
		name: '千葉ロッテマリーンズ',
		short: 'ロッテ',
		slug: 'marines',
		color: '#231815',
		prevRank: 6
	}
];

export const TEAM_BY_ID: ReadonlyMap<TeamId, Team> = new Map(TEAMS.map((t) => [t.id, t]));

/** npb.jp 日程表の表記（巨人 / DeNA など）から球団を引く */
export const TEAM_BY_SHORT: ReadonlyMap<string, Team> = new Map(TEAMS.map((t) => [t.short, t]));

export const TEAM_BY_SLUG: ReadonlyMap<string, Team> = new Map(TEAMS.map((t) => [t.slug, t]));

export function teamsOf(league: LeagueId): Team[] {
	return TEAMS.filter((t) => t.league === league);
}

export function getTeam(id: TeamId): Team {
	const team = TEAM_BY_ID.get(id);
	if (!team) throw new Error(`未知の球団ID: ${id}`);
	return team;
}

export const LEAGUE_NAMES: Record<LeagueId, { full: string; short: string; slug: string }> = {
	central: { full: 'セントラル・リーグ', short: 'セ・リーグ', slug: 'central' },
	pacific: { full: 'パシフィック・リーグ', short: 'パ・リーグ', slug: 'pacific' }
};
