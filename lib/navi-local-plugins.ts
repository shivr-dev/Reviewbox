import { z } from 'zod';
import { currentNamespace } from './store';
import { naviUIAction, registerNaviUI, type NaviUIAction, type NaviUIController, type WorkspaceLayout } from './navi-ui';

const pluginSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(64),
  scope: z.string().min(1).max(700),
  enabled: z.boolean(),
  actions: z.array(naviUIAction).min(1).max(12),
}).strict();
export type NaviLocalPlugin = z.infer<typeof pluginSchema>;
const panelNames = ['question', 'diagram', 'notes', 'source', 'knowledge', 'content', 'material'];
const active = new WeakMap<NaviUIController, { id: string; before: WorkspaceLayout; after: WorkspaceLayout }>();
const key = () => 'reviewbox:navi:plugins:v1:' + currentNamespace();

export function isReusableNaviRecipe(actions: NaviUIAction[]) {
  return actions.length > 0 && actions.every(action => {
    switch (action.type) {
      case 'setFontSize': case 'setFocusMode': case 'setZoom': case 'setGrid':
      case 'setFilter': case 'setSort': case 'toggleSourcePanel':
        return true;
      case 'setLayout':
        return ['default', 'focus', 'board'].includes(action.mode);
      case 'arrangeComponents':
        return action.panels.every(panel => panelNames.includes(panel));
      case 'resizePanel': case 'resizeComponent': case 'collapsePanel': case 'expandPanel':
        return panelNames.includes(action.panel);
      case 'mountRegisteredComponent': case 'removeRegisteredComponent':
        return panelNames.includes(action.component);
      default:
        return false;
    }
  });
}

export function listNaviLocalPlugins(): NaviLocalPlugin[] {
  try {
    const raw = localStorage.getItem(key());
    if (!raw || raw.length > 500_000) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 60).flatMap(input => {
      const entry = pluginSchema.safeParse(input);
      return entry.success && isReusableNaviRecipe(entry.data.actions) ? [entry.data] : [];
    });
  } catch {
    return [];
  }
}

function writePlugins(plugins: NaviLocalPlugin[]) {
  localStorage.setItem(key(), JSON.stringify(plugins));
}

function run(controller: NaviUIController, plugin: NaviLocalPlugin) {
  if (controller.capabilities.protected || controller.localPluginScope !== plugin.scope) return false;
  if (active.get(controller)?.id === plugin.id) return true;
  const before = controller.snapshot();
  if (!controller.execute(plugin.actions).ok) return false;
  active.set(controller, { id: plugin.id, before, after: controller.snapshot() });
  return true;
}

function revert(controller: NaviUIController, id: string) {
  const installed = active.get(controller);
  if (installed?.id !== id) return;
  if (controller.snapshot() === installed.after && controller.history.at(-1) === installed.before)
    controller.execute([{ type: 'restoreLayout', target: 'undo' }]);
  active.delete(controller);
}

export function registerNaviPluginSurface(controller: NaviUIController, scope: string, priority = 10) {
  controller.localPluginScope = scope;
  const unregister = registerNaviUI(controller, priority);
  const plugin = listNaviLocalPlugins().find(item => item.scope === scope && item.enabled);
  if (plugin) run(controller, plugin);
  return unregister;
}

/** Record a recipe only after the user confirmed and the live controller applied it. */
export function saveNaviLocalPlugin(controller: NaviUIController, name: string, actions: NaviUIAction[], before: WorkspaceLayout) {
  if (controller.capabilities.protected || !isReusableNaviRecipe(actions)) return false;
  const result = pluginSchema.safeParse({
    id: crypto.randomUUID(), name, actions, scope: controller.localPluginScope, enabled: true,
  });
  if (!result.success) return false;
  const plugin = result.data;
  const existing = listNaviLocalPlugins();
  if (existing.length >= 60) return false;
  writePlugins([plugin, ...existing.map(item => item.scope === plugin.scope ? { ...item, enabled: false } : item)]);
  active.set(controller, { id: plugin.id, before, after: controller.snapshot() });
  return true;
}

export function changeNaviLocalPlugin(id: string, operation: 'enable' | 'disable' | 'remove', controller?: NaviUIController) {
  const all = listNaviLocalPlugins();
  const plugin = all.find(item => item.id === id);
  if (!plugin) return false;
  const onScope = controller?.localPluginScope === plugin.scope && !controller?.capabilities.protected;
  const previous = all.find(item => item.enabled && item.scope === plugin.scope);
  if (operation === 'enable' && onScope && controller) {
    if (previous && previous.id !== id) revert(controller, previous.id);
    if (!run(controller, plugin)) {
      if (previous && previous.id !== id) run(controller, previous);
      return false;
    }
  }
  try {
    writePlugins(operation === 'remove' ? all.filter(item => item.id !== id) : all.map(item => {
      if (item.id === id) return { ...item, enabled: operation === 'enable' };
      return operation === 'enable' && item.scope === plugin.scope ? { ...item, enabled: false } : item;
    }));
  } catch (error) {
    if (operation === 'enable' && onScope && controller && previous?.id !== id) {
      revert(controller, id);
      if (previous) run(controller, previous);
    }
    throw error;
  }
  if (operation !== 'enable' && onScope && controller) revert(controller, id);
  return true;
}

export function disableActiveNaviPlugin(controller: NaviUIController) {
  const installed = active.get(controller);
  if (!installed || controller.snapshot() !== installed.after || controller.history.at(-1) !== installed.before) return false;
  return changeNaviLocalPlugin(installed.id, 'disable', controller);
}
