const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname);
for (const name of [".env.local", ".env"]) {
  try {
    const envPath = path.join(root, name);
    if (fs.existsSync(envPath)) {
      const env = fs.readFileSync(envPath, "utf8").replace(/\r\n/g, "\n");
      env.split("\n").forEach((line) => {
        const m = line.match(/^([^=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
      });
      break;
    }
  } catch (_) {}
}

const htmlPath = path.join(root, "index.html");
let html = fs.readFileSync(htmlPath, "utf8");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!url || !key) {
  console.error("Vercel'de NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY tanımlı olmalı.");
  process.exit(1);
}

html = html.replace("%%SUPABASE_URL%%", url);
html = html.replace("%%SUPABASE_ANON_KEY%%", key);

const distDir = path.join(root, "dist");
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(path.join(distDir, "index.html"), html);
fs.copyFileSync(path.join(root, "script.js"), path.join(distDir, "script.js"));
if (fs.existsSync(path.join(root, "robots.txt"))) {
  fs.copyFileSync(path.join(root, "robots.txt"), path.join(distDir, "robots.txt"));
}
if (fs.existsSync(path.join(root, "sitemap.xml"))) {
  fs.copyFileSync(path.join(root, "sitemap.xml"), path.join(distDir, "sitemap.xml"));
}
if (fs.existsSync(path.join(root, "favicon.png"))) {
  fs.copyFileSync(path.join(root, "favicon.png"), path.join(distDir, "favicon.png"));
}
console.log("Supabase config injected → dist/");
