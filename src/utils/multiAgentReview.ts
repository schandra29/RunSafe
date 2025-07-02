export enum CouncilVerdict {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export async function multiAgentReview(_: any): Promise<CouncilVerdict> {
  return CouncilVerdict.APPROVED;
}
