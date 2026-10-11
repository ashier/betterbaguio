#!/usr/bin/env node

import { rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_BASE = 'https://citycouncil.baguio.gov.ph/api/';
const SOURCE_PAGE = 'https://citycouncil.baguio.gov.ph/ordinances';
const PAGE_LIMIT = 1000;
const REQUEST_DELAY_MS = 250;
const MAX_ATTEMPTS = 3;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputFile = path.join(root, 'data', 'ordinances.json');
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
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'BetterBaguio.org open-data sync (github.com/ashier/betterbaguio)'
        },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
      const payload = await response.json();
      if (!payload || typeof payload !== 'object') throw new Error(`Invalid JSON payload from ${url}`);
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await sleep(attempt * 2000);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

function validateRecord(record, ids) {
  if (!record || typeof record !== 'object') throw new Error('Invalid ordinance record');
  for (const field of ['id', 'year', 'number']) {
    if (record[field] === undefined || record[field] === null || record[field] === '') {
      throw new Error(`Ordinance record is missing ${field}`);
    }
  }
  if (!Number.isInteger(Number(record.year))) throw new Error(`Ordinance ${record.id} has an invalid year`);
  if (!record.file || !record.file.id || !record.file.previewUrl || record.file.ext !== 'pdf') {
    throw new Error(`Ordinance ${record.id} has invalid PDF metadata`);
  }
  if (ids.has(record.id)) throw new Error(`Duplicate ordinance id ${record.id}`);
  ids.add(record.id);
}

function normalizeRecord(record) {
  return {
    id: record.id,
    year: Number(record.year),
    number: record.number,
    title: record.subject || record.title || 'Title not supplied by the source',
    summary: record.title || null,
    keywords: Array.isArray(record.tags) ? record.tags.map((tag) => tag.keyword).filter(Boolean) : [],
    officialPage: `${SOURCE_PAGE}/${record.id}`,
    pdf: {
      id: record.file.id,
      url: record.file.previewUrl,
      name: record.file.name,
      sizeBytes: Number(record.file.size && record.file.size.bytes) || null,
      updatedAt: record.file.updated_at || null
    },
    sourceUpdatedAt: record.updated_at || null
  };
}

async function run() {
  process.stdout.write('Fetching ordinance page 1... ');
  const first = await fetchJson('view-ordinances', { limit: PAGE_LIMIT, page: 1 });
  if (!Array.isArray(first.data) || !first.meta) throw new Error('Ordinance API returned an invalid first page');

  const lastPage = Number(first.meta.last_page) || 1;
  const reportedTotal = Number(first.meta.total);
  const records = first.data.slice();
  process.stdout.write(`${records.length} records\n`);

  for (let page = 2; page <= lastPage; page += 1) {
    process.stdout.write(`Fetching ordinance page ${page}... `);
    const payload = await fetchJson('view-ordinances', { limit: PAGE_LIMIT, page });
    if (!Array.isArray(payload.data)) throw new Error(`Invalid ordinance page ${page}`);
    records.push(...payload.data);
    process.stdout.write(`${payload.data.length} records\n`);
  }

  if (!Number.isFinite(reportedTotal) || records.length !== reportedTotal) {
    throw new Error(`Ordinance count mismatch: received ${records.length}, API reports ${first.meta.total}`);
  }

  const ids = new Set();
  records.forEach((record) => validateRecord(record, ids));
  const ordinances = records.map(normalizeRecord);
  const availableYears = [...new Set(ordinances.map((record) => record.year))].sort((a, b) => b - a);
  const numberCounts = new Map();
  ordinances.forEach((record) => numberCounts.set(record.number, (numberCounts.get(record.number) || 0) + 1));

  const snapshot = {
    schemaVersion: 1,
    retrievedAt: new Date().toISOString(),
    recordCount: ordinances.length,
    availableYears,
    source: {
      name: 'Baguio City Council ordinance database',
      page: SOURCE_PAGE,
      apiEndpoint: new URL('view-ordinances', API_BASE).href,
      note: 'BetterBaguio republishes searchable metadata and links each record to the official source document.'
    },
    quality: {
      missingSourceTitles: records.filter((record) => !record.subject).length,
      missingSourceSummaries: records.filter((record) => !record.title).length,
      duplicateNumberGroups: [...numberCounts.values()].filter((count) => count > 1).length
    },
    ordinances
  };

  await writeFile(temporaryFile, JSON.stringify(snapshot) + '\n', 'utf8');
  await rename(temporaryFile, outputFile);
  console.log(`Wrote ${path.relative(root, outputFile)} with ${ordinances.length} ordinances (${availableYears.at(-1)}–${availableYears[0]})`);
}

run().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
