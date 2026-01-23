import { FilterConfig } from '../types/message.types';
import { logger } from '../utils/logger';

/**
 * Service for filtering messages based on configuration
 * Supports allowlist, blocklist, group filtering, and broadcast filtering
 */
export class FilterService {
  constructor(private config: FilterConfig) {
    logger.info('FilterService initialized', {
      mode: config.mode,
      contactsCount: config.contacts.length,
      groupsFilter: config.groupsFilter,
      includeBroadcast: config.includeBroadcast,
    });
  }

  /**
   * Determine if a message should be saved based on filter configuration
   * @param from Sender phone number or group ID
   * @param isGroup Is this a group message?
   * @param isBroadcast Is this from a broadcast list?
   * @returns true if message should be saved, false otherwise
   */
  shouldSaveMessage(
    from: string,
    isGroup: boolean,
    isBroadcast: boolean
  ): boolean {
    // Check broadcast filter
    if (isBroadcast && !this.config.includeBroadcast) {
      logger.debug(`Filtered out broadcast message from ${from}`);
      return false;
    }

    // Check group filter
    if (this.config.groupsFilter === 'only' && !isGroup) {
      logger.debug(`Filtered out non-group message from ${from}`);
      return false;
    }
    if (this.config.groupsFilter === 'exclude' && isGroup) {
      logger.debug(`Filtered out group message from ${from}`);
      return false;
    }

    // Check contact filter
    if (this.config.mode === 'allowlist') {
      const allowed = this.config.contacts.includes(from);
      if (!allowed) {
        logger.debug(`Filtered out message from ${from} (not in allowlist)`);
      }
      return allowed;
    }

    if (this.config.mode === 'blocklist') {
      const blocked = this.config.contacts.includes(from);
      if (blocked) {
        logger.debug(`Filtered out message from ${from} (in blocklist)`);
      }
      return !blocked;
    }

    // Default: save all
    return true;
  }
}
