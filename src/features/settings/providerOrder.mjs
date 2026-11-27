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

export { buildOrderedProviderList };

const readProviderIds = (manager) =>
  buildOrderedProviderList(manager.getAddons(), manager.getProviderOrder()).map((provider) => provider.id);

const getDropPosition = (event) => {
  const { top, height } = event.currentTarget.getBoundingClientRect();
  return event.clientY < top + height / 2 ? "before" : "after";
};

// Both provider tabs keep the same reorder gestures and persistence contract.
export const createSettingsProviderOrderControls = ({
  readManager, setProviderOrder, dragState, setDragState
}) => {
  const moveProvider = (providerId, direction) => {
    const manager = readManager();
    if (!manager) return;
    const currentOrder = readProviderIds(manager);
    const currentIndex = currentOrder.indexOf(providerId);
    if (currentIndex === -1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= currentOrder.length) return;

    [currentOrder[currentIndex], currentOrder[newIndex]] = [currentOrder[newIndex], currentOrder[currentIndex]];
    manager.setProviderOrder(currentOrder);
    setProviderOrder(currentOrder);
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
    const position = getDropPosition(event);
    if (dragState.targetId !== targetId || dragState.position !== position) {
      setDragState((current) => ({ ...current, targetId, position }));
    }
  };

  const clearDragState = () => {
    setDragState({ sourceId: null, targetId: null, position: "before" });
  };

  const handleDrop = (event, targetId) => {
    event.preventDefault();
    const sourceId = dragState.sourceId || event.dataTransfer.getData("text/plain");
    const position = getDropPosition(event);
    const manager = readManager();
    if (manager) {
      const currentOrder = readProviderIds(manager);
      const sourceIndex = currentOrder.indexOf(sourceId);
      const targetIndex = currentOrder.indexOf(targetId);
      if (sourceId && targetId && sourceIndex !== -1 && targetIndex !== -1 && sourceIndex !== targetIndex) {
        const insertionIndex = targetIndex - (sourceIndex < targetIndex ? 1 : 0) + (position === "after" ? 1 : 0);
        const newOrder = [...currentOrder];
        newOrder.splice(sourceIndex, 1);
        newOrder.splice(insertionIndex, 0, sourceId);
        if (newOrder.some((id, index) => id !== currentOrder[index])) {
          manager.setProviderOrder(newOrder);
          setProviderOrder(newOrder);
        }
      }
    }
    clearDragState();
  };

  return { moveProvider, handleDragStart, handleDragOver, handleDrop, clearDragState };
};
