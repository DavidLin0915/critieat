(function (CE) {
  'use strict';
  // 同事名單（「你是誰？」用）。正式版讀 Supabase members 表（依 sort 排序），示範模式用開團單的示範名單。
  let names = [];
  let failed = false;

  async function ready() {
    if (CE.isDemo()) return true;
    try {
      names = (await CE.supa.select('members', 'select=name&order=sort')).map(m => m.name);
      failed = false;
      return true;
    } catch (e) {
      failed = true;
      return false;
    }
  }

  const list = () => (CE.isDemo() ? CE.lunchStore.peekMembers() : names.slice());

  CE.memberRepo = { ready, list, loadFailed: () => failed };
})(globalThis.CE = globalThis.CE || {});
