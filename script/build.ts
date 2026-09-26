import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, writeFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  // Ship the client as one self-contained HTML document. API calls remain
  // relative requests to the server, so secrets never reach the browser.
  const clientHtmlPath = "dist/public/index.html";
  let clientHtml = await readFile(clientHtmlPath, "utf-8");
  const scriptMatch = clientHtml.match(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/i);
  const styleMatch = clientHtml.match(
    /<link\b(?=[^>]*\brel="stylesheet")(?=[^>]*\bhref="(\/[^"]+)")[^>]*>/i,
  );
  if (scriptMatch?.[1]) {
    const scriptPath = `dist/public${scriptMatch[1]}`;
    const script = (await readFile(scriptPath, "utf-8")).replace(/<\/script/gi, "<\\/script");
    clientHtml = clientHtml.replace(scriptMatch[0], "");
    clientHtml = clientHtml.replace("</body>", () => `<script>${script}</script>\n  </body>`);
  }
  if (styleMatch?.[1]) {
    const stylePath = `dist/public${styleMatch[1]}`;
    const style = await readFile(stylePath, "utf-8");
    clientHtml = clientHtml.replace(styleMatch[0], () => `<style>${style}</style>`);
  }
  await writeFile(clientHtmlPath, clientHtml);
  console.log("client bundled into dist/public/index.html");

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
