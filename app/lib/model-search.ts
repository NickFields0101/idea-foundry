export interface SearchableLlmModel {
  id: string;
  name: string;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function searchLlmModels(
  models: SearchableLlmModel[],
  query: string,
  providerTerms: string[] = [],
) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return models;
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const providerText = normalizeSearchText(providerTerms.join(" "));

  return models
    .map((model, index) => {
      const name = normalizeSearchText(model.name);
      const id = normalizeSearchText(model.id);
      const searchable = `${name} ${id} ${providerText}`;
      if (!tokens.every((token) => searchable.includes(token))) return null;

      let rank = 4;
      if (name === normalizedQuery) rank = 0;
      else if (name.startsWith(normalizedQuery)) rank = 1;
      else if (id === normalizedQuery) rank = 2;
      else if (id.startsWith(normalizedQuery)) rank = 3;
      return { model, index, rank };
    })
    .filter((entry): entry is { model: SearchableLlmModel; index: number; rank: number } => entry !== null)
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((entry) => entry.model);
}
