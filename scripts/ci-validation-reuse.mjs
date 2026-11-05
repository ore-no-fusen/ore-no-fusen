import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inflateRawSync, crc32 } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const SUITES = new Set(['frontend', 'rust', 'msix']);
export const TTL_MS = 24 * 60 * 60 * 1000;
const sha = value => /^[a-f0-9]{40}$/.test(value ?? '');
const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const hash = value => createHash('sha256').update(value).digest('hex');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
export function parentsFromCommit(raw) {
  const header = raw.split(/\r?\n\r?\n/, 1)[0];
  const parents = header.split(/\r?\n/).filter(line => line.startsWith('parent ')).map(line => line.slice(7));
  if (!parents.every(sha)) throw Error('Invalid commit parent header');
  return parents;
}
// git show %P hides parents at a shallow boundary; raw commit headers do not.
const headParents = () => parentsFromCommit(git('cat-file', '-p', 'HEAD'));

export function assertCleanInputs(cwd = process.cwd()) {
  const names = args => execFileSync('git', args, { cwd, encoding: 'utf8' }).split('\0').filter(Boolean);
  const changed = names(['diff', '--name-only', '--no-renames', '-z', 'HEAD']);
  if (changed.length) throw Error(`Tracked validation inputs changed: ${JSON.stringify(changed)}`);
  const untracked = names(['ls-files', '--others', '--exclude-standard', '-z']);
  if (untracked.length) throw Error(`Untracked validation inputs exist: ${JSON.stringify(untracked)}`);
}

export function environment(suite, env = process.env) {
  const values = {
    platform: process.platform, arch: process.arch, node: process.version,
    image: env.ImageVersion ?? '', imageOS: env.ImageOS ?? '',
    settings: hash(JSON.stringify(Object.fromEntries(
      ['CI', 'TZ', 'NODE_ENV', 'GDRIVE_CLIENT_ID', 'GDRIVE_CLIENT_SECRET'].map(k => [k, env[k] ?? ''])
    ))),
  };
  if (suite !== 'frontend') values.rust = execFileSync('rustc', ['-Vv'], { encoding: 'utf8' }).trim();
  return values;
}

export function eligiblePush(context) {
  return context.event === 'push' && context.ref === 'refs/heads/develop'
    && Number(context.attempt) === 1 && !context.force
    && sha(context.commit) && sha(context.tree) && context.parents?.length === 2
    && context.parents.every(sha) && context.before === context.parents[0];
}

export function matchesProof(proof, context, pr, run, artifact, now = Date.now()) {
  if (!eligiblePush(context) || !SUITES.has(context.suite)) return false;
  if (!proof || proof.schema !== 1 || proof.mode !== 'executed' || proof.result !== 'success') return false;
  if (proof.suite !== context.suite || proof.repository !== context.repository) return false;
  if (!pr?.merged || pr.merge_commit_sha !== context.commit || pr.base?.ref !== 'develop') return false;
  if (pr.head?.repo?.full_name !== context.repository || pr.base?.repo?.full_name !== context.repository) return false;
  if (pr.base.sha !== context.parents[0] || pr.head.sha !== context.parents[1]) return false;
  if (proof.pr !== pr.number || proof.base !== pr.base.sha || proof.head !== pr.head.sha) return false;
  if (!sha(proof.testedCommit) || proof.tree !== context.tree
      || JSON.stringify(proof.parents) !== JSON.stringify(context.parents)) return false;
  if (run?.event !== 'pull_request' || run.status !== 'completed' || run.conclusion !== 'success') return false;
  if (run.path?.split('@')[0] !== '.github/workflows/test.yml' || run.head_sha !== pr.head.sha) return false;
  if (run.head_repository?.full_name !== context.repository) return false;
  if (run.head_branch !== pr.head.ref) return false;
  // GitHub can clear pull_requests after merging, even for same-repo PRs.
  // The trusted receipt binds PR number/base/head; keep any remaining API link consistent.
  if (run.pull_requests?.length && !run.pull_requests.some(p => p.number === pr.number)) return false;
  if (!id(run.id) || proof.run !== run.id || proof.attempt !== run.run_attempt) return false;
  const name = `validation-${context.suite}-${run.id}-${run.run_attempt}`;
  if (!artifact || artifact.name !== name || artifact.expired || !id(artifact.id)) return false;
  if (!/^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? '')) return false;
  if (artifact.workflow_run?.id !== run.id) return false;
  const created = Date.parse(proof.createdAt), expires = Date.parse(artifact.expires_at);
  if (!Number.isFinite(created) || !Number.isFinite(expires) || created > now || now - created >= TTL_MS || expires <= now + 60_000) return false;
  if (!context.environment?.image || !context.environment.imageOS) return false;
  return JSON.stringify(proof.environment) === JSON.stringify(context.environment);
}

