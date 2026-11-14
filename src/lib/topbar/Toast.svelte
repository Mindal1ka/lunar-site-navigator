<!-- AI-assisted: written with Claude, reviewed by the team. -->
<script lang="ts">
	import Icon from './Icon.svelte';
	import { drop } from './motion';
	import { toast } from './toast.svelte.ts';
</script>

<div class="live" role="status" aria-live="polite" aria-atomic="true">
	{#key toast.id}
		{#if toast.msg}
			<div class="toast glass" class:error={toast.tone === 'error'} transition:drop>
				<span class="badge"><Icon name={toast.tone === 'ok' ? 'check' : 'close'} size={14} /></span>
				<span>{toast.msg}</span>
				<span class="bar" aria-hidden="true" style:animation-duration="{toast.ms}ms"></span>
			</div>
		{/if}
	{/key}
</div>

<style>
	.live {
		position: fixed;
		left: 0;
		right: 0;
		top: calc(var(--topbar-h) + var(--gutter) * 2);
		height: 0;
		z-index: 60;
		pointer-events: none;
	}
	.toast {
		position: absolute;
		left: 50%;
		top: 0;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 16px 10px 10px;
		border-radius: var(--radius-pill);
		background: var(--glass-strong);
		font-size: 13px;
		font-weight: 520;
		white-space: nowrap;
		overflow: hidden;
	}
	.badge {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		color: #06210f;
		background: var(--both);
		box-shadow: 0 0 16px rgba(155, 231, 168, 0.55);
		animation: badge 520ms var(--ease-spring) both;
	}
	.error .badge {
		background: var(--danger);
		color: #2a0707;
		box-shadow: 0 0 16px rgba(255, 107, 107, 0.5);
	}
	.bar {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 2px;
		background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
		transform-origin: left;
		animation: shrink 2400ms linear forwards;
	}
	@keyframes badge {
		from {
			transform: scale(0.2) rotate(-40deg);
		}
	}
	@keyframes shrink {
		to {
			transform: scaleX(0);
		}
	}
</style>
