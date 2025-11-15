import * as esbuild from "esbuild";

await esbuild.build({
    entryPoints: [{ in: "src/index.ts", out: "index"}],
    outdir: "dist",
    
    format: "esm",
    platform: "node",
    bundle: true,
    minify: true
});