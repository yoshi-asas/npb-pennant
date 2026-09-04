/**
 * xorshift128+ 。シードを固定すれば完全に再現するので、
 * ビルド時（Node）とブラウザ（Web Worker）で同じ結果を出せる。
 */
export class Random {
	private s0: number;
	private s1: number;
	private s2: number;
	private s3: number;

	constructor(seed: number) {
		// splitmix32 で状態を撹拌してから使う
		let x = seed >>> 0;
		const next = () => {
			x = (x + 0x9e3779b9) >>> 0;
			let z = x;
			z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
			z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
			return (z ^ (z >>> 15)) >>> 0;
		};
		this.s0 = next();
		this.s1 = next();
		this.s2 = next();
		this.s3 = next();
		if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
	}

	/** [0, 1) の一様乱数 */
	next(): number {
		// xoshiro128+
		const result = (this.s0 + this.s3) >>> 0;
		const t = (this.s1 << 9) >>> 0;

		this.s2 ^= this.s0;
		this.s3 ^= this.s1;
		this.s1 ^= this.s2;
		this.s0 ^= this.s3;
		this.s2 ^= t;
		this.s3 = ((this.s3 << 11) | (this.s3 >>> 21)) >>> 0;

		return result / 4294967296;
	}
}