// GitHub artifact v4 ZIP: read exactly one bounded JSON file; never extract paths.
export function readReceiptZip(buffer, expectedName) {
  if (!Buffer.isBuffer(buffer) || buffer.length > 2 * 1024 * 1024) throw Error('Receipt archive is too large');
  let end = -1;
  for (let p = buffer.length - 22; p >= Math.max(0, buffer.length - 65557); p--) {
    if (buffer.readUInt32LE(p) === 0x06054b50 && p + 22 + buffer.readUInt16LE(p + 20) === buffer.length) { end = p; break; }
  }
  if (end < 0 || buffer.readUInt16LE(end + 4) !== 0 || buffer.readUInt16LE(end + 6) !== 0
      || buffer.readUInt16LE(end + 8) !== 1 || buffer.readUInt16LE(end + 10) !== 1) throw Error('Expected one receipt entry');
  const start = buffer.readUInt32LE(end + 16), size = buffer.readUInt32LE(end + 12);
  if (start + size !== end || size < 46 || buffer.readUInt32LE(start) !== 0x02014b50) throw Error('Bad ZIP directory');
  const flags = buffer.readUInt16LE(start + 8), method = buffer.readUInt16LE(start + 10);
  const compressed = buffer.readUInt32LE(start + 20), uncompressed = buffer.readUInt32LE(start + 24);
  const names = buffer.readUInt16LE(start + 28), extras = buffer.readUInt16LE(start + 30), comments = buffer.readUInt16LE(start + 32);
  if (46 + names + extras + comments !== size || flags & 1 || ![0, 8].includes(method)
      || uncompressed > 65536 || compressed > 131072) throw Error('Unsupported receipt entry');
  if (buffer.subarray(start + 46, start + 46 + names).toString('utf8') !== expectedName) throw Error('Wrong receipt filename');
  const local = buffer.readUInt32LE(start + 42);
  if (local + 30 > start || buffer.readUInt32LE(local) !== 0x04034b50
      || buffer.readUInt16LE(local + 8) !== method || buffer.readUInt16LE(local + 6) !== flags) throw Error('Bad local header');
  const localNames = buffer.readUInt16LE(local + 26), localExtras = buffer.readUInt16LE(local + 28);
  if (buffer.subarray(local + 30, local + 30 + localNames).toString('utf8') !== expectedName) throw Error('Local filename mismatch');
  const data = local + 30 + localNames + localExtras;
  if (data + compressed > start) throw Error('Overlapping ZIP data');
  const raw = buffer.subarray(data, data + compressed);
  const result = method === 8 ? inflateRawSync(raw, { maxOutputLength: 65536 }) : raw;
  if (result.length !== uncompressed || crc32(result) !== buffer.readUInt32LE(start + 16)) throw Error('Receipt checksum mismatch');
  return JSON.parse(result.toString('utf8'));
}

