import { buildOrderedProviderList, createSettingsProviderOrderControls } from "./providerOrder.mjs";

const providerListEvents = ["addon:registered", "addon:unregistered", "provider:order:changed", "provider:enabled:changed"];

export function useSettingsProviderList({ react, readManager, schedule, cancel, onReady, observeSettings }) {
  const { useState, useEffect } = react;
  const [{ providers, providerOrder, enabledProviders }, setProviderList] = useState({
    providers: [], providerOrder: [], enabledProviders: {},
  });
  const [expandedProviders, setExpandedProviders] = useState(new Set());
  const [dragState, setDragState] = useState({ sourceId: null, targetId: null, position: "before" });

  useEffect(() => {
    let disposed = false;
    let retryTimer = null;
    const subscriptions = [];
    const loadProviders = () => {
      if (disposed) return;
      const manager = readManager();
      if (!manager) {
        retryTimer = schedule(loadProviders, 100);
        return;
      }

      const syncList = () => {
        if (disposed || readManager() !== manager) return;
        const availableProviders = manager.getAddons();
        setProviderList({
          providers: availableProviders,
          providerOrder: manager.getProviderOrder(),
          enabledProviders: Object.fromEntries(availableProviders.map(provider => [
            provider.id, manager.isProviderEnabled(provider.id),
          ])),
        });
      };
      for (const event of [...providerListEvents, ...(observeSettings || [])]) {
        subscriptions.push(manager.on?.(event, syncList));
      }
      syncList();
      subscriptions.push(onReady?.(manager, () => !disposed));
    };
    loadProviders();
    return () => {
      disposed = true;
      if (retryTimer !== null) cancel(retryTimer);
      for (const unsubscribe of subscriptions) {
        if (typeof unsubscribe === "function") unsubscribe();
      }
    };
    // The tab owns its subscriptions until unmount. Actions read the current manager.
  }, []);

  const handleToggleEnabled = (providerId, enabled) => {
    const manager = readManager();
    if (!manager) return;
    manager.setProviderEnabled(providerId, enabled);
    setProviderList(current => current.enabledProviders[providerId] === enabled ? current : {
      ...current, enabledProviders: { ...current.enabledProviders, [providerId]: enabled },
    });
  };

  const setProviderOrder = order => setProviderList(current => ({ ...current, providerOrder: order }));

  const toggleExpanded = (providerId) => setExpandedProviders(current => {
    const next = new Set(current);
    if (next.has(providerId)) next.delete(providerId);
    else next.add(providerId);
    return next;
  });

  return {
    providers,
    sortedProviders: buildOrderedProviderList(providers, providerOrder),
    enabledProviders,
    expandedProviders,
    setExpandedProviders,
    dragState,
    handleToggleEnabled,
    toggleExpanded,
    ...createSettingsProviderOrderControls({ readManager, setProviderOrder, dragState, setDragState }),
  };
}
