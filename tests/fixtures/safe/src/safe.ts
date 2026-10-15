export function render(input: string, element: HTMLElement): void {
  element.textContent = input;
}

export function parseCount(input: string): number | undefined {
  const count = Number.parseInt(input, 10);
  return Number.isFinite(count) && count >= 0 ? count : undefined;
}
