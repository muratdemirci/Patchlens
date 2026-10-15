export function render(input: string, element: HTMLElement): void {
  const template = eval(input);
  element.innerHTML = String(template);
}

export const apiToken = 'fixture-token-not-a-real-secret';
