#!/usr/bin/env node
/**
 * Eztren Health Check
 *
 * What this does:
 *  - Reads BUILD_STATUS / LINT_STATUS env vars (set by the workflow from the
 *    npm run build / npm run lint steps) and turns failures into issues
 *  - Crawls a fixed list of pages on the live site and checks every internal
 *    link found on them for broken (non-2xx) responses
 *  - Writes status.json with everything found
 *
 * What this does NOT do (moved to Make.com):
 *  - Sending the SMS
 *  - Deduplicating against yesterday's issues ("only alert on NEW issues")
 *  - Checking if the site itself is up (Make.com pings eztren.xyz directly)
 */

import fs from "node:fs/promises";

const SITE_URL = "https://eztren.xyz";
const PAGES_TO_CRAWL = ["/", "/about", "/rankings", "/constitution"];

const issues = [];

function addIssue(id, message) {
  issues.push({ id, message });
}

// 1. Build result (passed in from the workflow's build step)
if (process.env.BUILD_STATUS === "failure") {
  addIssue(
    "build-failed",
    "npm run build failed — check the GitHub Actions run logs for details."
  );
}

// 2. Lint result (passed in from the workflow's lint step)
if (process.env.LINT_STATUS === "failure") {
  addIssue(
    "lint-failed",
    "npm run lint reported errors — check the GitHub Actions run logs for details."
  );
}

// 3. Crawl pages for broken internal links
async function fetchPage(path) {
  const url = `${SITE_URL}${path}`;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) {
      addIssue(`page-status-${path}`, `${url} returned HTTP ${res.status}`);
      return null;
    }
    return await res.text();
  } catch (err) {
    addIssue(`page-fetch-${path}`, `${url} failed to load: ${err.message}`);
    return null;
  }
}

function extractInternalLinks(html) {
  const hrefRegex = /href=["']([^"']+)["']/g;
  const links = new Set();
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];
    if (href.startsWith("/") && !href.startsWith("//")) {
      links.add(href);
    } else if (href.startsWith(SITE_URL)) {
      links.add(href.slice(SITE_URL.length) || "/");
    }
  }
  return links;
}

async function checkLink(path, foundOnPage) {
  const url = `${SITE_URL}${path}`;
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (!res.ok) {
      // Some servers/routes don't support HEAD properly — retry with GET
      // before flagging it as actually broken.
      const getRes = await fetch(url, { method: "GET", redirect: "follow" });
      if (!getRes.ok) {
        addIssue(
          `broken-link-${path}`,
          `Broken internal link ${path} (found on ${foundOnPage}) — HTTP ${getRes.status}`
        );
      }
    }
  } catch (err) {
    addIssue(
      `broken-link-${path}`,
      `Broken internal link ${path} (found on ${foundOnPage}) — ${err.message}`
    );
  }
}

async function crawl() {
  const checkedLinks = new Set();

  for (const page of PAGES_TO_CRAWL) {
    const html = await fetchPage(page);
    if (!html) continue;

    const links = extractInternalLinks(html);
    for (const link of links) {
      const cleanLink = link.split("#")[0].split("?")[0];
      if (!cleanLink || checkedLinks.has(cleanLink)) continue;
      checkedLinks.add(cleanLink);
      await checkLink(cleanLink, page);
    }
  }
}

await crawl();

const status = {
  checkedAt: new Date().toISOString(),
  issues,
};

await fs.writeFile("status.json", JSON.stringify(status, null, 2));

console.log(`Health check complete. ${issues.length} issue(s) found.`);
if (issues.length > 0) {
  console.log(JSON.stringify(issues, null, 2));
}
