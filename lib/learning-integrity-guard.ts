const equipmentFields=new Set(['id','kind','version','at','action','itemId','slot','expectedVersion','bookId','tier','lockedAffixes','previewId','accept','buildId','name','sessionId']);
/** Game commands have no authority to write events, mastery, exams, GPA or scheduling constraints. */
export function assertEquipmentWrite(record:{kind:string;payload:Record<string,unknown>}){
  if(record.kind!=='job'||record.payload.kind!=='equipment-action'||Object.keys(record.payload).some(k=>!equipmentFields.has(k)))throw new Error('学习完整性保护：装备只能保存游戏操作记录');
}
