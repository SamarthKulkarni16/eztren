// scripts/health-check.mjs
//
// Daily health check for eztren.xyz + its GitHub repo.
// Run by .github/workflows/daily-health-check.yml every day at 9am IST.
//
// What it does:
//  1. Reads build/lint results (passed in via env vars from the workflow)
//  2. Pings the live site to make sure it's up
//  3. Crawls the homepage + a few known pages for broken internal links
//  4. Compares today's issue list against yesterday's (stored in
//     .github/health-state.json) so it can label issues NEW vs ongoing,
//     and so fixed issues silently disappear from the report
//  5. Sends one SMS summarizing the result via the SMS Gateway app
//  6. Writes the updated state file so the next run can diff against it

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SITE_URL = "https://eztren.xyz";
const PAGES_TO_CRAWL = ["/", "/about", "/rankings", "/constitution"];
const STATE_FILE = ".github/health-state.json";

const SMS_USERNAME = process.env.SMS_GATEWAY_USERNAME;
const SMS_PASSWORD = process.env.SMS_GATEWAY_PASSWORD;
const SMS_TO_NUMBER = process.env.SMS_TO_NUMBER; // e.g. +91XXXXXXXXXX
const SMS_SERVER = process.env.SMS_GATEWAY_SERVER || "https://api.sms-gate.app";

const BUILD_STATUS = process.env.BUILD_STATUS; // "success" | "failure"
const LINT_STATUS = process.env.LINT_STATUS; // "success" | "failure"
const BUILD_LOG_TAIL = process.env.BUILD_LOG_TAIL || "";
const LINT_LOG_TAIL = process.env.LINT_LOG_TAIL || "";

/** @type {{id: string, message: string}[]} */
const issues = [];

function addIssue(id, message) {
  issues.push({ id, message });
}

// ---------- 1. Build / lint results (already run by the workflow) ----------

if (BUILD_STATUS === "failure") {
  addIssue("build-failure", `Build failed. ${truncate(BUILD_LOG_TAIL, 200)}`);
}

if (LINT_STATUS === "failure") {
  addIssue("lint-failure", `Lint errors found. ${truncate(LINT_LOG_TAIL, 200)}`);
}

// ---------- 2. Site up/down check ----------

async function checkSiteUp() {
  try {
    const res = await fetch(SITE_URL, { redirect: "follow" });
    if (!res.ok) {
      addIssue("site-down", `${SITE_URL} returned HTTP ${res.status}`);
    }
    return res.ok;
  } catch (err) {
    addIssue("site-unreachable", `${SITE_URL} unreachable: ${err.message}`);
    return false;
  }
}

// ---------- 3. Broken internal link check ----------

async function checkLinksOnPage(path) {
  const pageUrl = new URL(path, SITE_URL).toString();
  let html;
  try {
    const res = await fetch(pageUrl);
    if (!res.ok) {
      addIssue(`page-${path}`, `Page ${path} returned HTTP ${res.status}`);
      return;
    }
    html = await res.text();
  } catch (err) {
    addIssue(`page-${path}-unreachable`, `Page ${path} unreachable: ${err.message}`);
    return;
  }

  const hrefs = [...html.matchAll(/href="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((href) => href.startsWith("/") && !href.startsWith("//"))
    .filter((href, i, arr) => arr.indexOf(href) === i) // dedupe
    .slice(0, 15); // safety cap per page

  for (const href of hrefs) {
    const linkUrl = new URL(href, SITE_URL).toString();
    try {
      const res = await fetch(linkUrl, { method: "HEAD" });
      if (!res.ok && res.status !== 405) {
        // some servers don't support HEAD (405) - fall back to GET
        const getRes = await fetch(linkUrl);
        if (!getRes.ok) {
          addIssue(`broken-link-${href}`, `Broken link: ${href} (HTTP ${getRes.status})`);
        }
      } else if (!res.ok) {
        addIssue(`broken-link-${href}`, `Broken link: ${href} (HTTP ${res.status})`);
      }
    } catch (err) {
      addIssue(`broken-link-${href}-err`, `Broken link: ${href} (${err.message})`);
    }
  }
}

// ---------- 4. Dedupe against previous state ----------

function loadPreviousState() {
  if (!existsSync(STATE_FILE)) return { issueIds: [] };
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return { issueIds: [] };
  }
}

function saveState(currentIssueIds) {
  writeFileSync(
    STATE_FILE,
    JSON.stringify({ issueIds: currentIssueIds, updatedAt: new Date().toISOString() }, null, 2)
  );
}

// ---------- 5. SMS sending ----------

async function sendSms(text) {
  if (!SMS_USERNAME || !SMS_PASSWORD || !SMS_TO_NUMBER) {
    console.log("SMS credentials missing - skipping send. Message would have been:\n" + text);
    return;
  }
  const auth = Buffer.from(`${SMS_USERNAME}:${SMS_PASSWORD}`).toString("base64");
  const res = await fetch(`${SMS_SERVER}/3rdparty/v1/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      textMessage: { text },
      phoneNumbers: [SMS_TO_NUMBER],
    }),
  });
  const body = await res.text();
  console.log(`SMS Gateway response (${res.status}): ${body}`);
  if (!res.ok) {
    throw new Error(`SMS send failed with status ${res.status}: ${body}`);
  }
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "..." : str;
}

// ---------- main ----------

async function main() {
  await checkSiteUp();
  for (const page of PAGES_TO_CRAWL) {
    await checkLinksOnPage(page);
  }

  const previous = loadPreviousState();
  const previousIds = new Set(previous.issueIds || []);
  const currentIds = issues.map((i) => i.id);

  let message;
  if (issues.length === 0) {
    message = "Eztren Support: All Good.";
  } else {
    const lines = issues.map((i) => {
      const tag = previousIds.has(i.id) ? "(ongoing)" : "(NEW)";
      return `${tag} ${i.message}`;
    });
    message = `Eztren Support (${dateStr()}): ${issues.length} issue(s):\n${lines.join("\n")}`;
  }

  // SMS provider limits length - keep it reasonable
  message = truncate(message, 600);

  console.log(message);
  await sendSms(message);

  saveState(currentIds);
}

function dateStr() {
  return new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
