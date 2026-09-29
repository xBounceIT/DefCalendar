function hasSelectedTextWithin(element: Node): boolean {
  const selection = globalThis.getSelection();
  if (!selection?.toString()) {
    return false;
  }
  for (let index = 0; index < selection.rangeCount; index += 1) {
    if (selection.getRangeAt(index).intersectsNode(element)) {
      return true;
    }
  }
  return false;
}

export default hasSelectedTextWithin;
