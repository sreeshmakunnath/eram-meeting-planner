// Pure helpers about a client's business unit, safe to import in client components.
/**
 * The unit a client quick-added on the meeting form goes in: the person's primary unit if the meeting is for it
 * (or names no unit of theirs), else the first of the meeting's units they're in.
 */
export const quickAddUnit = (primaryBu: number, meetingBuIds: number[]) => (!meetingBuIds.length || meetingBuIds.includes(primaryBu) ? primaryBu : meetingBuIds[0]);
