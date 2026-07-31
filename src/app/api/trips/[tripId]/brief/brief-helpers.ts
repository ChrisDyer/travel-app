export type BriefResponse = {
  content: string | null;
  updatedAt: string | null;
  updatedBy: 'you' | 'assistant' | null;
  hasUndo: boolean;
};

export type BriefRow = {
  planning_notes: string | null;
  planning_notes_previous: string | null;
  planning_notes_updated_at: string | null;
  planning_notes_updated_by: 'you' | 'assistant' | null;
};

export function toBriefResponse(row: BriefRow): BriefResponse {
  return {
    content: row.planning_notes,
    updatedAt: row.planning_notes_updated_at,
    updatedBy: row.planning_notes_updated_by,
    hasUndo: row.planning_notes_previous !== null,
  };
}

export function getBriefAuthor(request: Request): 'you' | 'assistant' {
  const token = process.env.INTERNAL_API_TOKEN;
  return token && request.headers.get('x-internal-token') === token ? 'assistant' : 'you';
}