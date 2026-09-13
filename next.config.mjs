/** @type {import('next').NextConfig} */

/*
 * `distDir` is overridable so a verification build can be run WITHOUT
 * destroying a dev server that is already up.
 *
 * `next build` and `next dev` both write `.next`, and a build run mid-session
 * leaves the dev server unable to resolve its own chunks — it starts throwing
 * `Cannot find module './948.js'` and serving 404s for its CSS, which looks
 * exactly like a broken change and is not one. `npm run build:check` points
 * the output elsewhere; `npm run build` stays the real thing for deploys.
 */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
