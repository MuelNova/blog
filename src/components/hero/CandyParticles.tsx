import { useEffect, useRef } from 'react';

/**
 * CandyParticles — hero 软糖粒子层（Canvas 2D）
 *
 * 两层：远层（小、多、清晰）+ 近层（大、少、blur(8px) 景深）。
 * 颜色从 CSS 变量读取（--color-primary / --color-accent / --color-accent-2 / --color-primary-light），
 * 监听 `theme:change` 事件换色。鼠标 150px 力场推开粒子，lerp 平滑。
 * 移动端（pointer:coarse 或窄屏）粒子数减半、近层去 blur。
 * prefers-reduced-motion：只绘制静态一帧，不循环。
 */

const THEME_CHANGE_EVENT = 'theme:change';
const PALETTE_VARS = [
	'--color-primary',
	'--color-accent',
	'--color-accent-2',
	'--color-primary-light',
];
const FALLBACK_PALETTE = ['#FFB583', '#FFD3E0', '#BBE9F2', '#FFC9A3'];
const FORCE_RADIUS = 150;
const FORCE_STRENGTH = 64; // px，力场最大位移
const LERP = 0.08;

type Shape = 0 | 1 | 2; // 0 圆点 | 1 圆角方块 | 2 花瓣

interface Particle {
	x: number;
	y: number;
	size: number;
	colorIdx: number;
	rise: number; // 上浮速度 px/s
	freq: number; // 正弦漂移频率
	amp: number; // 正弦漂移幅度 px
	phase: number;
	alpha: number;
	shape: Shape;
	rot: number;
	rotSpeed: number;
	ox: number; // 力场偏移（lerp 平滑）
	oy: number;
}

interface LayerConfig {
	count: number;
	sizeMin: number;
	sizeMax: number;
	riseMin: number;
	riseMax: number;
	alphaMin: number;
	alphaMax: number;
}

interface Layer {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	cfg: LayerConfig;
	particles: Particle[];
}

