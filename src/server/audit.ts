import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';

export interface AuditInput {
  userId?: number | null;
  userName: string;
  userRole: string;
  action: string;
  module: string;
  entityType?: string;
  entityId?: string | number;
  details?: string;
  ipAddress?: string;
}

export async function recordAuditLog(input: AuditInput) {
  try {
    await db.insert(auditLogs).values({
      userId: input.userId ?? null,
      userName: input.userName,
      userRole: input.userRole,
      action: input.action,
      module: input.module,
      entityType: input.entityType ?? null,
      entityId: input.entityId !== undefined ? String(input.entityId) : null,
      details: input.details ?? null,
      ipAddress: input.ipAddress ?? null,
    });
  } catch (error) {
    console.error('Audit log insert failed:', error);
  }
}
