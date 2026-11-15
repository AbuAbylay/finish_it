// Serves the built app from this computer and opens a public ngrok tunnel to it (docs/DEPLOY.md).
//
//   npm run live          start (or restart) the server and the tunnel, print the public address
//   npm run live:status   what is running and where
//   npm run live:stop     stop both
//   npm run set-key       replace ANTHROPIC_API_KEY in .env.local and restart the server
//
// Both processes are detached, so they keep running after this command and its terminal are gone.
// Logs and process ids are kept in .live/ (git-ignored). The ngrok token is read from ngrok's own
// configuration (`ngrok config add-authtoken …`), never from this repository.
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = path.join(ROOT, ".live");
const ENV_FILE = path.join(ROOT, ".env.local");
const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 3000;
const LOCAL = `http://localhost:${PORT}`;
const NGROK_API = "http://127.0.0.1:4040/api/tunnels";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const say = (line) => console.log(line);

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function getJson(url, timeoutMs = 3000) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return await res.json();
  } catch {
    return null;
  }
}

async function until(read, tries, pauseMs = 500) {
  for (let i = 0; i < tries; i++) {
    const value = await read();
    if (value) return value;
    await sleep(pauseMs);
  }
  return null;
}

// --- .env.local ---------------------------------------------------------------

function readEnv() {
  return existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
}

/** Sets one NAME=value line, keeping every other line as it is. The file is readable by its owner only. */
function writeEnv(name, value) {
  const lines = readEnv().split("\n").filter((line) => line.trim() !== "" && !line.startsWith(`${name}=`));
  lines.push(`${name}=${value}`);
  writeFileSync(ENV_FILE, `${lines.join("\n")}\n`, { mode: 0o600 });
  chmodSync(ENV_FILE, 0o600);
}

function envValue(name) {
  const line = readEnv().split("\n").find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : "";
}

// --- processes ----------------------------------------------------------------

function detached(command, args, logName) {
  mkdirSync(LIVE, { recursive: true });
  const log = openSync(path.join(LIVE, logName), "a");
  const child = spawn(command, args, {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", log, log],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  child.unref();
  return child.pid;
}

function listeners() {
  const out = spawnSync("lsof", ["-ti", `tcp:${PORT}`, "-sTCP:LISTEN"], { encoding: "utf8" }).stdout ?? "";
  return out.split("\n").map((s) => Number(s.trim())).filter((n) => n > 0);
}

async function stopServer() {
  for (const pid of listeners()) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  await until(async () => listeners().length === 0, 20, 250);
}

async function startServer() {
  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    say("No build yet: running npm run build …");
    const built = spawnSync("npm", ["run", "build"], { cwd: ROOT, stdio: "inherit" });
    if (built.status !== 0) fail("The build failed; nothing was started.");
  }
  await stopServer();
  detached(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(PORT)], "server.log");
  const health = await until(() => getJson(`${LOCAL}/api/health`), 60);
  if (!health) fail(`The server did not answer on ${LOCAL}. See .live/server.log.`);
  return health;
}

async function tunnelUrl() {
  const data = await getJson(NGROK_API, 1500);
  const tunnel = data?.tunnels?.find((t) => String(t.config?.addr ?? "").endsWith(`:${PORT}`)) ?? data?.tunnels?.[0];
  return tunnel?.public_url ?? null;
}

async function startTunnel() {
  const running = await tunnelUrl();
  if (running) return running;
  if (spawnSync("which", ["ngrok"]).status !== 0) {
    say("ngrok is not installed (brew install --cask ngrok), so there is no public address.");
    return null;
  }
  // caffeinate keeps the Mac from idle-sleeping for as long as the tunnel is up.
  const caffeinate = spawnSync("which", ["caffeinate"]).status === 0;
  const args = ["http", String(PORT), "--log", path.join(LIVE, "ngrok.log"), "--log-format", "logfmt"];
  const pid = caffeinate ? detached("caffeinate", ["-i", "ngrok", ...args], "ngrok.out") : detached("ngrok", args, "ngrok.out");
  writeFileSync(path.join(LIVE, "ngrok.pid"), String(pid));
  const url = await until(tunnelUrl, 30);
  if (!url) say("The tunnel did not come up. See .live/ngrok.log (is the authtoken set? `ngrok config add-authtoken …`).");
  return url;
}

function stopTunnel() {
  spawnSync("pkill", ["-f", `ngrok http ${PORT}`]);
}

function report(health, url) {
  say("");
  say(`Local:   ${LOCAL}`);
  say(`Public:  ${url ?? "(no tunnel)"}`);
  say(`Lessons: ${health?.ai === "real" ? "written by the models (key set)" : "DEV STUB, no key in .env.local (npm run set-key)"}`);
  say(`Sample:  ${health?.sample ?? "?"}   Database: ${health?.database?.ok ? "ok" : "NOT OK"}`);
}

// --- commands -----------------------------------------------------------------

async function start() {
  let health = await startServer();
  const url = await startTunnel();
  // The link in the reminder preview should be the public one.
  if (url && envValue("APP_URL") !== url) {
    writeEnv("APP_URL", url);
    health = await startServer();
  }
  report(health, url);
}

async function status() {
  report(await getJson(`${LOCAL}/api/health`), await tunnelUrl());
}

async function stop() {
  await stopServer();
  stopTunnel();
  say("Stopped the server and the tunnel.");
}

/** Reads one line without showing it. A piped value (`pbpaste | npm run set-key`) works too. */
async function readSecret(question) {
  if (!process.stdin.isTTY) {
    let all = "";
    for await (const chunk of process.stdin) all += chunk;
    return all.trim();
  }
  process.stdout.write(question);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise((resolve) => {
    let typed = "";
    process.stdin.on("data", (chunk) => {
      for (const ch of chunk) {
        if (ch === "\u0003") {
          process.stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        } else if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdout.write("\n");
          return resolve(typed.trim());
        } else if (ch === "\u007f") {
          typed = typed.slice(0, -1);
        } else {
          typed += ch;
        }
      }
    });
  });
}

/** Asks the API whether it accepts the key. Costs nothing: it lists one model. */
async function keyVerdict(key) {
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    try {
      await new Anthropic({ apiKey: key, maxRetries: 0, timeout: 15_000 }).models.list({ limit: 1 });
      return "accepted";
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return "rejected";
      return "unchecked";
    }
  } catch {
    return "unchecked";
  }
}

async function setKey() {
  const key = await readSecret("Paste the Anthropic API key (it is not shown), then press Enter: ");
  if (!/^sk-ant-\S{20,}$/.test(key)) fail("That does not look like an Anthropic API key (it starts with sk-ant-). Nothing was changed.");
  const verdict = await keyVerdict(key);
  if (verdict === "rejected") fail("The API rejected this key. Nothing was changed.");
  writeEnv("ANTHROPIC_API_KEY", key);
  say(`Saved the key ending in …${key.slice(-4)} to .env.local${verdict === "accepted" ? " (the API accepts it)" : " (could not check it with the API just now)"}.`);
  if (listeners().length === 0) return say("The server is not running. Start it with: npm run live");
  say("Restarting the server so it picks the key up …");
  report(await startServer(), await tunnelUrl());
}

const commands = { start, status, stop, "set-key": setKey };
const command = commands[process.argv[2] ?? "start"];
if (!command) fail(`Unknown command "${process.argv[2]}". Use: start, status, stop or set-key.`);
await command();
