import {
  database,
  currentNamespace,
  assertWritable,
  allRecords,
} from './store';
import type { PackDraft } from './pack-studio';
import type { LocalRecord } from './model';
export async function studioDrafts(
  ns = currentNamespace(),
): Promise<PackDraft[] & { incompleteCount: number }> {
  const rows = await allRecords(ns),
    map = new Map(rows.filter((r) => !r.deleted).map((r) => [r.id, r]));
  let incompleteCount = 0;
  const result = rows
    .filter(
      (r) =>
        !r.deleted &&
        r.kind === 'job' &&
        r.payload.kind === 'pack-studio-draft',
    )
    .map((r): PackDraft | null => {
      try {
        return {
          id: r.id,
          revision: r.payload.revision,
          savedAt: r.updated_at,
          pack: JSON.parse(
            r.payload.parts
              .map((id: string) => {
                const part = map.get(id);
                if (!part || part.payload.revision !== r.payload.revision)
                  throw Error('incomplete');
                return part.payload.text;
              })
              .join(''),
          ),
        };
      } catch {
        incompleteCount++;
        return null;
      }
    })
    .filter((x): x is PackDraft => !!x)
    .sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''));
  return Object.assign(result, { incompleteCount });
}
/** Optimistic revision check and all chunks/header share one IDB transaction. */
export async function saveStudioDraft(
  draft: PackDraft,
  ns = currentNamespace(),
): Promise<string> {
  if (currentNamespace() !== ns) throw Error('账户已切换，草稿未写入新账户');
  assertWritable(ns);
  const db = await database(),
    tx = db.transaction(['records', 'queue'], 'readwrite');
  try {
    const records = tx.objectStore('records'),
      previous = await records.get(ns + '/' + draft.id);
    if (
      previous &&
      !previous.deleted &&
      previous.payload.revision !== draft.revision
    )
      throw Error('此草稿已在其他窗口更新，请重新打开，当前内容可先下载备份');
    const revision = crypto.randomUUID(),
      at = new Date().toISOString(),
      text = JSON.stringify(draft.pack),
      parts: string[] = [],
      writes: LocalRecord[] = [];
    for (let offset = 0; offset < text.length; offset += 6000) {
      const id = draft.id + ':' + revision + ':' + parts.length;
      parts.push(id);
      writes.push({
        id,
        kind: 'job',
        payload: {
          id,
          kind: 'pack-studio-part',
          revision,
          text: text.slice(offset, offset + 6000),
        },
        updated_at: at,
        deleted: false,
      });
    }
    for (const id of previous?.payload.parts ?? [])
      writes.push({
        id,
        kind: 'job',
        payload: { id, kind: 'pack-studio-part' },
        updated_at: at,
        deleted: true,
      });
    writes.push({
      id: draft.id,
      kind: 'job',
      payload: {
        id: draft.id,
        kind: 'pack-studio-draft',
        revision,
        title: draft.pack.manifest.title,
        parts,
      },
      updated_at: at,
      deleted: false,
    });
    for (const row of writes) {
      const stored = { ...row, key: ns + '/' + row.id, namespace: ns };
      await records.put(stored);
      await tx.objectStore('queue').put(stored);
    }
    await tx.done;
    return revision;
  } catch (e) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw e;
  }
}
