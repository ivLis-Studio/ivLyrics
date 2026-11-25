// Provider ordering independent of the settings widgets and storage.

function buildOrderedProviderList(providers, providerOrder) {
  const safeProviders = Array.isArray(providers) ? providers : [];
  const safeProviderOrder = Array.isArray(providerOrder) ? providerOrder : [];
  const providersById = new Map(safeProviders.map((provider) => [provider.id, provider]));
  const orderedIds = new Set(safeProviderOrder);
  const sortedProviders = [];

  safeProviderOrder.forEach((id) => {
    const provider = providersById.get(id);
    if (provider) {
      sortedProviders.push(provider);
    }
  });

  safeProviders.forEach((provider) => {
    if (!orderedIds.has(provider.id)) {
      sortedProviders.push(provider);
    }
  });

  return sortedProviders;
}

function reorderProviderList(providers, providerOrder, sourceId, targetId, position = "before") {
  const orderedIds = buildOrderedProviderList(providers, providerOrder).map((provider) => provider.id);
  if (!sourceId || !targetId || sourceId === targetId) return orderedIds;

  const sourceIndex = orderedIds.indexOf(sourceId);
  const targetIndex = orderedIds.indexOf(targetId);
  if (sourceIndex === -1 || targetIndex === -1) return orderedIds;
  const insertionIndex = targetIndex - (sourceIndex < targetIndex ? 1 : 0) + (position === "after" ? 1 : 0);
  orderedIds.splice(sourceIndex, 1);
  orderedIds.splice(insertionIndex, 0, sourceId);
  return orderedIds;
}

export {
    buildOrderedProviderList,
    reorderProviderList,
};

// Both provider tabs keep the same reorder gestures and persistence contract.
export const createSettingsProviderOrderControls = ({
  readManager, setProviderOrder, dragState, setDragState
}) => {
  const moveProvider = (providerId, direction) => {
    const manager = readManager();
    if (!manager) return;
    const currentOrder = buildOrderedProviderList(manager.getAddons(), manager.getProviderOrder()).map(provider => provider.id);
    const currentIndex = currentOrder.indexOf(providerId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= currentOrder.length) return;

    const newOrder = [...currentOrder];
    [newOrder[currentIndex], newOrder[newIndex]] = [newOrder[newIndex], newOrder[currentIndex]];

    manager.setProviderOrder(newOrder);
    setProviderOrder(newOrder);
  };

  const handleDragStart = (event, providerId) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", providerId);
    setDragState({ sourceId: providerId, targetId: null, position: "before" });
  };

  const handleDragOver = (event, targetId) => {
    if (!dragState.sourceId || dragState.sourceId === targetId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    if (dragState.targetId !== targetId || dragState.position !== position) {
      setDragState((current) => ({ ...current, targetId, position }));
    }
  };

  const handleDrop = (event, targetId) => {
    event.preventDefault();
    const sourceId = dragState.sourceId || event.dataTransfer.getData("text/plain");
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    const manager = readManager();
    if (manager) {
      const availableProviders = manager.getAddons();
      const order = manager.getProviderOrder();
      const newOrder = reorderProviderList(availableProviders, order, sourceId, targetId, position);
      const currentOrder = buildOrderedProviderList(availableProviders, order).map(provider => provider.id);
      if (newOrder.some((id, index) => id !== currentOrder[index])) {
        manager.setProviderOrder(newOrder);
        setProviderOrder(newOrder);
      }
    }
    setDragState({ sourceId: null, targetId: null, position: "before" });
  };

  const clearDragState = () => {
    setDragState({ sourceId: null, targetId: null, position: "before" });
  };

  return { moveProvider, handleDragStart, handleDragOver, handleDrop, clearDragState };
};
