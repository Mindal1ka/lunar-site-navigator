<svelte:head>
	<title>Lunar Landing Site Navigator</title>
	<meta name="description" content="Compare lunar south pole landing sites by sunlight and Earth visibility, computed from NASA LOLA topography and JPL ephemerides." />
</svelte:head>

<main>
	<h1>Lunar Landing Site Navigator</h1>
	<p>NASA Space Apps Challenge 2026 · work in progress</p>
</main>

<style>
	:global(html, body) {
		margin: 0;
		background: #05070a;
		color: #e6e9ef;
		font-family: system-ui, sans-serif;
	}
	main {
		min-height: 100vh;
		display: grid;
		place-content: center;
		text-align: center;
		padding: 16px;
	}
	h1 {
		font-weight: 600;
		letter-spacing: 0.02em;
	}
	p {
		opacity: 0.6;
	}
</style>
