// AI-assisted: written with Claude, reviewed by the team.
// One transient toast at a time (e.g. "Link copied").

class Toast {
	msg = $state<string | null>(null);
	tone = $state<'ok' | 'error'>('ok');
	/** bumps on every show, so the same message re-animates */
	id = $state(0);
	/** how long the toast stays, so the progress bar matches */
	ms = $state(2400);
	#n = 0;
	#timer: ReturnType<typeof setTimeout> | undefined;

	show(msg: string, tone: 'ok' | 'error' = 'ok', ms = 2400) {
		this.msg = msg;
		this.tone = tone;
		this.ms = ms;
		this.id = ++this.#n; // no read of $state: safe to call from effects
		clearTimeout(this.#timer);
		this.#timer = setTimeout(() => (this.msg = null), ms);
	}

	hide() {
		clearTimeout(this.#timer);
		this.msg = null;
	}
}

export const toast = new Toast();
