// Settings: currency, regions (with area managers), JSON export/import, sample data reset and clear.

import * as store from '../store.js';
import { esc, today } from '../util.js';
import { card, confirmDialog, formModal, toast } from '../ui.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const CURRENCIES = 
['PHP', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'JPY', 'CNY', 'INR', 'AED'];

export function render(main) {
  const cur = store.settings().currency;
  const counts = ['projects', 'tasks', 'costs'].map((c) => `${store.all(c).length} ${c}`).join(' · ');

  main.innerHTML = `<div class="grid max-w-3xl gap-4">
    ${card('Preferences', `<label class="block max-w-xs"><span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Currency</span>
      <select id="currency" class="input w-full">${[...new Set([cur, ...CURRENCIES])].map((c) => `<option ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`)}
    ${card('Regions', `<p class="text-sm text-slate-600 dark:text-slate-400">Group projects into regions. Each region's area manager sees every project in it, broken down by project manager; Head Office sees all regions.</p>
      <ul class="mt-3 divide-y divide-slate-100 dark:divide-slate-800">${store.regions().map((r, i) => `<li class="flex items-center gap-3 py-2 text-sm">
        <div class="min-w-0 flex-1"><div class="truncate font-medium">${esc(r.name)}</div><div class="truncate text-xs text-slate-500 dark:text-slate-400">${esc(r.manager || 'No area manager')} · ${plural(store.all('projects').filter((p) => p.region === r.name).length, 'project')}</div></div>
        <button data-region="${i}" class="btn">Edit</button></li>`).join('') || '<li class="py-2 text-sm text-slate-500">No regions yet.</li>'}</ul>
      <button id="add-region" class="btn mt-3">+ Add region</button>`)}
    ${card('Your data', `<p class="text-sm text-slate-600 dark:text-slate-400">Everything is stored in this browser only (${esc(counts)}). Export a backup regularly, and import it to move to another computer or browser.</p>
      <div class="mt-4 flex flex-wrap gap-2">
        <button id="export" class="btn btn-primary">Export backup (.json)</button>
        <label class="btn">Import backup…<input id="import" type="file" accept="application/json,.json" class="sr-only"></label>
      </div>`)}
    ${card('Reset', `<p class="text-sm text-slate-600 dark:text-slate-400">Replace everything with the sample projects, or start with an empty workspace. Your currency setting is kept when clearing.</p>
      <div class="mt-4 flex flex-wrap gap-2">
        <button id="sample" class="btn">Load sample data</button>
        <button id="clear" class="btn text-rose-600">Clear all data</button>
      </div>`)}
  </div>`;

  main.querySelector('#currency').addEventListener('change', (e) => { store.setSettings({ currency: e.target.value }); toast(`Currency set to ${e.target.value}`); });

  main.querySelector('#add-region').addEventListener('click', () => editRegion());
  main.querySelectorAll('[data-region]').forEach((b) => b.addEventListener('click', () => editRegion(store.regions()[b.dataset.region])));

  main.querySelector('#export').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([store.exportData()], { type: 'application/json' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `project-management-${today()}.json` });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  main.querySelector('#import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!(await confirmDialog({ title: 'Import backup?', message: `Replace all current data with "${file.name}"?`, confirmLabel: 'Import', danger: true }))) return;
    try {
      store.importData(await file.text());
      toast('Backup imported');
    } catch (err) {
      toast(err.message || 'Could not read that file', 'error');
    }
  });

  main.querySelector('#sample').addEventListener('click', async () => {
    if (await confirmDialog({ title: 'Load sample data?', message: 'All current projects, tasks and costs will be replaced.', confirmLabel: 'Load sample', danger: true })) {
      store.resetSample();
      toast('Sample data loaded');
    }
  });

  main.querySelector('#clear').addEventListener('click', async () => {
    if (await confirmDialog({ title: 'Clear all data?', message: 'All projects, tasks and costs will be permanently removed from this browser.', confirmLabel: 'Clear everything', danger: true })) {
      store.clearAll();
      toast('All data cleared');
    }
  });

  return 'Settings';
}

async function editRegion(r) {
  const v = await formModal({
    title: r ? `Edit ${r.name}` : 'New region',
    fields: [
      { name: 'name', label: 'Region name', value: r?.name, required: true },
      { name: 'manager', label: 'Area manager', value: r?.manager },
    ],
    validate: (x) => (x.name !== r?.name && store.regions().some((o) => o.name === x.name) ? 'A region with that name already exists.' : null),
    deletable: !!r,
  });
  if (!v) return;
  if (v.__delete) {
    if (await confirmDialog({ title: `Delete ${r.name}?`, message: 'Its projects are kept but will have no region.', confirmLabel: 'Delete region', danger: true })) {
      store.removeRegion(r.name);
      toast('Region deleted');
    }
    return;
  }
  store.saveRegion(r?.name, v);
  toast(r ? 'Region saved' : `Added ${v.name}`);

}
