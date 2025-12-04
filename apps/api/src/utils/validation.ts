/**
 * Validation Schemas and Utilities
 * 
 * Centralized Zod schemas for request validation.
 */

import { z } from 'zod';

// ============================================
// Common Schemas
// ============================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const solanaAddressSchema = z
  .string()
  .min(32)
  .max(44)
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid Solana address format');

export const lamportsSchema = z
  .string()
  .regex(/^\d+$/, 'Must be a valid integer string')
  .transform(val => BigInt(val))
  .refine(val => val > 0, 'Must be greater than 0');

// ============================================
// Auth Schemas
// ============================================

export const devLoginSchema = z.object({
  email: z.string().email().optional(),
});

// ============================================
// Agent Schemas
// ============================================

export const createAgentSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  walletAddress: solanaAddressSchema,
  capabilities: z.array(z.string().min(1).max(50)).min(1, 'At least one capability required').max(20),
});

export const updateAgentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  capabilities: z.array(z.string().min(1).max(50)).max(20).optional(),
  isActive: z.boolean().optional(),
});

export const agentFiltersSchema = z.object({
  isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  search: z.string().max(100).optional(),
  capability: z.string().max(50).optional(),
});

// ============================================
// Task Schemas
// ============================================

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(5000),
  paymentTokenSymbol: z.string().min(1).max(10).default('SOL'),
  budgetLamports: lamportsSchema,
  deadline: z.string().datetime().optional().transform(val => val ? new Date(val) : undefined),
  requiredCapabilities: z.array(z.string().min(1).max(50)).max(10).default([]),
});

export const taskFiltersSchema = z.object({
  status: z.enum(['OPEN', 'IN_AUCTION', 'ASSIGNED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
  search: z.string().max(100).optional(),
});

// ============================================
// Offer Schemas
// ============================================

export const createOfferSchema = z.object({
  agentId: z.string().min(1, 'Agent ID is required'),
  priceLamports: lamportsSchema,
  etaSeconds: z.number().int().positive().max(86400, 'ETA cannot exceed 24 hours'),
});

// ============================================
// Execution Schemas
// ============================================

export const completeExecutionSchema = z.object({
  success: z.boolean(),
  signedResultPayload: z.string().max(100000).optional(),
  resultSummary: z.string().max(1000).optional(),
  proofHash: z.string().max(100).optional(),
  errorMessage: z.string().max(1000).optional(),
}).refine(
  data => {
    // If failure, errorMessage should be provided
    if (!data.success && !data.errorMessage) {
      return false;
    }
    return true;
  },
  { message: 'errorMessage is required when success is false' }
);

// ============================================
// Error Response Helpers
// ============================================

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export function formatZodError(error: z.ZodError): ApiError {
  const firstError = error.errors[0];
  return {
    code: 'VALIDATION_ERROR',
    message: firstError?.message || 'Validation failed',
    details: error.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message,
    })),
  };
}

export function createErrorResponse(code: string, message: string, details?: unknown): { error: ApiError } {
  return {
    error: {
      code,
      message,
      ...(details && { details }),
    },
  };
}

export function createSuccessResponse<T>(data: T): { data: T } {
  return { data };
}

// ============================================
// Type Exports
// ============================================

export type CreateAgentInput = z.infer<typeof createAgentSchema>;
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type CreateOfferInput = z.infer<typeof createOfferSchema>;
export type CompleteExecutionInput = z.infer<typeof completeExecutionSchema>;






