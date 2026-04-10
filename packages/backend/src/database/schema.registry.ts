import { Database } from 'sqlite3';
import * as schemaSql from './schema';
import * as settingsRepository from '../settings/settings.repository'; 

/**
 * Interface describing a database table definition for initialization.
 */
export interface TableDefinition {
    name: string;
    sql: string;
    init?: (db: Database) => Promise<void>; 
}
// --- Table Definitions Registry ---

/**
 * Array containing definitions for all tables to be created and initialized.
 * The order might matter if there are strict foreign key dependencies without ON DELETE/UPDATE clauses,
 * but CREATE IF NOT EXISTS makes it generally safe. Initialization order might also matter.
 */
export const tableDefinitions: TableDefinition[] = [
    // Core settings and logs first
    {
        name: 'settings',
        sql: schemaSql.createSettingsTableSQL,
        init: settingsRepository.ensureDefaultSettingsExist // <-- Use the function from the repository
    },
    { name: 'audit_logs', sql: schemaSql.createAuditLogsTableSQL },
    // { name: 'api_keys', sql: schemaSql.createApiKeysTableSQL }, // Removed API Keys table from registry
    // { name: 'passkeys', sql: schemaSql.createPasskeysTableSQL }, // Removed Passkeys table from registry
    { name: 'notification_settings', sql: schemaSql.createNotificationSettingsTableSQL },
    { name: 'users', sql: schemaSql.createUsersTableSQL },

    // Features like proxies, connections, tags
    { name: 'proxies', sql: schemaSql.createProxiesTableSQL },
    { name: 'ssh_keys', sql: schemaSql.createSshKeysTableSQL }, // Added SSH Keys table
    { name: 'connections', sql: schemaSql.createConnectionsTableSQL }, // Depends on proxies, ssh_keys
    { name: 'tags', sql: schemaSql.createTagsTableSQL },
    { name: 'connection_tags', sql: schemaSql.createConnectionTagsTableSQL }, // Depends on connections, tags

    // Other utilities
    { name: 'ip_blacklist', sql: schemaSql.createIpBlacklistTableSQL },
    { name: 'command_history', sql: schemaSql.createCommandHistoryTableSQL },
    { name: 'path_history', sql: schemaSql.createPathHistoryTableSQL },
    { name: 'quick_commands', sql: schemaSql.createQuickCommandsTableSQL },
    { name: 'favorite_paths', sql: schemaSql.createFavoritePathsTableSQL }, // Added Favorite Paths table
];
