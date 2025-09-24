// utils/auditLogger.js - Secure server-side logging without exposing data
import fs from 'fs';
import path from 'path';

class AuditLogger {
    constructor() {
        this.logDir = path.join(process.cwd(), 'logs');
        this.ensureLogDirectory();
    }

    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    writeLog(level, category, data) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            category,
            ...data
        };

        // Write to appropriate log file
        const filename = `${level}_${new Date().toISOString().split('T')[0]}.log`;
        const filepath = path.join(this.logDir, filename);

        try {
            fs.appendFileSync(filepath, JSON.stringify(logEntry) + '\n');
        } catch (error) {
            // Fallback to console in development only
            if (process.env.NODE_ENV === 'development') {
                console.error('Logging error:', error);
            }
        }
    }

    // [IDOR FIX] - Log unauthorized access attempts
    logUnauthorizedAccess(action, data) {
        this.writeLog('SECURITY', 'unauthorized_access', {
            action,
            ...data
        });
    }

    // [BROKEN ACCESS CONTROL FIX] - Log admin actions
    logAdminAction(action, data) {
        this.writeLog('ADMIN', 'admin_action', {
            action,
            ...data
        });
    }

    // [PARAMETER TAMPERING FIX] - Log user actions
    logUserAction(action, data) {
        this.writeLog('USER', 'user_action', {
            action,
            ...data
        });
    }

    // Security violations
    logSecurityViolation(type, data) {
        this.writeLog('CRITICAL', 'security_violation', {
            type,
            ...data
        });
    }

    // Error logging
    logError(category, data) {
        this.writeLog('ERROR', category, data);
    }
}

export const auditLogger = new AuditLogger();