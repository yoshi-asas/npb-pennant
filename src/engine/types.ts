/** リーグ識別子 */
export type LeagueId = 'central' | 'pacific';

/**
 * 球団ID。npb.jp の試合URL（/scores/2026/0901/g-db-20/）で使われているコードに揃えている。
 * スクレイパーとエンジンで同じIDを使うため、独自のIDは作らない。
 */
export type TeamId =
	| 'g'
	| 't'
	| 'db'
	| 'c'
	| 's'
	| 'd' // セントラル
	| 'h'
	| 'f'
	| 'b'
	| 'e'
	| 'l'
	| 'm'; // パシフィック

export interface Team {
	id: TeamId;
	league: LeagueId;
	/** 正式名称（読売ジャイアンツ） */
	name: string;
	/** npb.jp の日程表に出る表記（巨人）。スクレイパーの照合キーを兼ねる */
	short: string;
	/** URLに使う英字スラッグ（giants） */
	slug: string;
	/** ブランドカラー */
	color: string;
	/** 前年（2025年）最終順位。順位決定の最終タイブレークに使う */
	prevRank: number;
}

/** 試合の状態 */
export type GameStatus =
	/** 確定（スコアあり） */
	| 'final'
	/** 未実施（予定） */
	| 'scheduled'
	/** 中止。再編成された試合は別日の 'scheduled' として日程に現れる */
	| 'cancelled';

export interface Game {
	/** YYYY-MM-DD */
	date: string;
	/** ホーム球団。npb.jp の日程表では team1 がホーム */
	home: TeamId;
	away: TeamId;
	homeScore: number | null;
	awayScore: number | null;
	status: GameStatus;
	venue: string;
	/** 開始時刻 HH:MM（未実施試合のみ） */
	startTime: string | null;
}

/** 対戦相手ごとの成績 */
export interface HeadToHead {
	wins: number;
	losses: number;
	draws: number;
}

/** 試合ログから復元した1球団の成績 */
export interface TeamRecord {
	teamId: TeamId;
	league: LeagueId;
	/** 消化試合数（中止は含まない） */
	games: number;
	wins: number;
	losses: number;
	draws: number;
	runsScored: number;
	runsAllowed: number;
	/** 交流戦を除くリーグ戦のみの成績。順位決定の第4条件に使う */
	leagueWins: number;
	leagueLosses: number;
	leagueDraws: number;
	/** 同一リーグの各対戦相手に対する成績 */
	h2h: Record<TeamId, HeadToHead>;
}

/** 勝敗のみを持つ最小の成績。仮想シナリオの比較に使う */
export interface WinLoss {
	wins: number;
	losses: number;
}

/** シーズン全体の構成。年によって変わりうるのでここに集約する */
export interface SeasonShape {
	/** 1球団あたりの総試合数 */
	totalGames: number;
	/** 同一リーグの1カードあたりの試合数（各球団と25試合） */
	intraLeagueGamesPerPair: number;
	/** 交流戦の1カードあたりの試合数 */
	interLeagueGamesPerPair: number;
}

export const SEASON_2026: SeasonShape = {
	totalGames: 143,
	intraLeagueGamesPerPair: 25,
	interLeagueGamesPerPair: 3
};
