import { toHash } from '../router';
import type { Region } from '../domain/schema';

export function renderBreadcrumbs(ancestors: Region[], currentRegion: Region): HTMLElement {
  const navigation = document.createElement('nav');
  navigation.className = 'breadcrumbs';
  navigation.setAttribute('aria-label', '面包屑');

  const list = document.createElement('ol');

  for (const ancestor of ancestors) {
    const link = document.createElement('a');
    link.href =
      ancestor.level === 'country'
        ? '#/'
        : toHash({
            kind: 'region',
            regionCode: ancestor.code,
          });
    link.textContent = ancestor.name;

    const item = document.createElement('li');
    item.append(link);
    list.append(item);
  }

  const currentText = document.createElement('span');
  currentText.setAttribute('aria-current', 'page');
  currentText.textContent = currentRegion.name;

  const currentItem = document.createElement('li');
  currentItem.append(currentText);
  list.append(currentItem);

  navigation.append(list);
  return navigation;
}
