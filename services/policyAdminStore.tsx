'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  ApprovalRequest,
  AuditLogRecord,
  Broker,
  Claim,
  DemoUser,
  InvestigationStatus,
  KybStatus,
  LedgerTransaction,
  NavigationTab,
  Payment,
  Policy,
  PolicyDocument,
  ReconciliationItem,
  UserRole,
  WebhookEventRecord,
} from '../types/domain';
import {
  DEMO_USERS,
  INITIAL_APPROVAL_REQUESTS,
  INITIAL_BROKERS,
  INITIAL_CLAIMS,
  INITIAL_DOCUMENTS,
  INITIAL_LEDGER_TRANSACTIONS,
  INITIAL_PAYMENTS,
  INITIAL_POLICIES,
  INITIAL_RECONCILIATION_ITEMS,
} from '../mocks/seedData';
import {
  canUserDecideApproval,
  validateBrokerBindingEligibility,
  validateClaimAgainstCoverageLimit,
} from '../utils/financialRules';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant: 'success' | 'warning' | 'error' | 'info';
}

interface IssuePolicyPayload {
  customerName: string;
  customerIndustry: string;
  customerEin: string;
  customerAddress: string;
  brokerId: string;
  lineOfBusiness: Policy['lineOfBusiness'];
  writtenPremium: number;
  aggregateCoverageLimit: number;
  perOccurrenceLimit: number;
  deductible: number;
  effectiveDate: string;
  expirationDate: string;
}

interface EndorsePolicyPayload {
  policyId: string;
  effectiveDate: string;
  description: string;
  premiumDelta: number;
}

interface OpenClaimPayload {
  policyId: string;
  lossDate: string;
  description: string;
  claimedAmount: number;
  initialReserve: number;
}

interface AdjustReservePayload {
  claimId: string;
  newReserve: number;
  reason: string;
}

interface InitiateStripePaymentPayload {
  policyId: string;
  amount: number;
  paymentMethod: string;
}

interface DispatchWebhookPayload {
  paymentIntentId: string;
  eventType: 'payment_intent.succeeded' | 'payment_intent.payment_failed' | 'payment_intent.created' | 'charge.refunded';
  amountDollars: number;
  customEventId?: string;
}

interface PolicyAdminContextValue {
  currentUser: DemoUser | null;
  authToken: string | null;
  activeTab: NavigationTab;
  selectedPolicyId: string | null;
  selectedBrokerId: string | null;
  selectedClaimId: string | null;
  policies: Policy[];
  brokers: Broker[];
  payments: Payment[];
  claims: Claim[];
  ledgerTransactions: LedgerTransaction[];
  reconciliationItems: ReconciliationItem[];
  approvalRequests: ApprovalRequest[];
  documents: PolicyDocument[];
  webhookEvents: WebhookEventRecord[];
  auditLogs: AuditLogRecord[];
  toasts: ToastMessage[];
  // Auth & Navigation
  loginAsRole: (role: UserRole) => void;
  loginWithEmail: (email: string, roleFallback?: UserRole) => void;
  switchRole: (role: UserRole) => void;
  logout: () => void;
  navigateTo: (tab: NavigationTab, entityId?: string | null) => void;
  setSelectedPolicyId: (id: string | null) => void;
  setSelectedBrokerId: (id: string | null) => void;
  setSelectedClaimId: (id: string | null) => void;
  dismissToast: (id: string) => void;
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  // Domain Actions
  issueNewPolicy: (payload: IssuePolicyPayload) => { success: boolean; policy?: Policy; error?: string };
  bindDraftOrPendingPolicy: (policyId: string) => void;
  createEndorsement: (payload: EndorsePolicyPayload) => void;
  cancelPolicy: (policyId: string, reason: string) => void;
  updateBrokerKybStatus: (brokerId: string, status: KybStatus) => void;
  initiateStripePayment: (payload: InitiateStripePaymentPayload) => Promise<{
    success: boolean;
    payment?: Payment;
    error?: string;
  }>;
  dispatchSignedStripeWebhook: (payload: DispatchWebhookPayload) => Promise<{
    success: boolean;
    outcome?: string;
    reason?: string;
    error?: string;
  }>;
  refundPayment: (paymentId: string, reason: string) => void;
  openNewClaim: (payload: OpenClaimPayload) => { success: boolean; error?: string };
  adjustClaimReserve: (payload: AdjustReservePayload) => { success: boolean; error?: string };
  reverseAndRebookTransaction: (transactionId: string, correctedAmount: number, reason: string) => void;
  updateReconciliationInvestigation: (itemId: string, status: InvestigationStatus, note: string) => void;
  decideApprovalRequest: (requestId: string, decision: 'Approved' | 'Rejected', decisionNote: string) => {
    success: boolean;
    error?: string;
  };
}

