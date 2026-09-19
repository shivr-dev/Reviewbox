'use client';
import { useState } from 'react';
import { Trash2, Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { clearAllStudyData, currentNamespace, exportBackup } from '@/lib/store';
import { download } from '@/lib/importer';
export default function ClearDataCard() {
  const [open, setOpen] = useState(false),
    [confirmation, setConfirmation] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [scope, setScope] = useState('local');
  return (
    <section className="clear-data-panel">
      <h2>清理所有学习数据</h2>
      <p>
        移除测试留下的课程、资料、题目、学习记录、掌握度、笔记和计划。清理后保留账户与基础学科框架。
      </p>
      <button
        className="danger-button"
        onClick={() => {
          setScope(currentNamespace());
          setOpen(true);
          setConfirmation('');
          setError('');
        }}
      >
        <Trash2 size={15} />
        清理所有数据
      </button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="clear-dialog">
          <DialogTitle>确认清理全部学习数据</DialogTitle>
          <DialogDescription>
            {scope === 'local'
              ? '将清理此设备未登录学习空间的全部个人数据。'
              : '将清理当前学习账户的本地及云端数据，同时清理此设备未登录学习空间的数据。其他学习账户不受影响。'}
            此操作无法撤销；已保存的 SAT／ACT 试卷也会移除。
          </DialogDescription>
          <button
            className="quiet"
            disabled={busy}
            onClick={() =>
              void exportBackup().then((value) =>
                download(
                  'review-backup-before-clear.json',
                  JSON.stringify(value, null, 2),
                  'application/json',
                ),
              )
            }
          >
            <Download size={15} />
            先导出当前空间备份
          </button>
          <label>
            输入“清理所有数据”以确认
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={busy}
              autoComplete="off"
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="button-row">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              取消
            </button>
            <button
              className="danger-button"
              disabled={busy || confirmation !== '清理所有数据'}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await clearAllStudyData(scope);
                  window.location.hash = 'you';
                  window.location.reload();
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : '清理未完成，请重试',
                  );
                  setBusy(false);
                }
              }}
            >
              {busy ? '正在清理…' : '确认永久清理'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
