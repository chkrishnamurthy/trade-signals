import { describe, expect, it } from 'vitest';
import { categoryForEvent } from './event-log.js';

describe('categoryForEvent', () => {
  it('files existing audit events under the plan’s categories', () => {
    for (const event of ['login_success', 'login_failure', 'signup', 'mfa_success']) {
      expect(categoryForEvent(event)).toBe('auth');
    }
    for (const event of ['password_changed', 'email_changed', 'account_deleted', 'mfa_enabled']) {
      expect(categoryForEvent(event)).toBe('account');
    }
    for (const event of ['role_changed', 'admin_disable_user', 'admin_enable_user']) {
      expect(categoryForEvent(event)).toBe('admin');
    }
  });
  it('falls back to auth for an event it has not seen', () => {
    expect(categoryForEvent('something_new')).toBe('auth');
  });
});
