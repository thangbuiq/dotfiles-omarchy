#!/usr/bin/env node

// src/agents/plugins/claude/plugin/statusline.ts
import fs from "fs/promises";
import os3 from "os";
import path from "path";
import { fileURLToPath } from "url";

// src/utils/exec.ts
import { spawn } from "child_process";
import os from "os";
async function exec(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const isWindows = os.platform() === "win32";
    let useShell = false;
    if (options.shell !== void 0) {
      useShell = options.shell;
    }
    const stdio = options.interactive ? "inherit" : "pipe";
    let finalCommand = command;
    let finalArgs = args;
    if (useShell && args.length > 0) {
      const needsQuoting = (arg) => arg.includes(" ") || arg.includes('"') || isWindows && /[&|<>^%()[\]{}]/.test(arg);
      const quotedArgs = args.map(
        (arg) => needsQuoting(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg
      );
      finalCommand = `${command} ${quotedArgs.join(" ")}`;
      finalArgs = [];
    }
    const child = spawn(finalCommand, finalArgs, {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env },
      shell: useShell,
      windowsHide: isWindows,
      // Hide console window on Windows
      stdio
    });
    let stdout = "";
    let stderr = "";
    let timeoutId = null;
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    if (!options.interactive) {
      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });
    }
    child.on("error", (error) => {
      cleanup();
      reject(new Error(`Failed to execute ${command}: ${error.message}`));
    });
    child.on("close", (code, signal) => {
      cleanup();
      if (code === null) {
        reject(new Error(`Command terminated by signal ${signal ?? "unknown"}`));
        return;
      }
      const result = {
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        signal
      };
      if (options.interactive && code !== 0) {
        reject(new Error(`Command exited with code ${code}`));
      } else {
        resolve(result);
      }
    });
    if (options.timeout) {
      timeoutId = setTimeout(() => {
        child.kill();
        reject(new Error(`Command timed out after ${options.timeout}ms`));
      }, options.timeout);
    }
  });
}

// src/utils/routing-headers.mjs
var CODEMIE_ROUTING_HEADERS = [
  "x-codemie-routed-model",
  "x-codemie-requested-model",
  "x-codemie-routing-tier",
  "x-codemie-routing-decision-source",
  "x-codemie-routing-source",
  "x-codemie-routing-router-type",
  "x-codemie-routing-family",
  "x-codemie-routing-classifier-model",
  "x-codemie-routing-classifier-cost-usd",
  "x-codemie-routing-counterfactual-model"
];
function hasAnyHeader(message, headerNames) {
  return headerNames.some((name) => message?.[name] != null);
}
function parseRoutingHeaders(message) {
  if (!hasAnyHeader(message, CODEMIE_ROUTING_HEADERS)) return null;
  const routingTier = normalizeRoutingTier(message["x-codemie-routing-tier"]);
  const classifierCostUSD = parseOptFloat(message["x-codemie-routing-classifier-cost-usd"]);
  return {
    ...message["x-codemie-requested-model"] != null && { requestedModel: message["x-codemie-requested-model"] },
    ...routingTier != null && { routingTier },
    ...message["x-codemie-routing-tier"] != null && { routingTierRaw: message["x-codemie-routing-tier"] },
    ...message["x-codemie-routed-model"] != null && { routedModel: message["x-codemie-routed-model"] },
    ...message["x-codemie-routing-classifier-model"] != null && { classifierModel: message["x-codemie-routing-classifier-model"] },
    ...message["x-codemie-routing-router-type"] != null && { routerType: message["x-codemie-routing-router-type"] },
    ...message["x-codemie-routing-source"] != null && { routingSource: message["x-codemie-routing-source"] },
    ...message["x-codemie-routing-decision-source"] != null && { decisionSource: message["x-codemie-routing-decision-source"] },
    // Opaque passthrough of whichever backend mechanism made the decision — informational only.
    ...message["x-codemie-routing-family"] != null && { routingFamily: message["x-codemie-routing-family"] },
    // Backend-computed counterfactual: the model this turn's usage should be repriced at to
    // estimate "what this would have cost unrouted" — see cost-enricher.ts's `buildModelTimeline`.
    ...message["x-codemie-routing-counterfactual-model"] != null && { counterfactualModel: message["x-codemie-routing-counterfactual-model"] },
    // Known iff the proxy reported a classifier cost for this turn — absence means "no
    // classifier ran / not measured", not "zero".
    routingCostKnown: classifierCostUSD != null,
    ...classifierCostUSD != null && { classifierCostUSD }
  };
}
function parseOptFloat(s) {
  if (s == null) return void 0;
  const v = parseFloat(s);
  return Number.isNaN(v) ? void 0 : v;
}
function normalizeRoutingTier(raw) {
  if (raw == null) return void 0;
  const key = String(raw).trim().toLowerCase();
  const map = {
    "simple": "simple",
    "efficient": "middle",
    "medium": "middle",
    "capable": "complex",
    "complex": "complex",
    "reasoning": "reasoning"
  };
  return map[key] ?? key;
}

// src/utils/bedrock-pricing.mjs
function parseBackendModelName(message) {
  return message?.["x-litellm-model-name"] ?? null;
}
var BEDROCK_REGION_PATTERN = /(?:^|\/)([a-z0-9-]+)\.anthropic\./i;
function bedrockEndpointRegion(rawModelId) {
  if (!rawModelId) return null;
  const match = BEDROCK_REGION_PATTERN.exec(String(rawModelId).toLowerCase());
  return match ? match[1] : null;
}
function isBedrockRegionalPremium(rawModelId) {
  const region = bedrockEndpointRegion(rawModelId);
  return region != null && region !== "global";
}
function applyBedrockRegionalPremium(price, rawModelId) {
  if (price == null || price.bedrockRegionalMultiplier == null || !isBedrockRegionalPremium(rawModelId)) {
    return price;
  }
  const multiplier = price.bedrockRegionalMultiplier;
  return {
    ...price,
    ...price.input != null && { input: price.input * multiplier },
    ...price.output != null && { output: price.output * multiplier },
    ...price.cacheRead != null && { cacheRead: price.cacheRead * multiplier },
    ...price.cacheCreation != null && { cacheCreation: price.cacheCreation * multiplier },
    ...price.cacheWrite != null && { cacheWrite: price.cacheWrite * multiplier },
    ...price.cacheWrite1h != null && { cacheWrite1h: price.cacheWrite1h * multiplier }
  };
}

