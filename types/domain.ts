export type UserRole = 'OPERATIONS_ADMIN' | 'FINANCE_APPROVER';

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  department: string;
  avatarInitials: string;
}

export type PolicyStatus = 'Draft' | 'Pending' | 'Active' | 'Cancelled' | 'Expired';

export interface CoverageItem {
  id: string;
  name: string;
  code: string;
  limit: number;
  deductible: number;
  basePremium: number;
}

export interface EndorsementRecord {
  id: string;
  endorsementNumber: string;
  policyId: string;
  effectiveDate: string;
  description: string;
  premiumDelta: number;
  status: 'Applied' | 'Pending Approval';
  createdBy: string;
  createdAt: string;
}

export interface Policy {
  id: string;
  policyNumber: string;
  customerName: string;
  customerIndustry: string;
  customerEin: string;
  customerAddress: string;
  brokerId: string;
  brokerName: string;
  lineOfBusiness: 'Commercial General Liability' | 'Cyber & Tech E&O' | 'Commercial Property' | 'Workers Compensation' | 'Directors & Officers';
  writtenPremium: number;
  earnedPremium: number;
  unearnedPremium: number;
  collectedPremium: number;
  taxesAndFees: number;
  effectiveDate: string;
  expirationDate: string;
  status: PolicyStatus;
  cancellationDate?: string;
  aggregateCoverageLimit: number;
  perOccurrenceLimit: number;
  deductible: number;
  coverages: CoverageItem[];
  endorsements: EndorsementRecord[];
  underwriter: string;
  updatedAt: string;
}

export type KybStatus = 'Pending' | 'Approved' | 'Failed';

export interface CommissionEntry {
  id: string;
  brokerId: string;
  policyId: string;
  policyNumber: string;
  customerName: string;
  premiumCollected: number;
  commissionRate: number;
  commissionAmount: number;
  status: 'Paid' | 'Accrued' | 'Held (KYB)';
  settledDate: string;
}

export interface Broker {
  id: string;
  code: string;
  agencyName: string;
  principalContact: string;
  email: string;
  phone: string;
  stateLicense: string;
  domicileState: string;
  kybStatus: KybStatus;
  personaInquiryId: string;
  commissionRate: number; // e.g. 0.125 for 12.5%
  collectedPremium: number;
  totalCommissionEarned: number;
  totalCommissionPaid: number;
  activePoliciesCount: number;
  joinedDate: string;
  commissions: CommissionEntry[];
}

export type PaymentStatus = 'Pending' | 'Succeeded' | 'Failed' | 'Refunded';

export interface Payment {
  id: string;
  stripePaymentIntentId: string;
  policyId: string;
  policyNumber: string;
  customerName: string;
  amount: number;
  currency: 'USD';
  status: PaymentStatus;
  paymentMethod: string;
  isSandbox: true;
  createdAt: string;
  refundedAmount?: number;
  refundedAt?: string;
  refundReason?: string;
  ledgerTransactionId: string;
}

export type ClaimStatus = 'Open' | 'Under Review' | 'Approved' | 'Settled' | 'Denied';
export type PayoutStatus = 'Unpaid' | 'Pending Approval' | 'Partially Paid' | 'Paid in Full' | 'Hold';

export interface ReserveAdjustment {
  id: string;
  claimId: string;
  previousReserve: number;
  newReserve: number;
  delta: number;
  reason: string;
  adjustedBy: string;
  timestamp: string;
  ledgerTransactionId: string;
}

export interface Claim {
  id: string;
  claimNumber: string;
  policyId: string;
  policyNumber: string;
  customerName: string;
  lineOfBusiness: string;
  lossDate: string;
  reportedDate: string;
  description: string;
  status: ClaimStatus;
  payoutStatus: PayoutStatus;
  policyCoverageLimit: number;
  policyDeductible: number;
  claimedAmount: number;
  paidAmount: number;
  outstandingReserve: number;
  adjusterName: string;
  reserveHistory: ReserveAdjustment[];
}

export interface LedgerEntryLine {
  id: string;
  transactionId: string;
  entryDate: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  currency: 'USD';
  referenceType: 'POLICY' | 'PAYMENT' | 'CLAIM_RESERVE' | 'ENDORSEMENT' | 'REVERSAL';
  referenceId: string;
  memo: string;
}

export interface LedgerTransaction {
  id: string;
  journalNumber: string;
  timestamp: string;
  reference: string;
  referenceType: 'POLICY' | 'PAYMENT' | 'CLAIM_RESERVE' | 'ENDORSEMENT' | 'REVERSAL';
  description: string;
  postedBy: string;
  status: 'Posted' | 'Reversed';
  reversedByJournalNumber?: string;
  reversesJournalNumber?: string;
  rebookedJournalNumber?: string;
  lines: LedgerEntryLine[];
}

export type ReconciliationMatchStatus = 'Matched' | 'Mismatched' | 'Unmatched';
export type InvestigationStatus = 'Verified' | 'Open Break' | 'Investigating' | 'Resolved via Adjustment';

export interface ReconciliationItem {
  id: string;
  reconciliationDate: string;
  stripeChargeId: string;
  policyNumber: string;
  customerName: string;
  stripeAmount: number;
  stripeFee: number;
  stripeNetAmount: number;
  ledgerGrossAmount: number;
  ledgerJournalNumber: string;
  differenceAmount: number;
  matchStatus: ReconciliationMatchStatus;
  investigationStatus: InvestigationStatus;
  notes: string;
  assignedTo: string;
}

export type ApprovalActionType =
  | 'Claim Payout Release'
  | 'Payment Refund'
  | 'Large Reserve Increase'
  | 'Policy Cancellation Return Premium'
  | 'Ledger Reversal & Rebook';

export type ApprovalStatus = 'Pending' | 'Approved' | 'Rejected';

export interface ApprovalRequest {
  id: string;
  referenceNumber: string;
  actionType: ApprovalActionType;
  targetEntityId: string;
  targetReference: string;
  customerName: string;
  amount: number;
  reason: string;
  initiatorEmail: string;
  initiatorName: string;
  initiatorRole: UserRole;
  createdAt: string;
  status: ApprovalStatus;
  decidedByEmail?: string;
  decidedByName?: string;
  decidedAt?: string;
  decisionNote?: string;
}

export type DocumentCategory = 'Policy Declaration' | 'Broker Statement' | 'Claim Document';

export interface PolicyDocument {
  id: string;
  title: string;
  documentCode: string;
  category: DocumentCategory;
  relatedReference: string;
  entityName: string;
  generatedAt: string;
  fileSize: string;
  version: string;
  summaryPoints: string[];
  coverageOrFinancialSummary: {
    label: string;
    value: string;
  }[];
}

export type NavigationTab =
  | 'dashboard'
  | 'policies'
  | 'brokers'
  | 'payments'
  | 'claims'
  | 'ledger'
  | 'reconciliation'
  | 'approvals'
  | 'documents';

export interface WebhookEventRecord {
  id: string;
  stripeEventId: string;
  eventType: string;
  paymentIntentId: string;
  status: 'PROCESSED' | 'DUPLICATE_IGNORED' | 'OUT_OF_ORDER_IGNORED';
  processedAt: string;
  recordedAt: string;
  summary: string;
}

export interface AuditLogRecord {
  id: string;
  actorEmail: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  metadataJson: string;
  recordedAt: string;
}

