// middleware/security.js - Universal security middleware for all endpoints

import { getSession } from "next-auth/react";
import User from "@/models/User";
import db from "@/utils/db";
import { auditLogger } from "@/utils/auditLogger";

export class SecurityMiddleware {

    // [BROKEN ACCESS CONTROL FIX] - Universal admin verification
    static async validateAdminAccess(req, res, options = {}) {
        const { requireSuperAdmin = false } = options;

        try {
            const session = await getSession({ req });
            if (!session || !session.user) {
                return { isValid: false, error: { status: 401, message: "Authentication required" }};
            }

            await db.connect();
            const user = await User.findById(session.user._id);

            if (!user) {
                await db.disconnect();
                return { isValid: false, error: { status: 401, message: "Invalid user session" }};
            }

            if (!user.isAdmin) {
                await db.disconnect();
                auditLogger.logUnauthorizedAccess('non_admin_access_attempt', {
                    userId: user._id,
                    endpoint: req.url
                });
                return { isValid: false, error: { status: 403, message: "Admin privileges required" }};
            }

            if (requireSuperAdmin && !user.isSuperAdmin) {
                await db.disconnect();
                auditLogger.logUnauthorizedAccess('non_super_admin_access_attempt', {
                    userId: user._id,
                    endpoint: req.url
                });
                return { isValid: false, error: { status: 403, message: "Super admin privileges required" }};
            }

            await db.disconnect();
            return { isValid: true, user };

        } catch (error) {
            await db.disconnect();
            auditLogger.logError('admin_validation_error', { error: error.message });
            return { isValid: false, error: { status: 500, message: "Access validation failed" }};
        }
    }

    // [PARAMETER TAMPERING FIX] - Universal parameter validation
    static validateParameters(req, validationRules) {
        const errors = [];

        for (const [field, rules] of Object.entries(validationRules)) {
            const value = req.body[field] || req.query[field];

            if (rules.required && (!value && value !== 0)) {
                errors.push(`${field} is required`);
                continue;
            }

            if (value !== undefined && value !== null) {
                if (rules.type && typeof value !== rules.type) {
                    errors.push(`${field} must be of type ${rules.type}`);
                }

                if (rules.minLength && value.length < rules.minLength) {
                    errors.push(`${field} must be at least ${rules.minLength} characters`);
                }

                if (rules.maxLength && value.length > rules.maxLength) {
                    errors.push(`${field} must be at most ${rules.maxLength} characters`);
                }

                if (rules.min !== undefined && parseFloat(value) < rules.min) {
                    errors.push(`${field} must be at least ${rules.min}`);
                }

                if (rules.max !== undefined && parseFloat(value) > rules.max) {
                    errors.push(`${field} must be at most ${rules.max}`);
                }

                if (rules.validate && !rules.validate(value)) {
                    errors.push(rules.message || `${field} is invalid`);
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    // [IDOR FIX] - Universal ownership validation
    static async validateOwnership(req, res, resourceModel, options = {}) {
        const { allowAdminAccess = true, foreignKey = 'user' } = options;

        try {
            const session = await getSession({ req });
            if (!session || !session.user) {
                return { isValid: false, error: { status: 401, message: "Authentication required" }};
            }

            await db.connect();
            const user = await User.findById(session.user._id);

            if (!user) {
                await db.disconnect();
                return { isValid: false, error: { status: 401, message: "Invalid user session" }};
            }

            if (allowAdminAccess && user.isAdmin) {
                await db.disconnect();
                return { isValid: true, user, isAdminAccess: true };
            }

            const resource = await resourceModel.findOne({
                _id: req.query.id,
                [foreignKey]: session.user._id
            });

            if (!resource) {
                await db.disconnect();
                auditLogger.logUnauthorizedAccess('resource_access_violation', {
                    userId: session.user._id,
                    resourceId: req.query.id,
                    resourceModel: resourceModel.modelName
                });
                return { isValid: false, error: { status: 404, message: "Resource not found or access denied" }};
            }

            await db.disconnect();
            return { isValid: true, user, resource };

        } catch (error) {
            await db.disconnect();
            auditLogger.logError('ownership_validation_error', { error: error.message });
            return { isValid: false, error: { status: 500, message: "Access validation failed" }};
        }
    }

    // [PARAMETER TAMPERING FIX] - ObjectId validation
    static validateObjectId(id) {
        return /^[0-9a-fA-F]{24}$/.test(id);
    }
}