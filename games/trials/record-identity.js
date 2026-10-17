/** Handling and immutable riding geometry isolate personal records. */
export const recordIdentity=(physics,course,bike)=>`${physics}:${course.contentHash}:${bike.id}`;
