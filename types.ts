// Defines the roles a user can have within the application.
export enum UserRole {
  Customer = 'Customer',
  Employee = 'Employee',
  Admin = 'Admin',
}

export interface User {
  username: string;      // Cognito username (unique identifier, e.g., "johndoe" or UUID)
  email: string;         // User's email address (e.g., "john@example.com")
  fullName?: string;     // ✅ Single full name field from Cognito's "name" attribute
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
  analyst: string;  // Now can be username instead of email
  note: string;
}

// Represents the structure of a transaction object.
export interface Transaction {
  id: string;
  username: string;  // Changed from userEmail to username
  userEmail: string; // Keep email for backwards compatibility if needed
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
  actor: string; // Can be username or email depending on context
  action: string;
  details: string;
}

// Represents a configurable rule for the fraud detection engine.
export type FraudRuleType = 'amount' | 'merchantKeyword';

export interface FraudRule {
  id: string;
  type: FraudRuleType;
  description: string;
  threshold?: number;
  keyword?: string;
  result: 'fraudulent' | 'in_review';
}