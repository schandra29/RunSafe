export interface AgentVote {
  vote?: 'APPROVED' | 'REJECTED';
  note?: string;
}

export async function callAgentReview(
  name: string,
  epicContent: string
): Promise<AgentVote> {
  // Placeholder implementation that will be mocked in tests
  return { vote: 'APPROVED', note: '' };
}
