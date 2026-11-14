<!-- AI-assisted: written with Claude, reviewed by the team. -->
<!-- Stroke icons (24 px grid, currentColor). Decorative: always aria-hidden. -->
<script lang="ts" module>
	export type IconName =
		| 'search'
		| 'chevron'
		| 'map'
		| 'panorama'
		| 'link'
		| 'check'
		| 'plus'
		| 'close'
		| 'menu'
		| 'cursor'
		| 'pin'
		| 'globe'
		| 'simple'
		| 'teacher'
		| 'planner';
</script>

<script lang="ts">
	let { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg
	class="icon"
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.7"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	{#if name === 'search'}
		<circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" />
	{:else if name === 'chevron'}
		<path d="m6 9 6 6 6-6" />
	{:else if name === 'map'}
		<path d="M3 17.5 9 20l6-3 6 2.5V6.5L15 4 9 7 3 4.5z" /><path d="M9 7v13M15 4v13" />
	{:else if name === 'panorama'}
		<path d="M3 7.5c6-2.4 12-2.4 18 0v9c-6-2.4-12-2.4-18 0z" /><path d="m6.5 14.5 3-3.2 2.4 2.4 1.8-1.7 3.8 3.3" />
	{:else if name === 'link'}
		<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path
			d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"
		/>
	{:else if name === 'check'}
		<path d="m5 12.5 4.5 4.5L19 7.5" />
	{:else if name === 'plus'}
		<path d="M12 5v14M5 12h14" />
	{:else if name === 'close'}
		<path d="M6 6l12 12M18 6 6 18" />
	{:else if name === 'menu'}
		<path d="M4 7h16M4 12h16M4 17h10" />
	{:else if name === 'cursor'}
		<path d="m5 4 6.5 16 2.3-6.7L20.5 11z" />
	{:else if name === 'pin'}
		<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" />
	{:else if name === 'globe'}
		<circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5s1.1-5.9 3.6-8.5z" />
	{:else if name === 'simple'}
		<circle cx="12" cy="12" r="3.2" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
	{:else if name === 'teacher'}
		<path d="M3 8.5 12 4l9 4.5-9 4.5z" /><path d="M7 10.6v4.6c1.4 1.4 3 2.1 5 2.1s3.6-.7 5-2.1v-4.6M21 8.5V14" />
	{:else if name === 'planner'}
		<path d="M4 19.5h16" /><path d="M6 16l4-5 3.5 3L19 7" /><circle cx="19" cy="7" r="1.2" />
	{/if}
</svg>

<style>
	.icon {
		display: block;
		flex: none;
	}
</style>
