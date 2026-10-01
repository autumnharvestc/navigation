import { describe, expect, it } from 'vitest';
import { renderStatusBadge, statusLabel } from '../src/components/status-badge';

describe('statusLabel', () => {
  it('never describes an unknown link as broken', () => {
    expect(statusLabel(undefined)).toBe('待核验');
    expect(statusLabel({ id: 'a', status: 'unknown', checkedAt: '2026-09-30T00:00:00.000Z' })).toBe(
      '待核验',
    );
    expect(statusLabel({ id: 'a', status: 'valid', checkedAt: '2026-09-30T00:00:00.000Z' })).toBe(
      '正常',
    );
    expect(statusLabel({ id: 'a', status: 'invalid', checkedAt: '2026-09-30T00:00:00.000Z' })).toBe(
      '失效',
    );
  });
});

describe('renderStatusBadge', () => {
  it('renders a readable unknown badge when status is missing', () => {
    const badge = renderStatusBadge(undefined);

    expect(badge.textContent).toBe('待核验');
    expect(badge.dataset.status).toBe('unknown');
  });
});