async function bytes(response, limit) {
  if (!response.ok) throw Error(`GitHub HTTP ${response.status}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > limit) { await response.body.cancel().catch(() => {}); throw Error('GitHub response limit'); }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function findProof(context, { request, download, now = Date.now() }) {
  if (!eligiblePush(context)) return null;
  const prs = await request(`commits/${context.commit}/pulls?per_page=100`);
  if (!Array.isArray(prs) || prs.length >= 100) return null;
  const matches = prs.filter(p => p.merged_at && p.merge_commit_sha === context.commit && p.base?.ref === 'develop');
  if (matches.length !== 1) return null;
  const pr = await request(`pulls/${matches[0].number}`);
  const list = await request(`actions/workflows/test.yml/runs?head_sha=${context.parents[1]}&event=pull_request&per_page=100`);
  if (list.total_count > 100 || !Array.isArray(list.workflow_runs)) return null;
  // Never fall back to an older green run when the latest applicable run failed.
  const runs = list.workflow_runs.filter(r => r.head_branch === pr.head.ref
    && r.head_repository?.full_name === context.repository
    && (!r.pull_requests?.length || r.pull_requests.some(p => p.number === pr.number))).sort((a, b) => b.id - a.id);
  if (!runs.length) return null;
  const run = await request(`actions/runs/${runs[0].id}`);
  if (run.status !== 'completed' || run.conclusion !== 'success') return null;
  const artifacts = await request(`actions/runs/${run.id}/artifacts?per_page=100`);
  if (artifacts.total_count > 100 || !Array.isArray(artifacts.artifacts)) return null;
  const selected = artifacts.artifacts.filter(a => a.name === `validation-${context.suite}-${run.id}-${run.run_attempt}`);
  if (selected.length !== 1) return null;
  const artifact = selected[0];
  if (artifact.expired || !id(artifact.id) || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? '')) return null;
  const archive = await download(`actions/artifacts/${artifact.id}/zip`);
  if (`sha256:${hash(archive)}` !== artifact.digest) return null;
  const proof = readReceiptZip(archive, `${context.suite}.json`);
  return matchesProof(proof, context, pr, run, artifact, now) ? { proof, artifact: artifact.id } : null;
}

function contextFor(suite, env) {
  const payload = JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  if (git('rev-parse', 'HEAD') !== env.GITHUB_SHA) throw Error('Checkout does not match the current Actions commit');
  return {
    suite, repository: env.GITHUB_REPOSITORY, event: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF,
    commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
    parents: headParents(),
    before: payload.before, attempt: Number(env.GITHUB_RUN_ATTEMPT),
    force: env.CI_FORCE_FULL_VALIDATION === 'true', environment: environment(suite, env),
    payload,
  };
}

function clients(repository, token) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '') || !token) throw Error('Missing GitHub read credentials');
  const get = route => fetch(`https://api.github.com/repos/${repository}/${route}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    redirect: 'manual', signal: AbortSignal.timeout(15000),
  });
  return {
    request: async route => JSON.parse((await bytes(await get(route), 2 * 1024 * 1024)).toString('utf8')),
    download: async route => {
      let response = await get(route);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = new URL(response.headers.get('location'));
        if (location.protocol !== 'https:') throw Error('Invalid artifact redirect');
        // Do not forward the GitHub token to the storage host.
        response = await fetch(location, { signal: AbortSignal.timeout(15000) });
      }
      return bytes(response, 2 * 1024 * 1024);
    },
  };
}

