import { describe, it } from 'vitest';

describe('isInQuietHours', () => {
  it.todo('same-day window: returns true when now is inside window');
  it.todo('same-day window: returns false when now is outside window');
  it.todo('cross-midnight window (22:00-08:00): returns true at 23:30');
  it.todo('cross-midnight window (22:00-08:00): returns true at 07:00');
  it.todo('cross-midnight window (22:00-08:00): returns false at 09:00');
  it.todo('boundary: exactly at start time returns true');
  it.todo('boundary: exactly at end time returns false');
});

describe('nextQuietEnd', () => {
  it.todo('returns today end time when quiet has not ended yet today');
  it.todo('returns tomorrow end time when quiet already ended today');
});
