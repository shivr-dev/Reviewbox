import type { SemanticDiagram } from './diagram-spec';
/** Data parsing is distinct from scientific provenance and visual approval. */
export async function checkScientificEngine(
  spec: SemanticDiagram,
  signal?: AbortSignal,
) {
  if (spec.kind === 'chemistry') {
    const { validateChemicalDiagram } = await import('./chemical-engine');
    const result = await validateChemicalDiagram(spec);
    return `RDKit解析通过，${result.atomCount}个原子；仍需核对题意和画面`;
  }
  if (spec.kind === 'bioasset') {
    const { loadBioSvg } = await import('./bioicons');
    await loadBioSvg(spec.assetId);
    return '授权素材、文件哈希和SVG安全检查通过';
  }
  if (spec.kind === 'macromolecule') {
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 25000);
    try {
      const response = await fetch(
        'https://files.rcsb.org/download/' + spec.pdbId.toUpperCase() + '.cif',
        {
          signal: signal
            ? AbortSignal.any([abort.signal, signal])
            : abort.signal,
        },
      );
      if (!response.ok) throw Error('PDB结构无法下载，请核对条目或联网后重试');
      const reader = response.body?.getReader();
      if (!reader) throw Error('浏览器无法读取结构数据');
      let size = 0,
        text = '',
        decoder = new TextDecoder();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 8000000) {
          await reader.cancel();
          throw Error('结构文件超过8MB，请在专用查看器中处理');
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      const { CIF } = await import('molstar/lib/mol-io/reader/cif');
      const parsed = await CIF.parseText(text).run();
      if (parsed.isError) throw Error('Mol*不能解析此结构');
      const atoms = parsed.result.blocks[0]?.categories.atom_site;
      if (!atoms?.rowCount || atoms.rowCount > 200000)
        throw Error('结构缺少原子坐标或超过当前审核上限');
      for (const axis of ['Cartn_x', 'Cartn_y', 'Cartn_z']) {
        const field = atoms.getField(axis);
        if (!field) throw Error('结构缺少三维坐标');
        for (let i = 0; i < atoms.rowCount; i++)
          if (field.valueKind(i) !== 0 || !Number.isFinite(field.float(i)))
            throw Error('结构包含无效坐标');
      }
      return 'Mol*已解析PDB结构和三维坐标；仍需核对显示与来源';
    } finally {
      clearTimeout(timer);
    }
  }
  return '使用当前语义检查结果；仍需人工复核';
}
