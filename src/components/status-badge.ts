import type { LinkStatus } from '../domain/schema';

const labels: Record<LinkStatus['status'], string> = {
  valid: '正常',
  invalid: '失效',
  unknown: '待核验',
};

export function statusLabel(status?: LinkStatus): string {
  return labels[status?.status ?? 'unknown'];
}

export function renderStatusBadge(status?: LinkStatus): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'status-badge';
  badge.dataset.status = status?.status ?? 'unknown';
  badge.textContent = statusLabel(status);
  return badge;
}
