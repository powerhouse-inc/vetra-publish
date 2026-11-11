import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRemote, runContext } from '../src/run-context.js';

const base = { GITHUB_SHA: 'c0ffee', GITHUB_REPOSITORY: 'acme/shop', GITHUB_RUN_NUMBER: '37' };

test('a push: its branch is the target', () => {
  assert.deepEqual(runContext({ ...base, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/feat/x' }), {
    event: 'push', branch: 'feat/x', pr: null, target: 'feat/x', sha: 'c0ffee', repository: 'acme/shop', runNumber: '37',
  });
});

test('a pull request: no branch, the base branch is the target, the merge commit is the commit', () => {
  const r = runContext({ ...base, GITHUB_EVENT_NAME: 'pull_request', GITHUB_REF: 'refs/pull/12/merge', GITHUB_BASE_REF: 'next' });
  assert.deepEqual([r.branch, r.pr, r.target, r.sha], [null, 12, 'next', 'c0ffee']);
});

test('tags, dispatches and other events are refused with the reason', () => {
  assert.throws(() => runContext({ ...base, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/tags/v1.0.0' }), /tag/);
  assert.throws(() => runContext({ ...base, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main' }), /push and pull_request/);
  assert.throws(() => runContext({ GITHUB_EVENT_NAME: 'push' }), /GitHub Actions/);
});

test('parseRemote reads https and ssh GitHub remotes', () => {
  assert.equal(parseRemote('https://github.com/acme/shop.git\n'), 'acme/shop');
  assert.equal(parseRemote('git@github.com:acme/shop.git'), 'acme/shop');
  assert.equal(parseRemote('https://gitlab.com/acme/shop.git'), null);
});
