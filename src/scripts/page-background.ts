/**
 * Page Background Script — floating candy particles
 *
 * A single fixed canvas with 10-25 soft dots / rounded shapes that slowly
 * float upward with a sine drift. Colors are sampled from the active theme's
 * CSS variables (--color-primary-rgb, --color-accent, --color-accent-2) at
 * low opacity. Re-colors on `theme:change` and `data-theme` mutations,
 * renders one static frame under `prefers-reduced-motion`, and handles
 * bfcache (pagehide/pageshow) plus resize.
 */

type ParticleShape = 'circle' | 'rounded-rect';

interface Particle {
	/** Base x position (center of the sine drift), in CSS px. */
	baseX: number;
	/** Current y position, in CSS px. */
	y: number;
	/** Shape size (radius for circle, half-width for rect), in CSS px. */
	size: number;
	shape: ParticleShape;
	/** Upward speed, CSS px per second. */
	speed: number;
	/** Sine drift frequency (rad/s). */
	freq: number;
	/** Sine drift amplitude, CSS px. */
	amp: number;
	phase: number;
	alpha: number;
	/** Index into the current palette. */
	colorIndex: number;
	rotation: number;
	rotationSpeed: number;
}

interface PaletteEntry {
	r: number;
	g: number;
	b: number;
}

const DESKTOP_PARTICLES: [number, number] = [15, 25];
const MOBILE_PARTICLES = 10;
const MOBILE_BREAKPOINT = 640;
const ALPHA_RANGE: [number, number] = [0.15, 0.3];

