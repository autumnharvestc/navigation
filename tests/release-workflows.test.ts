import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFile = promisify(execFileCallback);

describe('release workflow configuration', () => {
  it('gives CI read-only contents permission', async () => {
    const workflow = await readFile(join('.github', 'workflows', 'ci.yml'), 'utf8');
    expect(workflow).toContain('permissions:\n  contents: read');
  });

  it('tracks generated link status instead of ignoring it', async () => {
    const gitignore = await readFile('.gitignore', 'utf8');
    expect(gitignore).not.toContain('data/generated/link-status.json');
    const status = await readFile(join('data', 'generated', 'link-status.json'), 'utf8');
    expect(JSON.parse(status)).toBeInstanceOf(Array);
    const tracked = await execFile(
      'git',
      ['ls-files', '--error-unmatch', '--', 'data/generated/link-status.json'],
      { cwd: process.cwd() },
    );
    expect(tracked.stdout.trim()).toBe('data/generated/link-status.json');
  });

  it('commits only changed generated status on protected release branches', async () => {
    const workflow = await readFile(join('.github', 'workflows', 'link-check.yml'), 'utf8');
    expect(workflow).toMatch(
      /if: always\(\) && \(github\.ref_name == 'master' \|\| github\.ref_name == 'main'\)/,
    );
    expect(workflow).toContain('git add -- data/generated/link-status.json');
    expect(workflow).toContain('git diff --cached --quiet -- data/generated/link-status.json');
    expect(workflow).not.toContain('git add data/regions.json');
    expect(workflow).not.toContain('git add data/national.json');
    expect(workflow).not.toContain('git add data/provinces');
  });

  it('deploys after link-check completion because token pushes do not trigger push events', async () => {
    const workflow = await readFile(join('.github', 'workflows', 'deploy-pages.yml'), 'utf8');
    expect(workflow).toContain('workflow_run:');
    expect(workflow).toContain('workflows: [Link Check]');
    expect(workflow).toContain('types: [completed]');
    expect(workflow).toContain('ref: ${{ github.event.workflow_run.head_branch || github.ref }}');
  });

  it('runs e2e against a production preview at the Pages base path', async () => {
    const config = await readFile('playwright.config.ts', 'utf8');
    expect(config).toContain("command: 'npm run build && npm run preview");
    expect(config).toContain('process.env.GITHUB_REPOSITORY');
    expect(config).toContain('githubPagesBase');
  });
  it('excludes nested worktrees from unit test discovery', async () => {
    const config = await readFile('vite.config.ts', 'utf8');
    expect(config).toContain('**/.worktrees/**');
  });
});
