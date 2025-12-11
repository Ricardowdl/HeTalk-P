type JsonValue = any;

function getByPath(obj: any, path: string): any {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setByPath(obj: any, path: string, value: JsonValue): void {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== 'object' || cur[p] == null) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}

function delByPath(obj: any, path: string): void {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== 'object' || cur[p] == null) return;
    cur = cur[p];
  }
  delete cur[parts[parts.length - 1]];
}

export function getWorldState(): any {
  try {
    const raw = localStorage.getItem('world_state') || '{}';
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

export function saveWorldState(state: any) {
  localStorage.setItem('world_state', JSON.stringify(state || {}));
}

export function applyCommands(cmds: Array<{ action: 'set'|'add'|'push'|'delete'; key: string; value?: any }>) {
  if (!Array.isArray(cmds) || !cmds.length) return;
  const state = getWorldState();
  for (const c of cmds) {
    const action = String(c?.action || '').toLowerCase() as any;
    const key = String(c?.key || '').trim();
    if (!key) continue;
    if (action === 'set') {
      setByPath(state, key, c.value);
    } else if (action === 'add') {
      const cur = getByPath(state, key);
      const next = (Number(cur) || 0) + (Number(c?.value) || 0);
      setByPath(state, key, next);
    } else if (action === 'push') {
      const cur = getByPath(state, key);
      const arr = Array.isArray(cur) ? cur : [];
      arr.push(c.value);
      setByPath(state, key, arr);
    } else if (action === 'delete') {
      delByPath(state, key);
    }
  }
  saveWorldState(state);
}