function randomBetween(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

/** Parses a hex color (#rgb / #rrggbb) into an rgb triplet. */
function parseHexColor(value: string): PaletteEntry | null {
	const hex = value.trim().replace(/^#/, '');
	if (hex.length === 3) {
		const r = parseInt(hex[0] + hex[0], 16);
		const g = parseInt(hex[1] + hex[1], 16);
		const b = parseInt(hex[2] + hex[2], 16);
		if ([r, g, b].some(Number.isNaN)) return null;
		return { r, g, b };
	}
	if (hex.length === 6) {
		const r = parseInt(hex.slice(0, 2), 16);
		const g = parseInt(hex.slice(2, 4), 16);
		const b = parseInt(hex.slice(4, 6), 16);
		if ([r, g, b].some(Number.isNaN)) return null;
		return { r, g, b };
	}
	return null;
}

/** Reads the particle palette from the active theme's CSS variables. */
function readPalette(): PaletteEntry[] {
	const styles = window.getComputedStyle(document.documentElement);
	const palette: PaletteEntry[] = [];

	const primaryRgb = styles.getPropertyValue('--color-primary-rgb').trim();
	const parts = primaryRgb.split(',').map((v) => Number.parseFloat(v));
	if (parts.length === 3 && parts.every((v) => !Number.isNaN(v))) {
		palette.push({ r: parts[0], g: parts[1], b: parts[2] });
	}

	for (const varName of ['--color-accent', '--color-accent-2']) {
		const entry = parseHexColor(styles.getPropertyValue(varName));
		if (entry) palette.push(entry);
	}

	// Fallback: muted peach if variables are unavailable for any reason.
	if (palette.length === 0) {
		palette.push({ r: 255, g: 181, b: 131 });
	}

	return palette;
}

class CandyBackground {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private width = window.innerWidth;
	private height = window.innerHeight;
	private dpr = Math.min(window.devicePixelRatio || 1, 2);

	private particles: Particle[] = [];
	private palette: PaletteEntry[] = readPalette();

	private rafId: number | null = null;
	private lastTimestamp: number | null = null;
	private running = false;

	private reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

	constructor(canvas: HTMLCanvasElement) {
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			throw new Error('Unable to get 2D context.');
		}
		this.canvas = canvas;
		this.ctx = ctx;

		this.resize();
		this.spawnParticles();

		if (this.reducedMotionQuery.matches) {
			this.drawFrame(0);
		} else {
			this.start();
		}

		this.observeThemeChanges();
		this.observeReducedMotion();
		window.addEventListener('resize', this.handleResize, { passive: true });
	}

	/** Rebuilds the particle field (used on init, resize, and pageshow). */
	private spawnParticles(): void {
		const isMobile = this.width < MOBILE_BREAKPOINT;
		const count = isMobile
			? MOBILE_PARTICLES
			: Math.round(randomBetween(DESKTOP_PARTICLES[0], DESKTOP_PARTICLES[1]));

		this.particles = Array.from({ length: count }, () => this.createParticle(true));
	}

	private createParticle(anywhereY: boolean): Particle {
		const size = randomBetween(3, 9);
		return {
			baseX: randomBetween(size, Math.max(this.width - size, size)),
			y: anywhereY ? randomBetween(0, this.height) : this.height + size + randomBetween(0, 40),
			size,
			shape: Math.random() < 0.7 ? 'circle' : 'rounded-rect',
			speed: randomBetween(6, 18),
			freq: randomBetween(0.15, 0.5),
			amp: randomBetween(12, 48),
			phase: randomBetween(0, Math.PI * 2),
			alpha: randomBetween(ALPHA_RANGE[0], ALPHA_RANGE[1]),
			colorIndex: Math.floor(Math.random() * this.palette.length),
			rotation: randomBetween(0, Math.PI * 2),
			rotationSpeed: randomBetween(-0.15, 0.15),
		};
	}

	/** Draws a single frame. `t` is elapsed seconds (drives the sine drift). */
	private drawFrame(t: number): void {
		const { ctx, dpr } = this;
		ctx.save();
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, this.width, this.height);

		for (const p of this.particles) {
			const color = this.palette[p.colorIndex % this.palette.length];
			ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${p.alpha})`;

			const x = p.baseX + Math.sin(t * p.freq + p.phase) * p.amp;

			if (p.shape === 'circle') {
				ctx.beginPath();
				ctx.arc(x, p.y, p.size, 0, Math.PI * 2);
				ctx.fill();
			} else {
				const half = p.size;
				const radius = Math.min(half * 0.6, half);
				ctx.save();
				ctx.translate(x, p.y);
				ctx.rotate(p.rotation);
				ctx.beginPath();
				ctx.roundRect(-half, -half * 0.8, half * 2, half * 1.6, radius);
				ctx.fill();
				ctx.restore();
			}
		}

		ctx.restore();
	}

	private tick = (timestamp: number): void => {
		if (!this.running) return;

		if (this.lastTimestamp === null) {
			this.lastTimestamp = timestamp;
		}
		const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.1);
		this.lastTimestamp = timestamp;

		const t = timestamp / 1000;

		for (const p of this.particles) {
			p.y -= p.speed * dt;
			p.rotation += p.rotationSpeed * dt;
			if (p.y < -p.size * 2) {
				// Recycle: re-enter from below with a fresh drift profile.
				Object.assign(p, this.createParticle(false));
			}
		}

		this.drawFrame(t);
		this.rafId = requestAnimationFrame(this.tick);
	};

	private start(): void {
		if (this.running || this.reducedMotionQuery.matches) return;
		this.running = true;
		this.lastTimestamp = null;
		this.rafId = requestAnimationFrame(this.tick);
	}

	private stop(): void {
		this.running = false;
		this.lastTimestamp = null;
		if (this.rafId !== null) {
			cancelAnimationFrame(this.rafId);
			this.rafId = null;
		}
	}

	private refreshColors = (): void => {
		this.palette = readPalette();
		if (this.reducedMotionQuery.matches) {
			// Static mode: repaint the single frame with the new colors.
			this.drawFrame(performance.now() / 1000);
		}
	};

	private observeThemeChanges(): void {
		// Primary contract: the theme bus event.
		window.addEventListener('theme:change', this.refreshColors);

		// Defensive: also watch the data-theme attribute directly.
		const observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
					this.refreshColors();
				}
			}
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-theme'],
		});
	}

	private observeReducedMotion(): void {
		const onChange = (event: MediaQueryListEvent) => {
			if (event.matches) {
				this.stop();
				this.drawFrame(performance.now() / 1000);
			} else {
				this.start();
			}
		};
		if (typeof this.reducedMotionQuery.addEventListener === 'function') {
			this.reducedMotionQuery.addEventListener('change', onChange);
		}
	}

	private handleResize = (): void => {
		this.resize();
		this.spawnParticles();
		if (this.reducedMotionQuery.matches) {
			this.drawFrame(performance.now() / 1000);
		}
	};

	private resize(): void {
		this.width = window.innerWidth;
		this.height = window.innerHeight;
		this.dpr = Math.min(window.devicePixelRatio || 1, 2);
		this.canvas.width = Math.round(this.width * this.dpr);
		this.canvas.height = Math.round(this.height * this.dpr);
	}

	/** Stops the animation loop (bfcache pagehide). */
	public destroy(): void {
		this.stop();
	}

	/** Restarts after a bfcache restore (pageshow persisted). */
	public resume(): void {
		this.refreshColors();
		if (this.reducedMotionQuery.matches) {
			this.drawFrame(performance.now() / 1000);
		} else {
			this.start();
		}
	}
}

function initializeBackground(): void {
	const canvas = document.getElementById('bg-canvas') as HTMLCanvasElement | null;
	if (!canvas) {
		console.warn('Background canvas not found');
		return;
	}

	let background: CandyBackground | null = null;
	try {
		background = new CandyBackground(canvas);
	} catch (error) {
		console.warn('Failed to initialize background:', error);
		return;
	}

	// bfcache: stop the loop when the page is frozen, restart on restore.
	window.addEventListener('pagehide', () => background?.destroy());
	window.addEventListener('pageshow', (event) => {
		if (event.persisted) {
			background?.resume();
		}
	});
}

initializeBackground();