// src/utils/credential-crypto.ts
import * as crypto from "crypto";
import * as os2 from "os";
import { URL as URL2 } from "url";
function deriveMachineEncryptionKey() {
  const machineId = os2.hostname() + os2.platform() + os2.arch();
  const hex = crypto.createHash("sha256").update(machineId).digest("hex");
  return crypto.createHash("sha256").update(hex).digest();
}
function decryptWithKey(text, key) {
  const parts = text.split(":");
  if (parts.length === 3) {
    const iv2 = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const decipher2 = crypto.createDecipheriv("aes-256-gcm", key, iv2);
    decipher2.setAuthTag(authTag);
    return decipher2.update(parts[2], "hex", "utf8") + decipher2.final("utf8");
  }
  const iv = Buffer.from(parts[0], "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  return decipher.update(parts[1], "hex", "utf8") + decipher.final("utf8");
}
function normalizeUrlForKey(baseUrl) {
  try {
    const parsed = new URL2(baseUrl);
    if (parsed.host && (parsed.protocol === "http:" || parsed.protocol === "https:")) {
      return `${parsed.protocol}//${parsed.host}`.toLowerCase();
    }
  } catch {
  }
  return baseUrl.replace(/\/$/, "").toLowerCase();
}
function hashStorageKey(normalized) {
  return `sso-${crypto.createHash("sha256").update(normalized).digest("hex")}`;
}
function deriveUrlStorageKey(baseUrl) {
  return hashStorageKey(normalizeUrlForKey(baseUrl));
}
function deriveLegacyUrlStorageKey(baseUrl) {
  return hashStorageKey(baseUrl.replace(/\/$/, "").toLowerCase());
}

// src/utils/model-normalizer.ts
var VENDOR_PREFIX_PATTERN = /^(?:openai[./]|azure\/|vertex_ai\/|anthropic\/|moonshotai\.|qwen\.)/i;
function normalizeModelName(modelName) {
  const bedrockMatch = modelName.match(/^(?:bedrock\/)?(?:converse\/)?[a-z0-9-]+\.anthropic\.(claude-[a-z0-9-]+?)(?:-v\d+:\d+)?$/);
  if (bedrockMatch) {
    return bedrockMatch[1];
  }
  if (modelName.startsWith("kimi-code/")) {
    return modelName.slice("kimi-code/".length);
  }
  const vendorPrefixMatch = modelName.match(VENDOR_PREFIX_PATTERN);
  if (vendorPrefixMatch) {
    return modelName.slice(vendorPrefixMatch[0].length);
  }
  return modelName;
}

// src/utils/price-resolution.ts
var SNAPSHOT_SUFFIX_PATTERN = /-(?:\d{8}|\d{4}-\d{2}-\d{2}|latest|preview)$/;
var CLAUDE_VERSION_FIRST_PATTERN = /^claude-(\d+(?:-\d+)*)-(opus|sonnet|haiku)(-.+)?$/;
function priceTableKey(rawKey) {
  return rawKey.toLowerCase().replace(/\./g, "-");
}
function canonicalizeModelId(model) {
  return priceTableKey(normalizeModelName(model)).replace(/@/g, "-").replace(/-vertex$/, "");
}
function reorderClaudeVersionFamily(id) {
  const match = id.match(CLAUDE_VERSION_FIRST_PATTERN);
  if (!match) {
    return null;
  }
  const [, version, family, rest = ""] = match;
  return `claude-${family}-${version}${rest}`;
}
function withoutSnapshot(key) {
  const stripped = key.replace(SNAPSHOT_SUFFIX_PATTERN, "");
  return stripped === key ? null : stripped;
}
function priceKeyCandidates(model) {
  const canonical = canonicalizeModelId(model);
  const candidates = [{ key: canonical, match: "exact" }];
  const snapshot = withoutSnapshot(canonical);
  if (snapshot) {
    candidates.push({ key: snapshot, match: "snapshot" });
  }
  const reordered = reorderClaudeVersionFamily(canonical);
  if (reordered) {
    candidates.push({ key: reordered, match: "reordered" });
    const reorderedSnapshot = withoutSnapshot(reordered);
    if (reorderedSnapshot) {
      candidates.push({ key: reorderedSnapshot, match: "reordered" });
    }
  }
  return candidates;
}
function resolvePriceKey(model, lookup) {
  for (const { key, match } of priceKeyCandidates(model)) {
    const value = key ? lookup(key) : void 0;
    if (value !== void 0) {
      return { key, match, value };
    }
  }
  return null;
}

// src/agents/plugins/claude/plugin/statusline.ts
var HOME = process.env.CODEMIE_HOME || path.join(os3.homedir(), ".codemie");
var CACHE_FILE = path.join(HOME, "budget-cache.json");
var CONFIG_FILE = path.join(HOME, "codemie-cli.config.json");
var CREDS_DIR = path.join(HOME, "credentials");
var CACHE_TTL_MS = 6e4;
var BUDGET_FETCH_TIMEOUT_MS = 2e3;
var CACHE_SCHEMA = 2;
var ENCRYPTION_KEY = deriveMachineEncryptionKey();
async function readCredsFile(filePath) {
  try {
    return JSON.parse(decryptWithKey(await fs.readFile(filePath, "utf8"), ENCRYPTION_KEY));
  } catch {
    return null;
  }
}
async function readStoredCredsFile(jwtPrefix, codeMieUrl) {
  const current = await readCredsFile(path.join(CREDS_DIR, `${jwtPrefix}${deriveUrlStorageKey(codeMieUrl)}.enc`));
  if (current) return current;
  return readCredsFile(path.join(CREDS_DIR, `${jwtPrefix}${deriveLegacyUrlStorageKey(codeMieUrl)}.enc`));
}
async function getAuthHeaders(codeMieUrl) {
  const sso = await readStoredCredsFile("", codeMieUrl);
  if (sso?.cookies) {
    return { cookie: Object.entries(sso.cookies).map(([k, v]) => `${k}=${v}`).join(";") };
  }
  const jwt = await readStoredCredsFile("jwt-", codeMieUrl);
  if (jwt?.token) {
    return { authorization: `Bearer ${jwt.token}` };
  }
  return null;
}
function matchBudgetRow(rows, userEmail) {
  if (!Array.isArray(rows) || !userEmail) return null;
  const target = `${userEmail.trim().toLowerCase()} (cli)`;
  return rows.find((r) => r.project_name?.trim().toLowerCase() === target) ?? null;
}
function formatBudgetSegment(row) {
  if (!row) return null;
  const pct = Math.round(row.total ?? 0);
  const reset = row.budget_reset_at ? new Date(row.budget_reset_at).toLocaleDateString() : "?";
  return {
    text: `$${row.current_spending.toFixed(2)} (${pct}%) resets ${reset}`,
    pct
  };
}
function contextTokens(cw) {
  const u = cw?.current_usage;
  if (u) {
    return (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  }
  if (typeof cw?.used_percentage === "number" && typeof cw?.context_window_size === "number") {
    return Math.round(cw.used_percentage * cw.context_window_size / 100);
  }
  return null;
}
function extractBasicInfo(ctx) {
  const cwd = ctx?.workspace?.current_dir ?? ctx?.cwd ?? "";
  return {
    projectName: cwd ? path.basename(cwd) : "",
    cwd,
    transcriptPath: ctx?.transcript_path ?? "",
    modelId: ctx?.model?.id ?? "",
    model: ctx?.model?.display_name ?? "",
    effort: ctx?.effort?.level ?? "",
    ctxPct: ctx?.context_window?.used_percentage ?? null,
    fiveHourPct: ctx?.rate_limits?.five_hour?.used_percentage ?? null,
    sevenDayPct: ctx?.rate_limits?.seven_day?.used_percentage ?? null,
    fiveHourResetsAt: ctx?.rate_limits?.five_hour?.resets_at ?? null,
    sevenDayResetsAt: ctx?.rate_limits?.seven_day?.resets_at ?? null,
    ctxTokens: contextTokens(ctx?.context_window),
    ctxSize: ctx?.context_window?.context_window_size ?? null,
    cost: ctx?.cost?.total_cost_usd ?? null,
    durationMs: ctx?.cost?.total_duration_ms ?? null
  };
}
var ROUTED_MODEL_TAIL_BYTES = 65536;
var ROUTED_MODEL_TAIL_MAX_BYTES = 8 * 1024 * 1024;
function normalizeModelId(modelId) {
  if (!modelId) return "";
  return modelId.toLowerCase().replace(/^(?:bedrock\/)?(?:converse\/)?/, "").replace(/^[a-z0-9-]+\.anthropic\./, "").replace(/-v\d+:\d+$/, "");
}
function parseLastAssistantTurn(tailText) {
  if (!tailText) return null;
  const lines = tailText.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    const message = parsed?.message;
    if (parsed?.type === "assistant" && message?.model && message.model !== "<synthetic>") {
      return { responseModel: message.model, headerRoutedModel: parseRoutingHeaders(message)?.routedModel ?? null };
    }
  }
  return null;
}
async function defaultReadTail(filePath, maxBytes) {
  const handle = await fs.open(filePath, "r");
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - maxBytes);
    const length = size - start;
    if (length <= 0) return "";
    const { buffer, bytesRead } = await handle.read({ buffer: Buffer.alloc(length), position: start });
    return buffer.toString("utf8", 0, bytesRead);
  } finally {
    await handle.close();
  }
}
function parseRouterModelIds(env) {
  if (!env.CODEMIE_ROUTER_MODEL_IDS) return /* @__PURE__ */ new Set();
  try {
    const parsed = JSON.parse(env.CODEMIE_ROUTER_MODEL_IDS);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return /* @__PURE__ */ new Set();
  }
}
function isRoutingConfigured(env, modelId) {
  const routerIds = parseRouterModelIds(env);
  return routerIds.has(modelId) || routerIds.has(stripOneMillionSuffix(modelId));
}
function stripOneMillionSuffix(modelId) {
  return (modelId ?? "").replace(/\[1m\]$/i, "");
}
function lookupNominalLabel(labels, modelId) {
  if (!modelId) return void 0;
  return labels[modelId] ?? labels[stripOneMillionSuffix(modelId)];
}
function parseModelLabels(env) {
  if (!env.CODEMIE_MODEL_LABELS) return {};
  try {
    const parsed = JSON.parse(env.CODEMIE_MODEL_LABELS);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
async function resolveActualModel(transcriptPath, { readTail = defaultReadTail, labels = {} } = {}) {
  if (!transcriptPath) return null;
  let turn = null;
  let bytes = ROUTED_MODEL_TAIL_BYTES;
  for (; ; ) {
    let tail;
    try {
      tail = await readTail(transcriptPath, bytes);
    } catch {
      return null;
    }
    turn = parseLastAssistantTurn(tail);
    if (turn || Buffer.byteLength(tail, "utf8") < bytes || bytes >= ROUTED_MODEL_TAIL_MAX_BYTES) break;
    bytes = Math.min(bytes * 8, ROUTED_MODEL_TAIL_MAX_BYTES);
  }
  if (!turn) return null;
  const candidate = turn.headerRoutedModel ?? turn.responseModel;
  if (!candidate) return null;
  const normalized = normalizeModelId(candidate);
  return labels[candidate] ?? labels[normalized] ?? normalized;
}
var COST_CACHE_FILE = path.join(HOME, "statusline-cost-cache.json");
var COST_CACHE_SCHEMA = 2;
async function sourceSignature(paths, stat) {
  const parts = [];
  for (const p of paths) {
    try {
      const { size, mtimeMs } = await stat(p);
      parts.push(`${p}:${size}:${mtimeMs}`);
    } catch {
      parts.push(`${p}:absent`);
    }
  }
  return parts.join("|");
}
async function defaultReadPrices() {
  if (false) throw new Error("no embedded rate card");
  return JSON.parse('{"claude-sonnet-5":{"input":2,"output":10,"cacheRead":0.2,"cacheCreation":2.5,"cacheWrite1h":4,"bedrockRegionalMultiplier":1.1},"claude-sonnet-5-5":{"input":2,"output":10,"cacheRead":0.2,"cacheCreation":2.5,"cacheWrite1h":4,"bedrockRegionalMultiplier":1.1},"claude-fable-5-1":{"input":10,"output":50,"cacheRead":0.25,"cacheCreation":12.5,"cacheWrite1h":20,"bedrockRegionalMultiplier":1.1},"claude-mythos-5-1":{"input":10,"output":50,"cacheRead":0.25,"cacheCreation":12.5,"cacheWrite1h":20,"bedrockRegionalMultiplier":1.1},"claude-fable-5":{"input":10,"output":50,"cacheRead":1,"cacheCreation":12.5,"cacheWrite1h":20,"bedrockRegionalMultiplier":1.1},"claude-mythos-5":{"input":10,"output":50,"cacheRead":1,"cacheCreation":12.5,"cacheWrite1h":20,"bedrockRegionalMultiplier":1.1},"claude-opus-5-5":{"input":4,"output":20,"cacheRead":0.2,"cacheCreation":5,"cacheWrite1h":8,"bedrockRegionalMultiplier":1.1},"claude-opus-5":{"input":5,"output":25,"cacheRead":0.5,"cacheCreation":6.25,"cacheWrite1h":10,"bedrockRegionalMultiplier":1.1},"claude-opus-4-6":{"input":5,"output":25,"cacheRead":0.5,"cacheCreation":6.25,"cacheWrite1h":10,"bedrockRegionalMultiplier":1.1},"claude-sonnet-4-6":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":3.75,"cacheWrite1h":6,"bedrockRegionalMultiplier":1.1},"claude-opus-4-5":{"input":5,"output":25,"cacheRead":0.5,"cacheCreation":6.25,"cacheWrite1h":10,"bedrockRegionalMultiplier":1.1},"claude-sonnet-4-5":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":3.75,"cacheWrite1h":6,"bedrockRegionalMultiplier":1.1},"claude-haiku-4-5":{"input":1,"output":5,"cacheRead":0.1,"cacheCreation":1.25,"cacheWrite1h":2,"bedrockRegionalMultiplier":1.1},"claude-opus-4-1":{"input":15,"output":75,"cacheRead":1.5,"cacheCreation":18.75,"cacheWrite1h":30},"claude-opus-4-0":{"input":15,"output":75,"cacheRead":1.5,"cacheCreation":18.75,"cacheWrite1h":30},"claude-sonnet-4-0":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":3.75,"cacheWrite1h":6},"claude-sonnet-4":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":3.75,"cacheWrite1h":6},"claude-sonnet-3-7":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":3.75,"cacheWrite1h":6},"claude-3-5-sonnet":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":3.75,"cacheWrite1h":6},"claude-3-5-haiku":{"input":0.8,"output":4,"cacheRead":0.08,"cacheCreation":1,"cacheWrite1h":1.6},"claude-3-opus":{"input":15,"output":75,"cacheRead":1.5,"cacheCreation":18.75,"cacheWrite1h":30},"claude-3-sonnet":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":3.75,"cacheWrite1h":6},"claude-3-haiku":{"input":0.25,"output":1.25,"cacheRead":0.03,"cacheCreation":0.3,"cacheWrite1h":0.5},"gpt-5-4":{"input":2.5,"output":15,"cacheRead":0.25,"cacheCreation":2.5},"gpt-5-4-pro":{"input":30,"output":180,"cacheRead":30,"cacheCreation":30},"gpt-5-5":{"input":5,"output":30,"cacheRead":0.5,"cacheCreation":5},"gpt-5-6-luna":{"input":0.2,"output":1.2,"cacheRead":0.02,"cacheCreation":0.25},"gpt-5-6-sol":{"input":4,"output":20,"cacheRead":0.4,"cacheCreation":5},"gpt-5-6-terra":{"input":2,"output":12,"cacheRead":0.2,"cacheCreation":2.5},"gpt-6-luna":{"input":0.1,"output":0.5,"cacheRead":0.01,"cacheCreation":0.125},"gpt-6-astra":{"input":10,"output":50,"cacheRead":1,"cacheCreation":12.5},"gpt-5-5-pro":{"input":30,"output":180,"cacheRead":30,"cacheCreation":30},"gpt-5-4-mini":{"input":0.75,"output":4.5,"cacheRead":0.075,"cacheCreation":0.75},"gpt-5-4-nano":{"input":0.2,"output":1.25,"cacheRead":0.02,"cacheCreation":0.2},"gpt-6-sol":{"input":2,"output":10,"cacheRead":0.2,"cacheCreation":2.5},"gpt-6-1-sol":{"input":2,"output":10,"cacheRead":0.1,"cacheCreation":2.5},"gpt-5-2":{"input":1.75,"output":14,"cacheRead":0.175,"cacheCreation":1.75},"gpt-5-2-pro":{"input":21,"output":168,"cacheRead":21,"cacheCreation":21},"gpt-5-1":{"input":1.25,"output":10,"cacheRead":0.125,"cacheCreation":1.25},"gpt-5":{"input":1.25,"output":10,"cacheRead":0.125,"cacheCreation":1.25},"gpt-5-mini":{"input":0.25,"output":2,"cacheRead":0.025,"cacheCreation":0.25},"gpt-5-nano":{"input":0.05,"output":0.4,"cacheRead":0.005,"cacheCreation":0.05},"gpt-5-pro":{"input":15,"output":120,"cacheRead":15,"cacheCreation":15},"gpt-5-3-codex":{"input":1.75,"output":14,"cacheRead":0.175,"cacheCreation":1.75},"gpt-5-2-codex":{"input":1.75,"output":14,"cacheRead":0.175,"cacheCreation":1.75},"gpt-5-1-codex-max":{"input":1.25,"output":10,"cacheRead":0.125,"cacheCreation":1.25},"gpt-5-1-codex":{"input":1.25,"output":10,"cacheRead":0.125,"cacheCreation":1.25},"gpt-5-codex":{"input":1.25,"output":10,"cacheRead":0.125,"cacheCreation":1.25},"codex-mini":{"input":1.5,"output":6,"cacheRead":0.375,"cacheCreation":1.5},"gpt-4-1":{"input":2,"output":8,"cacheRead":0.5,"cacheCreation":2},"gpt-4-1-mini":{"input":0.4,"output":1.6,"cacheRead":0.1,"cacheCreation":0.4},"gpt-4-1-nano":{"input":0.1,"output":0.4,"cacheRead":0.03,"cacheCreation":0.1},"gpt-4o":{"input":2.5,"output":10,"cacheRead":1.25,"cacheCreation":2.5},"gpt-4o-mini":{"input":0.15,"output":0.6,"cacheRead":0.075,"cacheCreation":0.15},"gpt-4-turbo":{"input":10,"output":30,"cacheRead":10,"cacheCreation":10},"gpt-4":{"input":30,"output":60,"cacheRead":30,"cacheCreation":30},"gpt-3-5-turbo":{"input":0.5,"output":1.5,"cacheRead":1.25,"cacheCreation":0.5},"o1":{"input":15,"output":60,"cacheRead":7.5,"cacheCreation":15},"o1-mini":{"input":1.1,"output":4.4,"cacheRead":0.55,"cacheCreation":1.1},"o1-pro":{"input":150,"output":600,"cacheRead":150,"cacheCreation":150},"o3":{"input":2,"output":8,"cacheRead":0.5,"cacheCreation":2},"o3-pro":{"input":20,"output":80,"cacheRead":20,"cacheCreation":20},"o3-mini":{"input":1.1,"output":4.4,"cacheRead":0.55,"cacheCreation":1.1},"o4-mini":{"input":1.1,"output":4.4,"cacheRead":0.275,"cacheCreation":1.1},"gemini-3-1-pro":{"input":2,"output":12,"cacheRead":0.2,"cacheCreation":2},"gemini-3-pro":{"input":2,"output":12,"cacheRead":0.2,"cacheCreation":2},"gemini-3-flash":{"input":0.5,"output":3,"cacheRead":0.05,"cacheCreation":0.5},"gemini-3-7-flash":{"input":0.5,"output":3,"cacheRead":0.05,"cacheCreation":0.5},"gemini-3-5-flash":{"input":0.5,"output":3,"cacheRead":0.05,"cacheCreation":0.5},"gemini-3-1-flash-lite":{"input":0.25,"output":1.5,"cacheRead":0.025,"cacheCreation":0.25},"gemini-3-6-flash":{"input":0.75,"output":3.75,"cacheRead":0.075,"cacheCreation":0.75},"gemini-3-8-flash":{"input":0.75,"output":3.75,"cacheRead":0.075,"cacheCreation":0.75},"gemini-2-5-pro":{"input":1.25,"output":10,"cacheRead":0.31,"cacheCreation":1.25},"gemini-2-5-flash":{"input":0.3,"output":2.5,"cacheRead":0.075,"cacheCreation":0.3},"gemini-2-5-flash-lite":{"input":0.1,"output":0.4,"cacheRead":0.025,"cacheCreation":0.1},"gemini-2-0-flash":{"input":0.1,"output":0.4,"cacheRead":0.025,"cacheCreation":0.1},"gemini-2-0-flash-lite":{"input":0.075,"output":0.3,"cacheRead":0.075,"cacheCreation":0.075},"gemini-1-5-pro":{"input":1.25,"output":5,"cacheRead":0.3125,"cacheCreation":1.25},"gemini-1-5-flash":{"input":0.075,"output":0.3,"cacheRead":0.01875,"cacheCreation":0.075},"grok-4":{"input":3,"output":15,"cacheRead":0.75,"cacheCreation":3},"grok-4-1-fast":{"input":0.2,"output":0.5,"cacheRead":0.05,"cacheCreation":0.2},"grok-4-6":{"input":2,"output":6,"cacheRead":0.5,"cacheCreation":2},"grok-4-fast":{"input":0.2,"output":0.5,"cacheRead":0.05,"cacheCreation":0.2},"grok-code-fast-1":{"input":0.2,"output":1.5,"cacheRead":0.02,"cacheCreation":0.2},"grok-3":{"input":3,"output":15,"cacheRead":0.75,"cacheCreation":3},"grok-3-mini":{"input":0.3,"output":0.5,"cacheRead":0.075,"cacheCreation":0.3},"deepseek-chat":{"input":0.28,"output":0.42,"cacheRead":0.028,"cacheCreation":0.28},"deepseek-reasoner":{"input":0.28,"output":0.42,"cacheRead":0.028,"cacheCreation":0.28},"deepseek-v4-pro":{"input":1.32,"output":3.96,"cacheRead":0.044,"cacheCreation":1.32},"claude-opus-4-5-20251101":{"input":5,"output":25,"cacheRead":0.5,"cacheCreation":6.25,"cacheWrite1h":10,"bedrockRegionalMultiplier":1.1},"claude-3-5-haiku-latest":{"input":0.8,"output":4,"cacheRead":0.08,"cacheCreation":1,"cacheWrite1h":1.6},"claude-3-5-sonnet-20241022":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":3.75,"cacheWrite1h":6},"claude-3-sonnet-20240229":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":0.3,"cacheWrite1h":0.5},"claude-opus-4-20250514":{"input":15,"output":75,"cacheRead":1.5,"cacheCreation":18.75,"cacheWrite1h":30},"claude-sonnet-4-5-20250929":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":3.75,"cacheWrite1h":6,"bedrockRegionalMultiplier":1.1},"claude-3-5-haiku-20241022":{"input":0.8,"output":4,"cacheRead":0.08,"cacheCreation":1,"cacheWrite1h":1.6},"claude-3-5-sonnet-20240620":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":3.75,"cacheWrite1h":6},"claude-3-7-sonnet-latest":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":3.75,"cacheWrite1h":6},"claude-3-7-sonnet-20250219":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":3.75,"cacheWrite1h":6},"claude-3-haiku-20240307":{"input":0.25,"output":1.25,"cacheRead":0.03,"cacheCreation":0.3,"cacheWrite1h":0.5},"claude-haiku-4-5-20251001":{"input":1,"output":5,"cacheRead":0.1,"cacheCreation":1.25,"cacheWrite1h":2,"bedrockRegionalMultiplier":1.1},"claude-3-opus-20240229":{"input":15,"output":75,"cacheRead":1.5,"cacheCreation":18.75,"cacheWrite1h":30},"claude-sonnet-4-20250514":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":3.75,"cacheWrite1h":6},"claude-opus-4-1-20250805":{"input":15,"output":75,"cacheRead":1.5,"cacheCreation":18.75,"cacheWrite1h":30},"gpt-4o-2024-11-20":{"input":2.5,"output":10,"cacheRead":1.25,"cacheCreation":0},"text-embedding-ada-002":{"input":0.1,"output":0,"cacheRead":0,"cacheCreation":0},"gpt-5-chat-latest":{"input":1.25,"output":10,"cacheRead":0,"cacheCreation":0},"codex-mini-latest":{"input":1.5,"output":6,"cacheRead":0.375,"cacheCreation":0},"gpt-4o-2024-05-13":{"input":5,"output":15,"cacheRead":0,"cacheCreation":0},"gpt-5-2-chat-latest":{"input":1.75,"output":14,"cacheRead":0.175,"cacheCreation":0},"o3-deep-research":{"input":10,"output":40,"cacheRead":2.5,"cacheCreation":0},"o4-mini-deep-research":{"input":2,"output":8,"cacheRead":0.5,"cacheCreation":0},"gpt-5-3-codex-spark":{"input":1.75,"output":14,"cacheRead":0.175,"cacheCreation":0},"text-embedding-3-small":{"input":0.02,"output":0,"cacheRead":0,"cacheCreation":0},"text-embedding-3-large":{"input":0.13,"output":0,"cacheRead":0,"cacheCreation":0},"gpt-5-1-codex-mini":{"input":0.25,"output":2,"cacheRead":0.025,"cacheCreation":0},"gpt-4o-2024-08-06":{"input":2.5,"output":10,"cacheRead":1.25,"cacheCreation":0},"gpt-5-1-chat-latest":{"input":1.25,"output":10,"cacheRead":0.125,"cacheCreation":0},"gemini-embedding-001":{"input":0.15,"output":0,"cacheRead":0,"cacheCreation":0},"gemini-2-5-flash-lite-preview-09-2025":{"input":0.1,"output":0.4,"cacheRead":0.025,"cacheCreation":0},"gemini-3-1-pro-preview-customtools":{"input":2,"output":12,"cacheRead":0.2,"cacheCreation":0},"gemini-2-5-pro-preview-06-05":{"input":1.25,"output":10,"cacheRead":0.31,"cacheCreation":0},"gemini-2-5-flash-preview-04-17":{"input":0.15,"output":0.6,"cacheRead":0.0375,"cacheCreation":0},"gemini-2-5-flash-preview-09-2025":{"input":0.3,"output":2.5,"cacheRead":0.075,"cacheCreation":0},"gemini-2-5-pro-preview-05-06":{"input":1.25,"output":10,"cacheRead":0.31,"cacheCreation":0},"gemini-2-5-flash-preview-05-20":{"input":0.15,"output":0.6,"cacheRead":0.0375,"cacheCreation":0},"gemini-3-1-flash-image-preview":{"input":0.25,"output":60,"cacheRead":0,"cacheCreation":0},"gemini-3-1-flash-image":{"input":0.5,"output":60,"cacheRead":0,"cacheCreation":0},"gemini-3-1-flash-lite-preview":{"input":0.5,"output":3,"cacheRead":0.05,"cacheCreation":0},"gemini-live-2-5-flash":{"input":0.5,"output":2,"cacheRead":0,"cacheCreation":0},"gemini-3-flash-preview":{"input":0.5,"output":3,"cacheRead":0.05,"cacheCreation":0},"gemini-live-2-5-flash-preview-native-audio":{"input":0.5,"output":2,"cacheRead":0,"cacheCreation":0},"gemini-2-5-flash-preview-tts":{"input":0.5,"output":10,"cacheRead":0,"cacheCreation":0},"gemini-3-1-pro-preview":{"input":2,"output":12,"cacheRead":0.2,"cacheCreation":0},"gemini-flash-latest":{"input":0.3,"output":2.5,"cacheRead":0.075,"cacheCreation":0},"gemini-2-5-flash-lite-preview-06-17":{"input":0.1,"output":0.4,"cacheRead":0.025,"cacheCreation":0},"gemini-2-5-flash-image":{"input":0.3,"output":30,"cacheRead":0.075,"cacheCreation":0},"gemini-2-5-pro-preview-tts":{"input":1,"output":20,"cacheRead":0,"cacheCreation":0},"gemini-1-5-flash-8b":{"input":0.0375,"output":0.15,"cacheRead":0.01,"cacheCreation":0},"gemini-3-pro-preview":{"input":2,"output":12,"cacheRead":0.2,"cacheCreation":0},"gemini-flash-lite-latest":{"input":0.1,"output":0.4,"cacheRead":0.025,"cacheCreation":0},"grok-2-1212":{"input":2,"output":10,"cacheRead":2,"cacheCreation":0},"grok-2":{"input":2,"output":10,"cacheRead":2,"cacheCreation":0},"grok-3-fast-latest":{"input":5,"output":25,"cacheRead":1.25,"cacheCreation":0},"grok-2-vision":{"input":2,"output":10,"cacheRead":2,"cacheCreation":0},"grok-2-vision-1212":{"input":2,"output":10,"cacheRead":2,"cacheCreation":0},"grok-4-1-fast-non-reasoning":{"input":0.2,"output":0.5,"cacheRead":0.05,"cacheCreation":0},"grok-beta":{"input":5,"output":15,"cacheRead":5,"cacheCreation":0},"grok-3-mini-fast":{"input":0.6,"output":4,"cacheRead":0.15,"cacheCreation":0},"grok-4-20-experimental-beta-0304-reasoning":{"input":2,"output":6,"cacheRead":0.2,"cacheCreation":0},"grok-3-latest":{"input":3,"output":15,"cacheRead":0.75,"cacheCreation":0},"grok-4-20-multi-agent-experimental-beta-0304":{"input":2,"output":6,"cacheRead":0.2,"cacheCreation":0},"grok-2-vision-latest":{"input":2,"output":10,"cacheRead":2,"cacheCreation":0},"grok-3-mini-latest":{"input":0.3,"output":0.5,"cacheRead":0.075,"cacheCreation":0},"grok-4-20-experimental-beta-0304-non-reasoning":{"input":2,"output":6,"cacheRead":0.2,"cacheCreation":0},"grok-3-mini-fast-latest":{"input":0.6,"output":4,"cacheRead":0.15,"cacheCreation":0},"grok-2-latest":{"input":2,"output":10,"cacheRead":2,"cacheCreation":0},"grok-4-fast-non-reasoning":{"input":0.2,"output":0.5,"cacheRead":0.05,"cacheCreation":0},"grok-vision-beta":{"input":5,"output":15,"cacheRead":5,"cacheCreation":0},"grok-3-fast":{"input":5,"output":25,"cacheRead":1.25,"cacheCreation":0},"glm-5":{"input":1,"output":3.2,"cacheRead":0.2,"cacheCreation":0},"glm-5-code":{"input":1.2,"output":5,"cacheRead":0.3,"cacheCreation":0},"glm-4-7":{"input":0.6,"output":2.2,"cacheRead":0.11,"cacheCreation":0},"glm-4-7-flashx":{"input":0.07,"output":0.4,"cacheRead":0.01,"cacheCreation":0},"glm-4-6":{"input":0.6,"output":2.2,"cacheRead":0.11,"cacheCreation":0},"glm-4-5":{"input":0.6,"output":2.2,"cacheRead":0.11,"cacheCreation":0},"glm-4-5-x":{"input":2.2,"output":8.9,"cacheRead":0.45,"cacheCreation":0},"glm-4-5-air":{"input":0.2,"output":1.1,"cacheRead":0.03,"cacheCreation":0},"glm-4-5-airx":{"input":1.1,"output":4.5,"cacheRead":0.22,"cacheCreation":0},"glm-4-32b-0414-128k":{"input":0.1,"output":0.1,"cacheRead":0,"cacheCreation":0},"glm-4-7-flash":{"input":0,"output":0,"cacheRead":0,"cacheCreation":0},"glm-4-5-flash":{"input":0,"output":0,"cacheRead":0,"cacheCreation":0},"big-pickle":{"input":0,"output":0,"cacheRead":0,"cacheCreation":0},"minimax-m2-5-free":{"input":0,"output":0,"cacheRead":0,"cacheCreation":0},"minimax-m2-5":{"input":0.3,"output":1.2,"cacheRead":0.06,"cacheCreation":0.375},"minimax-m2-1":{"input":0.3,"output":1.2,"cacheRead":0.1,"cacheCreation":0},"kimi-k3":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":3,"cacheWrite1h":6},"k3":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":3,"cacheWrite1h":6},"kimi-k2-6":{"input":0.95,"output":4,"cacheRead":0.16,"cacheCreation":0.95},"kimi-k2-5":{"input":0.6,"output":3,"cacheRead":0.1,"cacheCreation":0},"kimi-for-coding":{"input":0.6,"output":3,"cacheRead":0.1,"cacheCreation":0},"kimi-k2-thinking":{"input":0.4,"output":2.5,"cacheRead":0,"cacheCreation":0},"kimi-k2":{"input":0.4,"output":2.5,"cacheRead":0,"cacheCreation":0},"qwen3-coder-480b":{"input":0.45,"output":1.5,"cacheRead":0,"cacheCreation":0},"qwen3-coder-480b-a35b-v1":{"input":0.45,"output":1.8,"cacheRead":0,"cacheCreation":0},"qwen3-coder-30b-a3b-v1":{"input":0.15,"output":0.6,"cacheRead":0,"cacheCreation":0},"claude-opus-4-7":{"input":5,"output":25,"cacheRead":0.5,"cacheCreation":6.25,"cacheWrite1h":10,"bedrockRegionalMultiplier":1.1},"claude-opus-4-8":{"input":5,"output":25,"cacheRead":0.5,"cacheCreation":6.25,"cacheWrite1h":10,"bedrockRegionalMultiplier":1.1},"claude-sonnet-4-7":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":3.75,"cacheWrite1h":6,"bedrockRegionalMultiplier":1.1,"estimated":true},"claude-sonnet-4-8":{"input":3,"output":15,"cacheRead":0.3,"cacheCreation":3.75,"cacheWrite1h":6,"bedrockRegionalMultiplier":1.1,"estimated":true},"claude-haiku-4-6":{"input":1,"output":5,"cacheRead":0.1,"cacheCreation":1.25,"cacheWrite1h":2,"bedrockRegionalMultiplier":1.1,"estimated":true},"claude-smart-router":{"input":1,"output":5,"cacheRead":0.1,"cacheCreation":1.25,"cacheWrite1h":2}}');
}
var NORMALIZED_TABLES = /* @__PURE__ */ new WeakMap();
function normalizedTable(table) {
  const cached = NORMALIZED_TABLES.get(table);
  if (cached) return cached;
  const normalized = /* @__PURE__ */ new Map();
  const ambiguous = /* @__PURE__ */ new Set();
  for (const [rawKey, rate] of Object.entries(table)) {
    if (rawKey.startsWith("_")) continue;
    const key = priceTableKey(rawKey);
    if (normalized.has(key) && JSON.stringify(normalized.get(key)) !== JSON.stringify(rate)) ambiguous.add(key);
    normalized.set(key, rate);
  }
  for (const key of ambiguous) normalized.delete(key);
  NORMALIZED_TABLES.set(table, normalized);
  return normalized;
}
function lookupRate(table, modelId) {
  if (!table || !modelId) return null;
  const rates = normalizedTable(table);
  const hit = resolvePriceKey(modelId, (key) => rates.get(key));
  return hit ? applyBedrockRegionalPremium(hit.value, modelId) : null;
}
function messageCost(rate, usage) {
  const cacheWriteRate = rate.cacheCreation ?? rate.cacheWrite ?? 0;
  const split = usage.cache_creation;
  const write5m = split?.ephemeral_5m_input_tokens ?? 0;
  const write1h = split?.ephemeral_1h_input_tokens ?? 0;
  const cacheWrite = write5m || write1h ? write5m * cacheWriteRate + write1h * (rate.cacheWrite1h ?? cacheWriteRate) : (usage.cache_creation_input_tokens ?? 0) * cacheWriteRate;
  return ((usage.input_tokens ?? 0) * (rate.input ?? 0) + (usage.output_tokens ?? 0) * (rate.output ?? 0) + (usage.cache_read_input_tokens ?? 0) * (rate.cacheRead ?? 0) + cacheWrite) / 1e6;
}
async function computeSessionCost(transcriptPath, {
  readFile = fs.readFile,
  readDir = fs.readdir,
  writeFile = fs.writeFile,
  stat = fs.stat,
  readPrices = defaultReadPrices
} = {}) {
  if (!transcriptPath) return null;
  let table;
  try {
    table = await readPrices();
  } catch {
    return null;
  }
  const subagentDir = path.join(
    path.dirname(transcriptPath),
    path.basename(transcriptPath, ".jsonl"),
    "subagents"
  );
  const sourcePaths = [transcriptPath];
  try {
    for (const name of await readDir(subagentDir)) {
      if (name.endsWith(".jsonl")) sourcePaths.push(path.join(subagentDir, name));
    }
  } catch {
  }
  const signature = await sourceSignature(sourcePaths, stat);
  try {
    const cached = JSON.parse(await readFile(COST_CACHE_FILE, "utf8"));
    if (cached.schema === COST_CACHE_SCHEMA && cached.signature === signature && typeof cached.cost === "number" && typeof cached.exact === "boolean") {
      return { cost: cached.cost, exact: cached.exact };
    }
  } catch {
  }
  const sources = [];
  for (const sourcePath of sourcePaths) {
    try {
      sources.push(await readFile(sourcePath, "utf8"));
    } catch {
    }
  }
  const byMessage = /* @__PURE__ */ new Map();
  let anon = 0;
  for (const raw of sources) {
    for (const line of raw.split("\n")) {
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line)?.message;
      } catch {
        continue;
      }
      if (!message?.usage) continue;
      const id = message.id ?? `anon:${anon++}`;
      const routing = parseRoutingHeaders(message);
      const model = parseBackendModelName(message) ?? routing?.routedModel ?? message.model ?? "";
      byMessage.set(id, { model, usage: message.usage, classifierCost: routing?.classifierCostUSD ?? 0 });
    }
  }
  let cost = 0;
  let exact = true;
  let pricedTurns = 0;
  for (const { model, usage, classifierCost } of byMessage.values()) {
    cost += classifierCost;
    const rate = lookupRate(table, model);
    if (!rate) {
      exact = false;
      continue;
    }
    cost += messageCost(rate, usage);
    pricedTurns++;
  }
  if (pricedTurns === 0 && byMessage.size > 0) return null;
  const result = { cost, exact };
  try {
    await writeFile(COST_CACHE_FILE, JSON.stringify({ schema: COST_CACHE_SCHEMA, signature, ...result }), "utf8");
  } catch {
  }
  return result;
}
function formatDuration(ms) {
  if (typeof ms !== "number" || Number.isNaN(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 6e4);
  const secs = Math.floor(ms % 6e4 / 1e3);
  return `${mins}m ${secs}s`;
}
function fmt(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}
function fmtWindow(n) {
  if (n >= 1e6) return `${Number((n / 1e6).toFixed(1))}M`;
  return `${Math.round(n / 1e3)}k`;
}
var C = {
  reset: "\x1B[0m",
  purple: "\x1B[38;2;177;185;249m",
  green: "\x1B[0;32m",
  yellow: "\x1B[0;33m",
  red: "\x1B[0;31m",
  cyan: "\x1B[0;36m",
  blue: "\x1B[0;94m",
  gray: "\x1B[0;37m",
  magenta: "\x1B[0;35m",
  white: "\x1B[1;37m"
};
var c = (color, text) => `${color}${text}${C.reset}`;
function formatReset(epochSeconds) {
  if (typeof epochSeconds !== "number" || Number.isNaN(epochSeconds)) return null;
  const d = new Date(epochSeconds * 1e3);
  const day = d.toLocaleDateString(void 0, { weekday: "short" });
  const time = d.toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} ${time}`;
}
function ctxBar(pct) {
  if (typeof pct !== "number" || Number.isNaN(pct)) return null;
  const clamped = Math.max(0, Math.min(100, pct));
  const color = clamped >= 90 ? C.red : clamped >= 70 ? C.yellow : C.green;
  const filled = Math.floor(clamped / 10);
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(10 - filled);
  return `${c(color, bar)} ${pct}%`;
}
function budgetColor(pct) {
  return pct > 85 ? C.red : pct > 30 ? C.yellow : C.green;
}
var MAX_PROJECT_CHARS = 20;
var MAX_BRANCH_CHARS = 20;
function truncate(text, max) {
  if (typeof text !== "string") return "";
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}\u2026`;
}
function buildStatusLine({ projectName, branch, model, effort, actualModel, ctxPct, ctxTokens, ctxSize, fiveHourPct, sevenDayPct, fiveHourResetsAt, sevenDayResetsAt, cost, costExact, budget = null, budgetError = null }) {
  const parts = [];
  if (budget) parts.push(c(budgetColor(budget.pct), budget.text));
  else if (budgetError) parts.push(c(C.yellow, `\u26A0 ${budgetError}`));
  if (typeof cost === "number" && !Number.isNaN(cost)) {
    parts.push(c(C.yellow, `${costExact ? "" : "~"}$${cost.toFixed(4)}`));
  }
  let ctxPart = null;
  if (typeof ctxPct === "number" && !Number.isNaN(ctxPct)) {
    const color = ctxPct >= 90 ? C.red : ctxPct >= 70 ? C.yellow : C.green;
    ctxPart = `${c(C.purple, "context")} ${ctxTokens != null ? `${c(C.white, fmt(ctxTokens))}${typeof ctxSize === "number" && ctxSize > 0 ? c(C.gray, `/${fmtWindow(ctxSize)}`) : ""} ` : ""}${c(color, `${ctxPct}%`)}`;
  }
  if (typeof fiveHourPct === "number") {
    const next = formatReset(fiveHourResetsAt);
    parts.push(`${c(C.blue, "5h")} ${c(budgetColor(fiveHourPct), `${Math.round(fiveHourPct)}%`)}${next ? ` ${c(C.gray, `(${next})`)}` : ""}`);
  }
  if (typeof sevenDayPct === "number") {
    const next = formatReset(sevenDayResetsAt);
    parts.push(`${c(C.magenta, "7d")} ${c(budgetColor(sevenDayPct), `${Math.round(sevenDayPct)}%`)}${next ? ` ${c(C.gray, `(${next})`)}` : ""}`);
  }
  const modelLine = model ? c(C.cyan, `[${actualModel ? `${model} → ${actualModel}` : model}${effort ? ` · ${effort}` : ""}]`) : null;
  if (!modelLine && ctxPart) parts.unshift(ctxPart);
  const body = parts.join(" | ");
  const headline = modelLine ? (ctxPart ? `${modelLine} ${ctxPart}` : modelLine) : null;
  return headline ? `${headline}\n${body}` : body;
}
function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}
async function gitBranch(cwd) {
  try {
    const { stdout } = await exec("git", ["--no-optional-locks", "symbolic-ref", "--short", "HEAD"], { cwd, timeout: 2e3 });
    if (stdout.trim()) return stdout.trim();
  } catch {
  }
  try {
    const { stdout } = await exec("git", ["--no-optional-locks", "rev-parse", "--short", "HEAD"], { cwd, timeout: 2e3 });
    return stdout.trim() || "";
  } catch {
    return "";
  }
}
async function resolveBudget({
  readFile = fs.readFile,
  writeFile = fs.writeFile,
  fetchImpl = fetch,
  getAuthHeadersImpl = getAuthHeaders
} = {}) {
  let config;
  try {
    config = JSON.parse(await readFile(CONFIG_FILE, "utf8"));
  } catch {
    return { budget: null, budgetError: null };
  }
  const sessionProfile = process.env.CODEMIE_PROFILE_NAME;
  const profileName = sessionProfile && config.profiles?.[sessionProfile] ? sessionProfile : config.activeProfile;
  try {
    const cache = JSON.parse(await readFile(CACHE_FILE, "utf8"));
    const validShape = cache.schema === CACHE_SCHEMA && cache.profile === profileName && typeof cache.value === "object" && cache.value !== null && typeof cache.value.text === "string";
    if (validShape && Date.now() - cache.ts < CACHE_TTL_MS) {
      return { budget: cache.value, budgetError: null };
    }
  } catch {
  }
  const profile = config.profiles?.[profileName];
  const { baseUrl } = profile ?? {};
  const codeMieUrl = config.workspace?.codeMieUrl;
  const userEmail = config.userEmail;
  if (!profile || !codeMieUrl || !baseUrl || !userEmail) {
    return { budget: null, budgetError: null };
  }
  let sameOrigin = false;
  try {
    sameOrigin = new URL(baseUrl).origin === new URL(codeMieUrl).origin;
  } catch {
  }
  if (!sameOrigin) return { budget: null, budgetError: null };
  let headers;
  try {
    headers = await getAuthHeadersImpl(codeMieUrl);
  } catch (e) {
    return { budget: null, budgetError: e instanceof Error ? e.message : String(e) };
  }
  if (!headers) {
    return { budget: null, budgetError: "reauthenticate" };
  }
  try {
    const res = await fetchImpl(`${baseUrl}/v1/analytics/budget_usage`, {
      headers: { "Content-Type": "application/json", "X-CodeMie-Client": "codemie-cli", ...headers },
      signal: AbortSignal.timeout(BUDGET_FETCH_TIMEOUT_MS)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentType = res.headers?.get?.("content-type") ?? "";
    if (!contentType.includes("json")) return { budget: null, budgetError: null };
    const json = await res.json();
    const row = matchBudgetRow(json?.data?.rows, userEmail);
    if (!row) throw new Error("budget row not found");
    const budget = formatBudgetSegment(row);
    await writeFile(CACHE_FILE, JSON.stringify({ schema: CACHE_SCHEMA, profile: profileName, ts: Date.now(), value: budget }), "utf8");
    return { budget, budgetError: null };
  } catch (e) {
    const code = e instanceof Error && e.cause && typeof e.cause === "object" && "code" in e.cause ? e.cause.code : void 0;
    const message = e instanceof Error ? e.message : String(e);
    return { budget: null, budgetError: code ? `budget: ${code}` : message };
  }
}
async function main() {
  const stdinRaw = await readStdin();
  let basic;
  try {
    basic = extractBasicInfo(JSON.parse(stdinRaw));
  } catch {
    basic = extractBasicInfo({});
  }
  const labels = parseModelLabels(process.env);
  const nominalLabel = lookupNominalLabel(labels, basic.modelId);
  if (nominalLabel) basic.model = nominalLabel;
  const branchPromise = basic.cwd ? gitBranch(basic.cwd) : Promise.resolve("");
  const [budgetResult, branch, actualModel, priced] = await Promise.all([
    resolveBudget(),
    branchPromise,
    isRoutingConfigured(process.env, basic.modelId) ? resolveActualModel(basic.transcriptPath, { labels }) : Promise.resolve(null),
    computeSessionCost(basic.transcriptPath)
  ]);
  const cost = priced ? priced.cost : basic.cost;
  const costExact = priced ? priced.exact : false;
  const budgetError = budgetResult.budgetError === "reauthenticate" ? budgetResult.budgetError : null;
  process.stdout.write(buildStatusLine({ ...basic, budget: budgetResult.budget, budgetError, branch, actualModel, cost, costExact }));
}
function isMainModule(argv1, metaUrl) {
  if (!argv1) return false;
  try {
    return fileURLToPath(metaUrl) === argv1;
  } catch {
    return false;
  }
}
if (isMainModule(process.argv[1], import.meta.url)) {
  main().catch(() => {
    process.stdout.write("");
  });
}
export {
  buildStatusLine,
  computeSessionCost,
  ctxBar,
  extractBasicInfo,
  fmt,
  formatBudgetSegment,
  formatDuration,
  getAuthHeaders,
  isMainModule,
  isRoutingConfigured,
  lookupNominalLabel,
  lookupRate,
  main,
  matchBudgetRow,
  normalizeModelId,
  parseLastAssistantTurn,
  parseModelLabels,
  parseRouterModelIds,
  resolveActualModel,
  resolveBudget,
  truncate
};
