'use client';
import { useEffect, useRef, useState } from 'react';
export type PreparedFile = {
  url: string;
  name: string;
  bytes: number;
  namespace: string;
};
export function usePreparedDownload(namespace: string) {
  const [file, setFile] = useState<PreparedFile>(),
    files = useRef<PreparedFile[]>([]);
  useEffect(() => {
    setFile(undefined);
    for (const file of files.current) URL.revokeObjectURL(file.url);
    files.current = [];
    return () => {
      for (const file of files.current) URL.revokeObjectURL(file.url);
      files.current = [];
    };
  }, [namespace]);
  function prepare(blob: Blob, name: string) {
    if (!blob.size) throw Error('文档为空，未准备下载');
    if (
      files.current.reduce((sum, file) => sum + file.bytes, 0) + blob.size >
      128 * 1024 * 1024
    )
      throw Error('临时文档达到内存上限，请先下载，再重新打开导出工具');
    const value = {
      url: URL.createObjectURL(blob),
      name,
      bytes: blob.size,
      namespace,
    };
    files.current.push(value);
    setFile(value);
  }
  return { file: file?.namespace === namespace ? file : undefined, prepare };
}
export function PreparedDownload({ file }: { file: PreparedFile | undefined }) {
  if (!file) return null;
  return (
    <div className="prepared-download" role="status">
      <div>
        <strong>Word 文档已生成</strong>
        <span>
          {file.name} · {Math.max(1, Math.round(file.bytes / 1024))} KB
        </span>
        <small>
          点击下载保存文件。重新生成不会中断旧文件的下载；离开页面前请完成下载。
        </small>
      </div>
      <a
        className="primary"
        href={file.url}
        download={file.name}
        onClick={(e) => e.stopPropagation()}
      >
        下载 Word 文档
      </a>
    </div>
  );
}