function output(values) {
  if (!process.env.GITHUB_OUTPUT) throw Error('Missing GITHUB_OUTPUT');
  fs.appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${v}\n`).join(''));
}

export async function auditReuse(needs, { parents, commit, repository }, { request, log = console.log }) {
    for (const name of SUITES) {
      const source = needs[name]?.outputs;
      if (source?.reused !== 'true') continue;
      if (parents.length !== 2 || !id(source.source_run) || !id(source.source_attempt) || !id(source.source_pr)) throw Error('Invalid reuse audit inputs');
      const run = await request(`actions/runs/${source.source_run}`);
      const list = await request(`actions/workflows/test.yml/runs?head_sha=${parents[1]}&event=pull_request&per_page=100`);
      const pr = await request(`pulls/${source.source_pr}`);
      const latest = list.workflow_runs?.filter(r => r.head_branch === pr.head?.ref
        && r.head_repository?.full_name === repository
        && (!r.pull_requests?.length || r.pull_requests.some(p => p.number === Number(source.source_pr)))).sort((a,b)=>b.id-a.id)[0];
      if (list.total_count > 100 || !latest || latest.id !== Number(source.source_run)
          || run.status !== 'completed' || run.conclusion !== 'success'
          || run.run_attempt !== Number(source.source_attempt) || run.event !== 'pull_request'
          || !pr.merged || pr.merge_commit_sha !== commit
          || pr.base?.sha !== parents[0] || pr.head?.sha !== parents[1]
          || run.head_branch !== pr.head.ref || run.head_sha !== parents[1] || run.path?.split('@')[0] !== '.github/workflows/test.yml'
          || run.head_repository?.full_name !== repository) throw Error('Reused validation changed or is no longer successful; rerun full validation');
      log(`Audited ${name}: current source PR run ${run.id}/${run.run_attempt} remains successful.`);
    }
}

export async function main([command, suite], env = process.env) {
  if (command === 'audit') {
    const needs = JSON.parse(env.VALIDATION_NEEDS ?? '{}');
    const parents = headParents();
    const api = clients(env.GITHUB_REPOSITORY, env.GH_TOKEN);
    await auditReuse(needs, { parents, commit: git('rev-parse', 'HEAD'), repository: env.GITHUB_REPOSITORY }, api);
    return;
  }
  if (!SUITES.has(suite) || !['check', 'record', 'status'].includes(command)) throw Error('Expected check/record/status and a suite');
  const directory = '.ci-validation'; fs.mkdirSync(directory, { recursive: true });
  const statePath = path.join(directory, `current-${suite}.json`);
  if (command === 'check') {
    const context = contextFor(suite, env);
    let previous = null;
    if (eligiblePush(context)) {
      try { previous = await findProof(context, clients(context.repository, env.GH_TOKEN)); }
      catch (error) { console.log(`No reusable validation (${error.message}); executing normal checks.`); }
    }
    const state = { context, previous };
    fs.writeFileSync(statePath, JSON.stringify(state));
    output({ reused: previous ? 'true' : 'false', source_run: previous?.proof.run ?? '',
      source_attempt: previous?.proof.attempt ?? '', source_pr: previous?.proof.pr ?? '' });
    console.log(previous
      ? `Verified ${suite} for current commit ${context.commit}: identical tree/parents/environment, successful PR run ${previous.proof.run}.`
      : `Executing fresh ${suite} checks for current commit ${context.commit}.`);
    return;
  }
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (git('rev-parse', 'HEAD') !== state.context.commit || git('rev-parse', 'HEAD^{tree}') !== state.context.tree) throw Error('Validation checkout changed');
  if (command === 'status') {
    if (!state.previous || suite !== 'msix') throw Error('No verified MSIX result');
    fs.writeFileSync('msix-ci-status.json', JSON.stringify({
      overall: 'reused', validation_mode: 'verified-pr-result',
      commit_sha: state.context.commit, tree: state.context.tree,
      source_run: state.previous.proof.run, source_attempt: state.previous.proof.attempt,
      source_tested_commit: state.previous.proof.testedCommit, source_artifact: state.previous.artifact,
      created: false, note: 'No new MSIX package was created in this run.',
    }, null, 2));
    return;
  }
  const c = state.context, pr = c.payload.pull_request;
  if (state.previous || c.event !== 'pull_request' || !pr || !c.environment.image || !c.environment.imageOS
      || pr.head?.repo?.full_name !== c.repository || pr.base?.repo?.full_name !== c.repository) {
    output({ eligible: 'false' }); return;
  }
  if (c.parents.length !== 2 || c.parents[0] !== pr.base.sha || c.parents[1] !== pr.head.sha) throw Error('Tested merge parents do not match PR');
  assertCleanInputs();
  const proof = {
    schema: 1, mode: 'executed', result: 'success', suite, repository: c.repository,
    run: Number(env.GITHUB_RUN_ID), attempt: Number(env.GITHUB_RUN_ATTEMPT),
    pr: c.payload.number, base: pr.base.sha, head: pr.head.sha,
    testedCommit: c.commit, tree: c.tree, parents: c.parents,
    environment: c.environment, createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(directory, `${suite}.json`), JSON.stringify(proof));
  output({ eligible: 'true' });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
