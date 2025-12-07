// Defines the roles a user can have within the application.
export enum UserRole {
  Customer = 'Customer',
  Employee = 'Employee',
  Admin = 'Admin',
}

// Represents the structure of a user object.
export interface User {
  email: string;
  role: UserRole;
  balance: number;
  cardFrozen: boolean;
  alertThreshold: number | null;
  isBanned: boolean;
}

// Defines the possible statuses of a transaction.
export type TransactionStatus = 'approved' | 'fraudulent' | 'in_review';

// Represents a note left by an analyst on a transaction.
export interface AnalystNote {
  timestamp: string;
  analyst: string;
  note: string;
}

// Represents the structure of a transaction object.
export interface Transaction {
  id: string;
  userEmail: string;
  amount: number;
  merchant: string;
  location: string;
  status: TransactionStatus;
  reason: string;
  timestamp: string;
  analystNotes?: AnalystNote[];
}

// Represents an entry in the audit log for admin/employee actions.
export interface AuditLog {
  id: string;
  timestamp: string;
  actor: string; // User email who performed the action
  action: string; // e.g., "USER_ROLE_CHANGED", "TRANSACTION_STATUS_UPDATED"
  details: string; // e.g., "Changed user test@example.com role from Customer to Employee"
}

// Represents a configurable rule for the fraud detection engine.
export type FraudRuleType = 'amount' | 'merchantKeyword';

export interface FraudRule {
  id: string;
  type: FraudRuleType;
  description: string;
  // For 'amount' type
  threshold?: number;
  // For 'merchantKeyword' type
  keyword?: string;
  // The status to assign if the rule is met
  result: 'fraudulent' | 'in_review';
}