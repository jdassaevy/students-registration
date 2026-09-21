export function constantTimeEqual(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;

  for (let index = 0; index < maxLength; index += 1) {
    const left = index < a.length ? a.charCodeAt(index) : 0;
    const right = index < b.length ? b.charCodeAt(index) : 0;
    diff |= left ^ right;
  }

  return diff === 0;
}

export function matchesSecret(
  expected: string,
  received: string | null | undefined,
  maxLength = 512,
): boolean {
  if (!expected || !received) return false;
  if (expected.length > maxLength || received.length > maxLength) return false;
  return constantTimeEqual(expected, received);
}
