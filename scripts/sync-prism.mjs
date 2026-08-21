#!/usr/bin/env node

import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = 'https://data.baguio.gov.ph/api/';
const SOURCE_PAGE = 'https://data.baguio.gov.ph/prism';
const PAGE_LIMIT = 500;
const REQUEST_DELAY_MS = 250;
const MAX_ATTEMPTS = 3;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(root, 'data', 'prism');
const outputFile = path.join(outputDir, 'projects.json');
const temporaryFile = outputFile + '.tmp';
let lastRequestAt = 0;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function paceRequests() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < REQUEST_DELAY_MS) await sleep(REQUEST_DELAY_MS - elapsed);
  lastRequestAt = Date.now();
}

async function fetchJson(endpoint, params) {
  const url = new URL(endpoint, API_BASE);
  Object.entries(params || {}).forEach(([key, value]) => url.searchParams.set(key, String(value)));

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await paceRequests();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'BetterBaguio.org open-data sync (github.com/ashier/betterbaguio)'
        },
        signal: controller.signal
      });
      if (!response.ok) {
        const retryAfter = Number(response.headers.get('retry-after')) || attempt * 2;
        throw Object.assign(new Error(`${response.status} ${response.statusText} for ${url}`), { retryAfter });
      }
      const payload = await response.json();
      if (!payload || typeof payload !== 'object') throw new Error(`Invalid JSON payload from ${url}`);
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await sleep((error.retryAfter || attempt * 2) * 1000);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function validateProject(project, year) {
  if (!project || typeof project !== 'object') throw new Error(`Invalid ${year} project record`);
  for (const field of ['id', 'title', 'current_stage', 'implementing_office', 'appropriation']) {
    if (project[field] === undefined || project[field] === null || project[field] === '') {
      throw new Error(`Project in ${year} is missing ${field}`);
    }
  }
  if (!Array.isArray(project.barangays)) throw new Error(`Project ${project.id} has invalid barangays`);
  if (!Number.isFinite(Number(project.appropriation))) throw new Error(`Project ${project.id} has invalid appropriation`);
}

async function fetchProjects(year) {
  const common = { year, fund: 'All', office: 'All', status: 'All', limit: PAGE_LIMIT };
  const first = await fetchJson('prism/infra/list', { ...common, page: 1 });
  const lastPage = Number(first.last_page) || 1;
  const projects = Array.isArray(first.data) ? first.data.slice() : [];

  for (let page = 2; page <= lastPage; page += 1) {
    const next = await fetchJson('prism/infra/list', { ...common, page });
    if (!Array.isArray(next.data)) throw new Error(`Invalid project page ${page} for ${year}`);
    projects.push(...next.data);
  }

  const reportedTotal = Number(first.total);
  if (!Number.isFinite(reportedTotal) || projects.length !== reportedTotal) {
    throw new Error(`Project count mismatch for ${year}: received ${projects.length}, list reports ${first.total}`);
  }

  const seen = new Set();
  projects.forEach((project) => {
    validateProject(project, year);
    if (seen.has(project.id)) throw new Error(`Duplicate project id ${project.id} in ${year}`);
    seen.add(project.id);
  });
  return projects;
}

async function run() {
  const manilaYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', year: 'numeric' }).format(new Date()));
  const preferredDefaultYear = Number(process.env.PRISM_DEFAULT_YEAR) || manilaYear - 1;
  const seedStats = await fetchJson('prism/infra/stats', {
    year: preferredDefaultYear,
    fund: 'All',
    office: 'All',
    status: 'All'
  });
  const years = [...new Set((seedStats.year_options || []).map(Number).filter(Number.isFinite))].sort((a, b) => b - a);
  if (!years.length) throw new Error('PRISM did not return any available years');
  const defaultYear = years.includes(preferredDefaultYear) ? preferredDefaultYear : years[0];
  const yearData = {};

  for (const year of years) {
    process.stdout.write(`Syncing PRISM ${year}... `);
    const projects = await fetchProjects(year);
    const stats = year === preferredDefaultYear ? seedStats : await fetchJson('prism/infra/stats', {
      year,
      fund: 'All',
      office: 'All',
      status: 'All'
    });
    if (Number(stats.total) !== projects.length) {
      throw new Error(`PRISM changed while syncing ${year}: stats report ${stats.total}, list returned ${projects.length}`);
    }
    yearData[String(year)] = { stats, projects };
    process.stdout.write(`${projects.length} projects\n`);
  }

  const snapshot = {
    schemaVersion: 1,
    retrievedAt: new Date().toISOString(),
    defaultYear,
    availableYears: years,
    source: {
      name: 'City Government of Baguio Open Data Portal — PRISM',
      page: SOURCE_PAGE,
      statsEndpoint: new URL('prism/infra/stats', API_BASE).href,
      projectsEndpoint: new URL('prism/infra/list', API_BASE).href,
      note: 'Data is provided as is and is not updated in real time.'
    },
    years: yearData
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(temporaryFile, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  await rename(temporaryFile, outputFile);
  console.log(`Wrote ${path.relative(root, outputFile)}`);
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
