/** Names of the signed-in person's knowledge-hub items, so [kn:...] citations can show the file name. Filled by the Live screen. */
export const knowledgeNames: Record<string, string> = {};

export function rememberKnowledge(items: { id: string; name: string }[]) {
  for (const i of items) knowledgeNames[i.id] = i.name;
}
