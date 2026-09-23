/** @type {import('next').NextConfig} */

/*
 * TWO THINGS ARE SWITCHABLE HERE, both off by default.
 *
 * `distDir` is overridable so a verification build can run WITHOUT destroying a
 * dev server that is already up. `next build` and `next dev` both write `.next`,
 * and a build run mid-session leaves the dev server unable to resolve its own
 * chunks — it starts throwing `Cannot find module './948.js'` and serving 404s
 * for its CSS, which looks exactly like a broken change and is not one.
 * `npm run build:check` points the output elsewhere.
 *
 * GITHUB_PAGES switches on a fully static export for the public demo. It is an
 * env flag rather than the default because it changes real behaviour — image
 * optimisation off, every route pre-rendered, a base path prefixed to every
 * asset — and none of that should apply to somebody running this locally or
 * deploying it to a host that can serve Next properly.
 *
 * The app is entirely client-side with no API routes, so a static export loses
 * nothing. That is also why the demo costs nothing to host.
 */
const isPages = process.env.GITHUB_PAGES === "true";

const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  ...(isPages && {
    output: "export",
    // Project pages live under /<repo>, so every asset and route needs the prefix.
    basePath: "/itquest",
    // Pages serves directories, not extensionless files.
    trailingSlash: true,
    // The optimiser needs a server; there is not one.
    images: { unoptimized: true },
  }),
};

export default nextConfig;
