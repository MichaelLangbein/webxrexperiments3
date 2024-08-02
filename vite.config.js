import topLevelAwait from "vite-plugin-top-level-await";

/**
* @type {import('vite').UserConfig}
*/
export default {
  base: "/demos/webxr/",
  build: {
    minify: false,
    sourcemap: "inline",
    target: 'esnext'
  },
}
