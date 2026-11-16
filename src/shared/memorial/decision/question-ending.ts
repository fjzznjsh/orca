/** A question only counts when the final non-empty line itself ends in a question mark. */
export function endsWithQuestion(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
  const last = lines.at(-1)
  if (!last) {
    return false
  }
  return last.endsWith('?') || last.endsWith('？')
}

export function lastNonEmptyLine(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
  return lines.at(-1) ?? ''
}