function rand(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

function makeParticles(w: number, h: number, cfg: LayerConfig): Particle[] {
	const list: Particle[] = [];
	for (let i = 0; i < cfg.count; i++) {
		list.push({
			x: Math.random() * w,
			y: Math.random() * h,
			size: rand(cfg.sizeMin, cfg.sizeMax),
			colorIdx: Math.floor(Math.random() * PALETTE_VARS.length),
			rise: rand(cfg.riseMin, cfg.riseMax),
			freq: rand(0.3, 1.1),
			amp: rand(8, 36),
			phase: Math.random() * Math.PI * 2,
			alpha: rand(cfg.alphaMin, cfg.alphaMax),
			shape: (Math.floor(Math.random() * 3) as Shape),
			rot: Math.random() * Math.PI * 2,
			rotSpeed: rand(-0.4, 0.4),
			ox: 0,
			oy: 0,
		});
	}
	return list;
}

function drawParticle(
	ctx: CanvasRenderingContext2D,
	p: Particle,
	palette: string[],
	t: number
): void {
	const drift = Math.sin(t * p.freq + p.phase) * p.amp;
	const x = p.x + drift + p.ox;
	const y = p.y + p.oy;
	const r = p.size / 2;

	ctx.save();
	ctx.globalAlpha = p.alpha;
	ctx.fillStyle = palette[p.colorIdx % palette.length];
	ctx.translate(x, y);
	ctx.rotate(p.rot);

	if (p.shape === 0) {
		ctx.beginPath();
		ctx.arc(0, 0, r, 0, Math.PI * 2);
		ctx.fill();
	} else if (p.shape === 1) {
		const rr = Math.min(r * 0.7, 6);
		ctx.beginPath();
		ctx.roundRect(-r, -r, p.size, p.size, rr);
		ctx.fill();
	} else {
		// 花瓣：四瓣椭圆
		for (let i = 0; i < 4; i++) {
			ctx.save();
			ctx.rotate((i * Math.PI) / 2);
			ctx.beginPath();
			ctx.ellipse(0, -r * 0.55, r * 0.42, r * 0.62, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
	}
	ctx.restore();
}

export default function CandyParticles() {
	const wrapRef = useRef<HTMLDivElement>(null);
	const farRef = useRef<HTMLCanvasElement>(null);
	const nearRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const wrap = wrapRef.current;
		const farCanvas = farRef.current;
		const nearCanvas = nearRef.current;
		if (!wrap || !farCanvas || !nearCanvas) return;

		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const coarse =
			window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;

		// 近层景深：移动端去掉 blur
		nearCanvas.style.filter = coarse ? 'none' : 'blur(8px)';

		const farCfg: LayerConfig = coarse
			? { count: 36, sizeMin: 3, sizeMax: 7, riseMin: 6, riseMax: 18, alphaMin: 0.25, alphaMax: 0.6 }
			: { count: 72, sizeMin: 3, sizeMax: 8, riseMin: 6, riseMax: 20, alphaMin: 0.25, alphaMax: 0.65 };
		const nearCfg: LayerConfig = coarse
			? { count: 12, sizeMin: 14, sizeMax: 26, riseMin: 10, riseMax: 26, alphaMin: 0.35, alphaMax: 0.7 }
			: { count: 26, sizeMin: 16, sizeMax: 32, riseMin: 10, riseMax: 28, alphaMin: 0.4, alphaMax: 0.75 };

		const readPalette = (): string[] => {
			const cs = getComputedStyle(document.documentElement);
			const colors = PALETTE_VARS.map((v) => cs.getPropertyValue(v).trim()).filter(Boolean);
			return colors.length > 0 ? colors : FALLBACK_PALETTE;
		};
		let palette = readPalette();

		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		let w = 0;
		let h = 0;

		const layers: Layer[] = [];
		for (const [canvas, cfg] of [
			[farCanvas, farCfg],
			[nearCanvas, nearCfg],
		] as const) {
			const ctx = canvas.getContext('2d');
			if (ctx) layers.push({ canvas, ctx, cfg, particles: [] });
		}

		const setup = () => {
			w = wrap.clientWidth;
			h = wrap.clientHeight;
			if (w === 0 || h === 0) return;
			for (const layer of layers) {
				layer.canvas.width = Math.round(w * dpr);
				layer.canvas.height = Math.round(h * dpr);
				layer.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
				layer.particles = makeParticles(w, h, layer.cfg);
			}
		};
		setup();

		const drawFrame = (t: number) => {
			for (const layer of layers) {
				layer.ctx.clearRect(0, 0, w, h);
				for (const p of layer.particles) {
					drawParticle(layer.ctx, p, palette, t);
				}
			}
		};

		const mouse = { x: -9999, y: -9999 };
		const onPointerMove = (e: PointerEvent) => {
			const rect = wrap.getBoundingClientRect();
			mouse.x = e.clientX - rect.left;
			mouse.y = e.clientY - rect.top;
		};
		const onPointerLeave = () => {
			mouse.x = -9999;
			mouse.y = -9999;
		};

		let raf = 0;
		let last = performance.now();
		let t = 0;

		const tick = (now: number) => {
			const dt = Math.min((now - last) / 1000, 0.05);
			last = now;
			t += dt;

			for (const layer of layers) {
				layer.ctx.clearRect(0, 0, w, h);
				for (const p of layer.particles) {
					p.y -= p.rise * dt;
					p.rot += p.rotSpeed * dt;

					// 鼠标力场：150px 内推开，力随距离衰减，lerp 平滑
					const dx = p.x - mouse.x;
					const dy = p.y - mouse.y;
					const d = Math.hypot(dx, dy);
					let tx = 0;
					let ty = 0;
					if (d < FORCE_RADIUS && d > 0.01) {
						const f = (1 - d / FORCE_RADIUS) * FORCE_STRENGTH;
						tx = (dx / d) * f;
						ty = (dy / d) * f;
					}
					p.ox += (tx - p.ox) * LERP;
					p.oy += (ty - p.oy) * LERP;

					if (p.y < -p.size * 2) {
						p.y = h + p.size;
						p.x = Math.random() * w;
					}
					drawParticle(layer.ctx, p, palette, t);
				}
			}
			raf = requestAnimationFrame(tick);
		};

		const onThemeChange = () => {
			palette = readPalette();
			if (reduceMotion) drawFrame(1.5);
		};

		const resizeObserver = new ResizeObserver(() => {
			setup();
			if (reduceMotion) drawFrame(1.5);
		});
		resizeObserver.observe(wrap);
		window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);

		if (reduceMotion) {
			// 静态一帧，不循环
			drawFrame(1.5);
		} else {
			if (!coarse) {
				window.addEventListener('pointermove', onPointerMove, { passive: true });
				window.addEventListener('pointerleave', onPointerLeave, { passive: true });
			}
			raf = requestAnimationFrame(tick);
		}

		return () => {
			cancelAnimationFrame(raf);
			resizeObserver.disconnect();
			window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerleave', onPointerLeave);
		};
	}, []);

	return (
		<div
			ref={wrapRef}
			className="pointer-events-none absolute inset-0 overflow-hidden"
			aria-hidden="true"
		>
			<canvas ref={farRef} className="absolute inset-0 h-full w-full" />
			<canvas ref={nearRef} className="absolute inset-0 h-full w-full" />
		</div>
	);
}
