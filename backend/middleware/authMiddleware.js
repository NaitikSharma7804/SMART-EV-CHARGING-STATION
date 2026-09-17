// backend/middleware/authMiddleware.js

import jwt from "jsonwebtoken";

/*
=========================================================
AUTHENTICATION MIDDLEWARE
=========================================================

Checks:

Authorization: Bearer <JWT>

After successful verification:

req.user = decoded JWT payload
=========================================================
*/

const authenticate = (req, res, next) => {
    try {
        // Get Authorization header
        const authHeader = req.headers.authorization;

        // Check Bearer token
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Authentication required. Please login."
            });
        }

        // Extract token
        const token = authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication token."
            });
        }

        // Get JWT secret
        const secret = process.env.JWT_SECRET;

        if (!secret) {
            console.error("❌ JWT_SECRET is not configured in .env");

            return res.status(500).json({
                success: false,
                message: "Server authentication configuration error."
            });
        }

        // Verify token
        const decoded = jwt.verify(token, secret);

        // Store decoded user information
        req.user = decoded;

        console.log("✅ Authenticated user:", req.user);

        next();

    } catch (error) {

        console.error(
            "❌ Authentication Error:",
            error.message
        );

        // Token expired
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                success: false,
                message: "Your session has expired. Please login again."
            });
        }

        // Invalid token
        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication token."
            });
        }

        // Other authentication errors
        return res.status(401).json({
            success: false,
            message: "Authentication failed."
        });
    }
};


/*
=========================================================
AUTHORIZATION MIDDLEWARE
=========================================================

Usage:

authorize(["ADMIN"])

or:

authorize(["USER", "ADMIN"])

This checks the role stored inside the JWT.

The project currently uses ADMIN in adminRoutes.js.
The database schema uses lowercase "admin", so this
middleware handles both "ADMIN" and "admin".
=========================================================
*/

const authorize = (allowedRoles = []) => {

    return (req, res, next) => {

        try {

            // User must already be authenticated
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: "Authentication required."
                });
            }

            // Get role from JWT
            const userRole =
                req.user.role ||
                req.user.userRole ||
                req.user.user_type;

            if (!userRole) {
                return res.status(403).json({
                    success: false,
                    message: "User role not found."
                });
            }

            // Normalize roles
            const normalizedUserRole =
                String(userRole).toUpperCase();

            const normalizedAllowedRoles =
                allowedRoles.map(role =>
                    String(role).toUpperCase()
                );

            // Check authorization
            if (
                !normalizedAllowedRoles.includes(
                    normalizedUserRole
                )
            ) {

                console.warn(
                    `❌ Access denied. User role: ${normalizedUserRole}, Required: ${normalizedAllowedRoles.join(", ")}`
                );

                return res.status(403).json({
                    success: false,
                    message: "Access denied. Administrator privileges required."
                });
            }

            console.log(
                `✅ Authorization successful: ${normalizedUserRole}`
            );

            next();

        } catch (error) {

            console.error(
                "❌ Authorization Error:",
                error.message
            );

            return res.status(403).json({
                success: false,
                message: "Authorization failed."
            });
        }
    };
};


/*
=========================================================
EXPORTS
=========================================================
*/

// Default export
// Used by stationRoutes.js:
//
// import authenticate from
// '../middleware/authMiddleware.js';

export default authenticate;


// Named exports
// Used by adminRoutes.js:
//
// import { authenticate, authorize }
// from '../middleware/authMiddleware.js';

export {
    authenticate,
    authorize
};