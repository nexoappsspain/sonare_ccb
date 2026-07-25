/**
 * Ambient module declarations for side-effect asset imports handled by the
 * Next.js/webpack pipeline (e.g. `import "./globals.css"`). Next only ships
 * declarations for `*.module.css`; plain CSS needs this so newer TypeScript
 * versions (TS2882) accept the import as well.
 */
declare module "*.css";
