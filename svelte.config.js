import adapter from '@sveltejs/adapter-static';
import sveltePreprocess from 'svelte-preprocess';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://github.com/sveltejs/svelte-preprocess
	// for more information about preprocessors
	preprocess: [
		sveltePreprocess({
			scss: {
				prependData: `@import 'src/lib/theme/global.scss';`
			}
		}),
	],

	kit: {
		adapter: adapter({
			fallback: 'index.html',
		}),
		prerender: { entries: [] },
	},

	vitePlugin: {
		experimental: {
			inspector: true,
		},
	},

	onwarn: (warning, handler) => {
		const { code } = warning;
		if (code === 'css-semicolonexpected' || code === 'css-ruleorselectorexpected' || code === 'css-unused-selector')
			return;
		handler(warning);
	}

};

export default config;
