function isMacOS(): boolean {
  return /Mac/i.test(navigator.platform);
}

export { isMacOS };