const PolicyAdminContext = createContext<PolicyAdminContextValue | undefined>(undefined);

export function PolicyAdminProvider({
  children,
  initialAuthenticatedRole = null,
}: {
  children: React.ReactNode;
  initialAuthenticatedRole?: UserRole | null;
}) {
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(
    initialAuthenticatedRole ? DEMO_USERS[initialAuthenticatedRole] : null
  );
  const [authToken, setAuthToken] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [selectedBrokerId, setSelectedBrokerId] = useState<string | null>(null);
  const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);

  const [policies, setPolicies] = useState<Policy[]>(INITIAL_POLICIES);
  const [brokers, setBrokers] = useState<Broker[]>(INITIAL_BROKERS);
  const [payments, setPayments] = useState<Payment[]>(INITIAL_PAYMENTS);
  const [claims, setClaims] = useState<Claim[]>(INITIAL_CLAIMS);
  const [ledgerTransactions, setLedgerTransactions] = useState<LedgerTransaction[]>(
    INITIAL_LEDGER_TRANSACTIONS
  );
  const [reconciliationItems, setReconciliationItems] = useState<ReconciliationItem[]>(
    INITIAL_RECONCILIATION_ITEMS
  );
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>(
    INITIAL_APPROVAL_REQUESTS
  );
  const [documents, setDocuments] = useState<PolicyDocument[]>(INITIAL_DOCUMENTS);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEventRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const applyServerState = useCallback((serverState: Record<string, unknown> | undefined) => {
    if (!serverState) return;
    if (Array.isArray(serverState.policies)) setPolicies(serverState.policies as Policy[]);
    if (Array.isArray(serverState.brokers)) setBrokers(serverState.brokers as Broker[]);
    if (Array.isArray(serverState.payments)) setPayments(serverState.payments as Payment[]);
    if (Array.isArray(serverState.claims)) setClaims(serverState.claims as Claim[]);
    if (Array.isArray(serverState.ledgerTransactions)) {
      setLedgerTransactions(serverState.ledgerTransactions as LedgerTransaction[]);
    }
    if (Array.isArray(serverState.reconciliationItems)) {
      setReconciliationItems(serverState.reconciliationItems as ReconciliationItem[]);
    }
    if (Array.isArray(serverState.approvalRequests)) {
      setApprovalRequests(serverState.approvalRequests as ApprovalRequest[]);
    }
    if (Array.isArray(serverState.documents)) setDocuments(serverState.documents as PolicyDocument[]);
    if (Array.isArray(serverState.webhookEvents)) {
      setWebhookEvents(serverState.webhookEvents as WebhookEventRecord[]);
    }
    if (Array.isArray(serverState.auditLogs)) {
      setAuditLogs(serverState.auditLogs as AuditLogRecord[]);
    }
  }, []);

  const ensureAuthSession = useCallback(async (role: UserRole): Promise<string | null> => {
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          tokenRef.current = data.token;
          setAuthToken(data.token);
          return data.token as string;
        }
      }
    } catch {
      // Non-fatal in offline mode
    }
    return tokenRef.current;
  }, []);

  // Hydrate persisted backend state and initial JWT session on mount
  useEffect(() => {
    let active = true;
    async function hydrateFromBackend() {
      try {
        const stateRes = await fetch('/api/state');
        if (stateRes.ok && active) {
          const data = await stateRes.json();
          applyServerState(data.state);
        }
        if (initialAuthenticatedRole && active) {
          await ensureAuthSession(initialAuthenticatedRole);
        }
      } catch {
        // Keep seeded fallback if server fetch fails
      }
    }
    hydrateFromBackend();
    return () => {
      active = false;
    };
  }, [initialAuthenticatedRole, applyServerState, ensureAuthSession]);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `tst-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loginAsRole = useCallback(
    (role: UserRole) => {
      const user = DEMO_USERS[role];
      setCurrentUser(user);
      void ensureAuthSession(role);
      addToast({
        title: `Signed in as ${user.name}`,
        description: `Active session role: ${user.roleLabel} (Server JWT Verified)`,
        variant: 'info',
      });
    },
    [addToast, ensureAuthSession]
  );

  const loginWithEmail = useCallback(
    (email: string, roleFallback: UserRole = 'OPERATIONS_ADMIN') => {
      const normalized = email.trim().toLowerCase();
      if (normalized.includes('sarah') || normalized.includes('finance') || normalized.includes('approver')) {
        loginAsRole('FINANCE_APPROVER');
      } else if (normalized.includes('alex') || normalized.includes('ops')) {
        loginAsRole('OPERATIONS_ADMIN');
      } else {
        const customUser: DemoUser = {
          ...DEMO_USERS[roleFallback],
          email: email.trim(),
        };
        setCurrentUser(customUser);
        void ensureAuthSession(roleFallback);
        addToast({
          title: `Signed in as ${customUser.name}`,
          description: `JWT session initialized for ${customUser.email}`,
          variant: 'info',
        });
      }
    },
    [loginAsRole, addToast, ensureAuthSession]
  );

  const switchRole = useCallback(
    (role: UserRole) => {
      const user = DEMO_USERS[role];
      setCurrentUser(user);
      void ensureAuthSession(role);
      addToast({
        title: `Switched role to ${user.roleLabel}`,
        description: `Now acting as ${user.name} (${user.email})`,
        variant: 'info',
      });
    },
    [addToast, ensureAuthSession]
  );

  const logout = useCallback(() => {
    setCurrentUser(null);
    setAuthToken(null);
    tokenRef.current = null;
    setSelectedPolicyId(null);
    setSelectedBrokerId(null);
    setSelectedClaimId(null);
    setActiveTab('dashboard');
  }, []);

  const navigateTo = useCallback((tab: NavigationTab, entityId: string | null = null) => {
    setActiveTab(tab);
    if (tab === 'policies') {
      setSelectedPolicyId(entityId);
    } else if (tab === 'brokers') {
      setSelectedBrokerId(entityId);
    } else if (tab === 'claims') {
      setSelectedClaimId(entityId);
    }
  }, []);

  const issueNewPolicy = useCallback(
    (payload: IssuePolicyPayload) => {
      const broker = brokers.find((b) => b.id === payload.brokerId);
      const brokerCheck = validateBrokerBindingEligibility(broker);
      if (!brokerCheck.allowed || !broker) {
        addToast({
          title: 'Policy Issuance Blocked (KYB Compliance)',
          description: brokerCheck.errorMessage || 'Selected broker is not KYB-Approved.',
          variant: 'error',
        });
        return {
          success: false,
          error: brokerCheck.errorMessage || 'Selected broker is not KYB-Approved.',
        };
      }

      const seq = 1091 + policies.length;
      const policyNumber = `CRG-POL-2026-${seq}`;
      const policyId = `pol-2026-${seq}`;
      const taxesAndFees = Math.round(payload.writtenPremium * 100 * 0.035) / 100;
      const nowIso = new Date().toISOString();

      const optimisticPolicy: Policy = {
        id: policyId,
        policyNumber,
        customerName: payload.customerName,
        customerIndustry: payload.customerIndustry || 'Commercial Enterprise',
        customerEin: payload.customerEin || '81-4920184',
        customerAddress: payload.customerAddress || '500 Market Street, San Francisco, CA 94104',
        brokerId: broker.id,
        brokerName: broker.agencyName,
        lineOfBusiness: payload.lineOfBusiness,
        writtenPremium: payload.writtenPremium,
        earnedPremium: 0,
        unearnedPremium: payload.writtenPremium,
        collectedPremium: 0,
        taxesAndFees,
        effectiveDate: payload.effectiveDate,
        expirationDate: payload.expirationDate,
        status: 'Active',
        aggregateCoverageLimit: payload.aggregateCoverageLimit,
        perOccurrenceLimit: payload.perOccurrenceLimit,
        deductible: payload.deductible,
        underwriter: currentUser?.name || 'Alex Rivera',
        updatedAt: nowIso.slice(0, 10),
        coverages: [
          {
            id: `cov-${seq}-1`,
            name: `${payload.lineOfBusiness} Primary Insuring Agreement`,
            code: 'PRM-01',
            limit: payload.perOccurrenceLimit,
            deductible: payload.deductible,
            basePremium: payload.writtenPremium,
          },
        ],
        endorsements: [],
      };

      setPolicies((prev) => [optimisticPolicy, ...prev]);

      // Persist via authenticated backend API
      void (async () => {
        const token = tokenRef.current || (await ensureAuthSession(currentUser?.role || 'OPERATIONS_ADMIN'));
        const res = await fetch('/api/policies', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          applyServerState(data.state);
          addToast({
            title: `Policy ${data.policy.policyNumber} Issued & Persisted`,
            description: `Bound coverage for ${payload.customerName} and posted journal ${data.journalEntry.journalNumber}.`,
            variant: 'success',
          });
        }
      })();

      return { success: true, policy: optimisticPolicy };
    },
    [brokers, policies.length, currentUser, addToast, ensureAuthSession, applyServerState]
  );

  const bindDraftOrPendingPolicy = useCallback(
    (policyId: string) => {
      const target = policies.find((p) => p.id === policyId);
      if (!target) return;
      const broker = brokers.find((b) => b.id === target.brokerId);
      const brokerCheck = validateBrokerBindingEligibility(broker);
      if (!brokerCheck.allowed) {
        addToast({
          title: 'Binding Blocked — Broker Not KYB Approved',
          description: brokerCheck.errorMessage,
          variant: 'error',
        });
        return;
      }

      void (async () => {
        const token = tokenRef.current || (await ensureAuthSession(currentUser?.role || 'OPERATIONS_ADMIN'));
        const res = await fetch('/api/policies', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ action: 'BIND', policyId }),
        });
        if (res.ok) {
          const data = await res.json();
          applyServerState(data.state);
          addToast({
            title: `Policy ${target.policyNumber} Bound & Active`,
            description: `Posted initial receivable/unearned journal ${data.journalEntry?.journalNumber}.`,
            variant: 'success',
          });
        } else {
          const err = await res.json().catch(() => ({}));
          addToast({
            title: 'Policy Binding Failed',
            description: err.error || 'Could not bind policy.',
            variant: 'error',
          });
        }
      })();
    },
    [policies, brokers, currentUser, addToast, ensureAuthSession, applyServerState]
  );

  const createEndorsement = useCallback(
    (payload: EndorsePolicyPayload) => {
      const target = policies.find((p) => p.id === payload.policyId);
      if (!target) return;

      void (async () => {
        const token = tokenRef.current || (await ensureAuthSession(currentUser?.role || 'OPERATIONS_ADMIN'));
        const res = await fetch('/api/policies', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            action: 'ENDORSE',
            policyId: payload.policyId,
            effectiveDate: payload.effectiveDate,
            description: payload.description,
            premiumDelta: payload.premiumDelta,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          applyServerState(data.state);
          addToast({
            title: `Endorsement Applied on ${target.policyNumber}`,
            description: `Updated written premium and posted ledger adjustment.`,
            variant: 'success',
          });
        }
      })();
    },
    [policies, currentUser, addToast, ensureAuthSession, applyServerState]
  );

  const cancelPolicy = useCallback(
    (policyId: string, reason: string) => {
      const target = policies.find((p) => p.id === policyId);
      if (!target) return;

      void (async () => {
        const token = tokenRef.current || (await ensureAuthSession(currentUser?.role || 'OPERATIONS_ADMIN'));
        const res = await fetch('/api/policies', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ action: 'CANCEL', policyId, reason }),
        });
        if (res.ok) {
          const data = await res.json();
          applyServerState(data.state);
          addToast({
            title: `Policy ${target.policyNumber} Cancelled`,
            description: `Status updated to Cancelled and unearned return premium routed to Approval Queue.`,
            variant: 'warning',
          });
        }
      })();
    },
    [policies, currentUser, addToast, ensureAuthSession, applyServerState]
  );

  const updateBrokerKybStatus = useCallback(
    (brokerId: string, status: KybStatus) => {
      const target = brokers.find((b) => b.id === brokerId);
      if (!target) return;

      void (async () => {
        const token = tokenRef.current || (await ensureAuthSession(currentUser?.role || 'OPERATIONS_ADMIN'));
        const res = await fetch('/api/operations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ action: 'UPDATE_BROKER_KYB', brokerId, kybStatus: status }),
        });
        if (res.ok) {
          const data = await res.json();
          applyServerState(data.state);
          addToast({
            title: `Broker KYB Status Updated`,
            description: `${target.agencyName} KYB status set to ${status}.`,
            variant: status === 'Approved' ? 'success' : 'warning',
          });
        }
      })();
    },
    [brokers, currentUser, addToast, ensureAuthSession, applyServerState]
  );

  const initiateStripePayment = useCallback(
    async (payload: InitiateStripePaymentPayload) => {
      try {
        const token = tokenRef.current || (await ensureAuthSession(currentUser?.role || 'OPERATIONS_ADMIN'));
        const res = await fetch('/api/payments/create-intent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          addToast({
            title: 'PaymentIntent Creation Failed',
            description: data.error || 'Could not initiate Stripe PaymentIntent.',
            variant: 'error',
          });
          return { success: false, error: data.error };
        }

        applyServerState(data.state);
        addToast({
          title: `PaymentIntent ${data.payment.stripePaymentIntentId} Created (Pending)`,
          description: `Awaiting verified Stripe payment_intent.succeeded webhook before posting ledger cash.`,
          variant: 'info',
        });
        return { success: true, payment: data.payment as Payment };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Payment initiation error';
        return { success: false, error: msg };
      }
    },
    [currentUser, ensureAuthSession, applyServerState, addToast]
  );

  const dispatchSignedStripeWebhook = useCallback(
    async (payload: DispatchWebhookPayload) => {
      try {
        const eventId =
          payload.customEventId ||
          `evt_3QTest_${payload.paymentIntentId.slice(-8)}_${payload.eventType.replace(/\./g, '_')}`;
        const rawEventBody = JSON.stringify({
          id: eventId,
          type: payload.eventType,
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: payload.paymentIntentId,
              amount: Math.round(payload.amountDollars * 100),
              currency: 'usd',
            },
          },
        });

        const res = await fetch('/api/webhooks/stripe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-corgi-sign-test-webhook': '1',
          },
          body: rawEventBody,
        });

        const data = await res.json();
        if (!res.ok) {
          addToast({
            title: 'Webhook Verification Rejected',
            description: data.error || 'Invalid Stripe-Signature header.',
            variant: 'error',
          });
          return { success: false, error: data.error };
        }

        applyServerState(data.state);
        if (data.outcome === 'DUPLICATE_IGNORED') {
          addToast({
            title: `Idempotent Replay Blocked (${eventId})`,
            description: data.reason,
            variant: 'warning',
          });
        } else if (data.outcome === 'OUT_OF_ORDER_IGNORED') {
          addToast({
            title: `Out-of-Order Event Ignored (${payload.eventType})`,
            description: data.reason,
            variant: 'warning',
          });
        } else {
          const journals = (data.journalEntries || [])
            .map((j: LedgerTransaction) => j.journalNumber)
            .join(', ');
          addToast({
            title: `Verified Webhook ${payload.eventType} Processed`,
            description: journals
              ? `Payment settled and balanced double-entry journals posted: ${journals}`
              : data.reason,
            variant: 'success',
          });
        }

        return {
          success: true,
          outcome: data.outcome,
          reason: data.reason,
        };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Webhook dispatch failed',
        };
      }
    },
    [applyServerState, addToast]
  );

  const refundPayment = useCallback(
    (paymentId: string, reason: string) => {
      const target = payments.find((p) => p.id === paymentId);
      if (!target) return;

      void (async () => {
        const token = tokenRef.current || (await ensureAuthSession(currentUser?.role || 'OPERATIONS_ADMIN'));
        const res = await fetch('/api/payments/refund', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ paymentId, reason }),
        });
        if (res.ok) {
          const data = await res.json();
          applyServerState(data.state);
          const journalNum = data.journalEntries?.[0]?.journalNumber || 'Reversal JE';
          addToast({
            title: `Stripe Refund Processed (${data.stripeRefund?.refundId})`,
            description: `Refunded $${target.amount.toLocaleString()} for ${target.policyNumber} and posted ${journalNum}.`,
            variant: 'warning',
          });
        }
      })();
    },
    [payments, currentUser, addToast, ensureAuthSession, applyServerState]
  );

  const openNewClaim = useCallback(
    (payload: OpenClaimPayload) => {
      const policy = policies.find((p) => p.id === payload.policyId);
      if (!policy) {
        return { success: false, error: 'Selected policy not found.' };
      }

      const check = validateClaimAgainstCoverageLimit({
        claimedAmount: payload.claimedAmount,
        paidAmount: 0,
        outstandingReserve: payload.initialReserve,
        policyCoverageLimit: policy.aggregateCoverageLimit,
      });

      if (!check.valid) {
        return { success: false, error: check.errorMessage };
      }

      void (async () => {
        const token = tokenRef.current || (await ensureAuthSession(currentUser?.role || 'OPERATIONS_ADMIN'));
        const res = await fetch('/api/operations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            action: 'FILE_CLAIM',
            policyId: payload.policyId,
            lossDate: payload.lossDate,
            description: payload.description,
            claimedAmount: payload.claimedAmount,
            initialReserve: payload.initialReserve,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          applyServerState(data.state);
          addToast({
            title: `Claim ${data.claim.claimNumber} Opened`,
            description: `Case reserve of $${payload.initialReserve.toLocaleString()} booked under ${data.journalEntry.journalNumber}.`,
            variant: 'success',
          });
        }
      })();

      return { success: true };
    },
    [policies, currentUser, addToast, ensureAuthSession, applyServerState]
  );

  const adjustClaimReserve = useCallback(
    (payload: AdjustReservePayload) => {
      const claim = claims.find((c) => c.id === payload.claimId);
      if (!claim) return { success: false, error: 'Claim not found.' };

      const check = validateClaimAgainstCoverageLimit({
        claimedAmount: claim.claimedAmount,
        paidAmount: claim.paidAmount,
        outstandingReserve: payload.newReserve,
        policyCoverageLimit: claim.policyCoverageLimit,
      });

      if (!check.valid) {
        return { success: false, error: check.errorMessage };
      }

      const delta = payload.newReserve - claim.outstandingReserve;
      if (delta === 0) {
        return { success: false, error: 'New reserve must differ from current outstanding reserve.' };
      }

      void (async () => {
        const token = tokenRef.current || (await ensureAuthSession(currentUser?.role || 'OPERATIONS_ADMIN'));
        const res = await fetch('/api/operations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            action: 'ADJUST_CLAIM_RESERVE',
            claimId: payload.claimId,
            newReserve: payload.newReserve,
            reason: payload.reason,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          applyServerState(data.state);
          addToast({
            title: `Reserve Updated on ${claim.claimNumber}`,
            description: `Adjusted reserve to $${payload.newReserve.toLocaleString()} and posted ${data.journalEntry.journalNumber}.`,
            variant: 'success',
          });
        }
      })();

      return { success: true };
    },
    [claims, currentUser, addToast, ensureAuthSession, applyServerState]
  );

  const reverseAndRebookTransaction = useCallback(
    (transactionId: string, correctedAmount: number, reason: string) => {
      const orig = ledgerTransactions.find((t) => t.id === transactionId);
      if (!orig || orig.status === 'Reversed') return;

      void (async () => {
        const token = tokenRef.current || (await ensureAuthSession(currentUser?.role || 'FINANCE_APPROVER'));
        const rebookLines = orig.lines.map((l) => ({
          accountCode: l.accountCode,
          accountName: l.accountName,
          debit: l.debit > 0 ? correctedAmount : 0,
          credit: l.credit > 0 ? correctedAmount : 0,
          memo: `Rebooked entry replacing ${orig.journalNumber}`,
        }));

        const res = await fetch('/api/ledger', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            action: 'REVERSE_AND_REBOOK',
            journalIdOrNumber: orig.journalNumber,
            reason,
            rebookDescription: `Rebooked ${orig.journalNumber} at $${correctedAmount.toLocaleString()} — ${reason}`,
            rebookLines,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          applyServerState(data.state);
          addToast({
            title: `Reversed & Rebooked ${orig.journalNumber}`,
            description: `Posted contra-entry ${data.reversalEntry.journalNumber} and rebooked journal ${data.rebookedEntry?.journalNumber}.`,
            variant: 'success',
          });
        }
      })();
    },
    [ledgerTransactions, currentUser, addToast, ensureAuthSession, applyServerState]
  );

  const updateReconciliationInvestigation = useCallback(
    (itemId: string, status: InvestigationStatus, note: string) => {
      void (async () => {
        const token = tokenRef.current || (await ensureAuthSession(currentUser?.role || 'OPERATIONS_ADMIN'));
        const res = await fetch('/api/operations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            action: 'RESOLVE_RECONCILIATION_BREAK',
            itemId,
            status,
            notes: note,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          applyServerState(data.state);
          addToast({
            title: `Reconciliation Break Updated`,
            description: `Status changed to "${status}".`,
            variant: 'success',
          });
        }
      })();
    },
    [currentUser, addToast, ensureAuthSession, applyServerState]
  );

  const decideApprovalRequest = useCallback(
    (requestId: string, decision: 'Approved' | 'Rejected', decisionNote: string) => {
      if (!currentUser) {
        return { success: false, error: 'You must be signed in.' };
      }
      const req = approvalRequests.find((r) => r.id === requestId);
      if (!req) {
        return { success: false, error: 'Approval request not found.' };
      }

      const permission = canUserDecideApproval(currentUser, req);
      if (!permission.allowed) {
        return { success: false, error: permission.reason };
      }

      void (async () => {
        const token = tokenRef.current || (await ensureAuthSession(currentUser.role));
        const res = await fetch('/api/operations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            action: 'DECIDE_APPROVAL',
            requestId,
            decision,
            note: decisionNote || `${decision} by ${currentUser.name}`,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          applyServerState(data.state);
          addToast({
            title: `Request ${req.referenceNumber} ${decision}`,
            description: `${req.actionType} ($${req.amount.toLocaleString()}) ${decision.toLowerCase()} by ${currentUser.name}.`,
            variant: decision === 'Approved' ? 'success' : 'warning',
          });
        }
      })();

      return { success: true };
    },
    [currentUser, approvalRequests, addToast, ensureAuthSession, applyServerState]
  );

  return (
    <PolicyAdminContext.Provider
      value={{
        currentUser,
        authToken,
        activeTab,
        selectedPolicyId,
        selectedBrokerId,
        selectedClaimId,
        policies,
        brokers,
        payments,
        claims,
        ledgerTransactions,
        reconciliationItems,
        approvalRequests,
        documents,
        webhookEvents,
        auditLogs,
        toasts,
        loginAsRole,
        loginWithEmail,
        switchRole,
        logout,
        navigateTo,
        setSelectedPolicyId,
        setSelectedBrokerId,
        setSelectedClaimId,
        dismissToast,
        addToast,
        issueNewPolicy,
        bindDraftOrPendingPolicy,
        createEndorsement,
        cancelPolicy,
        updateBrokerKybStatus,
        initiateStripePayment,
        dispatchSignedStripeWebhook,
        refundPayment,
        openNewClaim,
        adjustClaimReserve,
        reverseAndRebookTransaction,
        updateReconciliationInvestigation,
        decideApprovalRequest,
      }}
    >
      {children}
    </PolicyAdminContext.Provider>
  );
}

export function usePolicyAdmin() {
  const ctx = useContext(PolicyAdminContext);
  if (!ctx) {
    throw new Error('usePolicyAdmin must be used inside PolicyAdminProvider');
  }
  return ctx;
}
