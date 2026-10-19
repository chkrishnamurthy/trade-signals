/** What the admin event-log viewer and its API exchange. */
export type EventCategoryDto = 'auth' | 'account' | 'admin' | 'worker' | 'provider';

export interface EventLogEntryDto {
  id: number;
  at: string;
  category: string;
  actorType: string;
  event: string;
  userId: number | null;
  ipAddress: string | null;
  /** Redacted by the writer. Shown as JSON; never expected to hold a secret. */
  detail: unknown;
}

export interface EventLogPageDto {
  entries: EventLogEntryDto[];
  /** Pass as `beforeId` to fetch the next, older page; null on the last page. */
  nextBeforeId: number | null;
  eventNames: string[];
}
