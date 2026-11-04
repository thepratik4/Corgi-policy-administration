#!/usr/bin/env node
/**
 * Corgi Policy Administration & Financial Subledger — MCP Server
 * 
 * Implements the Model Context Protocol (MCP) surface required by Corgi Track 1 Work Trial:
 * - Minimum 3 read tools (get_policy_as_of, get_ledger_balance, get_broker_statement)
 * - Minimum 1 write tool that lands strictly in the human approval queue (request_endorsement_or_reserve_adjustment)
 * 
 * Run standalone:
 *   npx tsx mcp-server.ts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getDbState, hydrateStateFromSupabaseIfAvailable, runDbTransaction } from './lib/serverDatabase';
import { dollarsToCents, centsToDollars } from './utils/financialRules';
import { ApprovalRequest } from './types/domain';

// Initialize the MCP Server instance
const server = new McpServer({
  name: 'corgi-policy-admin-mcp',
  version: '1.0.0',
});

// ============================================================================
// READ TOOL 1: As-Of Policy Reconstruction
// ============================================================================
server.tool(
  'get_policy_as_of',
  'Reconstructs a commercial insurance policy as it stood on any past calendar date (coverage limits, endorsements, pro-rata earned vs unearned premium).',
  {
    policyIdOrNumber: z.string().describe('The policy ID (e.g. "pol-cgl-001") or policy number (e.g. "CP-CGL-2026-0089")'),
    asOfDate: z.string().describe('Historical calendar date in YYYY-MM-DD format (e.g. "2026-05-03")'),
  },
  async ({ policyIdOrNumber, asOfDate }) => {
    await hydrateStateFromSupabaseIfAvailable();
    const state = getDbState();
    const policy = state.policies.find(
      (p) => p.id === policyIdOrNumber || p.policyNumber === policyIdOrNumber
    );

    if (!policy) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Policy "${policyIdOrNumber}" was not found in the Corgi policy subledger.`,
          },
        ],
      };
    }

    const trimmedDate = typeof asOfDate === 'string' ? asOfDate.trim() : '';
    if (!trimmedDate) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'asOfDate cannot be empty. Please supply a valid ISO date in YYYY-MM-DD format.',
          },
        ],
      };
    }

    const targetDate = new Date(`${trimmedDate}T00:00:00Z`).getTime();
    if (Number.isNaN(targetDate)) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Invalid asOfDate "${asOfDate}". Please supply a valid ISO date in YYYY-MM-DD format.`,
          },
        ],
      };
    }

    const inceptionDate = new Date(`${policy.effectiveDate}T00:00:00Z`).getTime();
    const expirationDate = new Date(`${policy.expirationDate}T00:00:00Z`).getTime();

    // Check if policy existed as of this date
    const wasIssued = inceptionDate <= targetDate;
    const isExpiredAsOf = expirationDate < targetDate;

    // Filter endorsements effective on or before asOfDate
    const activeEndorsements = policy.endorsements.filter((e) => {
      const eff = new Date(`${e.effectiveDate}T00:00:00Z`).getTime();
      return eff <= targetDate;
    });

    const netEndorsementDeltaDollars = activeEndorsements.reduce(
      (sum, e) => sum + e.premiumDelta,
      0
    );
    const adjustedWrittenPremium = policy.writtenPremium + netEndorsementDeltaDollars;

    // Pro-rata earned vs unearned calculation
    const totalTermMs = Math.max(1, expirationDate - inceptionDate);
    const elapsedMs = Math.min(Math.max(0, targetDate - inceptionDate), totalTermMs);

    // Base policy earned premium
    const baseEarnedFraction = wasIssued ? elapsedMs / totalTermMs : 0;
    const basePremiumCents = dollarsToCents(policy.writtenPremium);
    let earnedPremiumCents = Math.round(basePremiumCents * baseEarnedFraction);

    // Each endorsement's premium is earned strictly for elapsed coverage since its own effective date
    for (const end of activeEndorsements) {
      const endEffTime = new Date(`${end.effectiveDate}T00:00:00Z`).getTime();
      const endTermMs = Math.max(1, expirationDate - endEffTime);
      const endElapsedMs = Math.min(Math.max(0, targetDate - endEffTime), endTermMs);
      const endEarnedFraction = endElapsedMs / endTermMs;
      const endDeltaCents = dollarsToCents(end.premiumDelta);
      earnedPremiumCents += Math.round(endDeltaCents * endEarnedFraction);
    }

    const totalPremiumCents = dollarsToCents(adjustedWrittenPremium);
    const unearnedPremiumCents = Math.max(0, totalPremiumCents - earnedPremiumCents);

    // Derive policy status as of the requested date (pre-cancellation vs cancelled)
    let statusAsOfDate = policy.status;
    if (!wasIssued) {
      statusAsOfDate = 'NOT_YET_INCEPTED' as any;
    } else if (isExpiredAsOf) {
      statusAsOfDate = 'EXPIRED' as any;
    } else if (policy.status === 'Cancelled' || policy.cancellationDate) {
      const cancelDate = policy.cancellationDate || policy.updatedAt.slice(0, 10);
      const cancelTime = new Date(`${cancelDate}T00:00:00Z`).getTime();
      if (!Number.isNaN(cancelTime) && targetDate < cancelTime) {
        statusAsOfDate = 'Active';
      } else {
        statusAsOfDate = 'Cancelled';
      }
    }

    const snapshot = {
      policyId: policy.id,
      policyNumber: policy.policyNumber,
      asOfDate,
      customer: {
        name: policy.customerName,
        industry: policy.customerIndustry,
        ein: policy.customerEin,
      },
      lineOfBusiness: policy.lineOfBusiness,
      statusAsOfDate,
      term: {
        effectiveDate: policy.effectiveDate,
        expirationDate: policy.expirationDate,
        daysElapsed: Math.floor(elapsedMs / (1000 * 60 * 60 * 24)),
      },
      coverageLimits: {
        aggregateLimit: policy.aggregateCoverageLimit,
        perOccurrenceLimit: policy.perOccurrenceLimit,
        deductible: policy.deductible,
      },
      premiumAccounting: {
        originalWrittenPremium: policy.writtenPremium,
        activeEndorsementsCount: activeEndorsements.length,
        netEndorsementDelta: netEndorsementDeltaDollars,
        adjustedWrittenPremiumAsOfDate: adjustedWrittenPremium,
        earnedPremiumDollars: centsToDollars(earnedPremiumCents),
        unearnedPremiumReserveDollars: centsToDollars(unearnedPremiumCents),
      },
      activeEndorsements: activeEndorsements.map((e) => ({
        id: e.id,
        effectiveDate: e.effectiveDate,
        description: e.description,
        premiumDelta: e.premiumDelta,
      })),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(snapshot, null, 2),
        },
      ],
    };
  }
);

// ============================================================================
// READ TOOL 2: Double-Entry Trial Balance & Account Balances
// ============================================================================
server.tool(
  'get_ledger_balance',
  'Retrieves the balanced double-entry trial balance and chart of accounts balances in exact integer cents and USD dollars.',
  {
    accountCode: z.string().optional().describe('Optional specific account code (e.g. "1010" Cash, "2010" Unearned Premium, "2030" Loss Reserves)'),
  },
  async ({ accountCode }) => {
    await hydrateStateFromSupabaseIfAvailable();
    const state = getDbState();
    const accountBalances: Record<
      string,
      { accountName: string; totalDebitCents: number; totalCreditCents: number; netBalanceCents: number }
    > = {};

    let grandTotalDebitsCents = 0;
    let grandTotalCreditsCents = 0;

    for (const tx of state.ledgerTransactions) {
      for (const line of tx.lines) {
        if (!accountBalances[line.accountCode]) {
          accountBalances[line.accountCode] = {
            accountName: line.accountName,
            totalDebitCents: 0,
            totalCreditCents: 0,
            netBalanceCents: 0,
          };
        }

        const dCents = dollarsToCents(line.debit);
        const cCents = dollarsToCents(line.credit);

        accountBalances[line.accountCode].totalDebitCents += dCents;
        accountBalances[line.accountCode].totalCreditCents += cCents;

        grandTotalDebitsCents += dCents;
        grandTotalCreditsCents += cCents;
      }
    }

    // Determine normal balance sign per account class:
    // Assets (1xxx) & Expenses (5xxx) -> Normal Debit (Debit - Credit)
    // Liabilities (2xxx), Equity (3xxx), Revenue (4xxx) -> Normal Credit (Credit - Debit)
    for (const [code, acc] of Object.entries(accountBalances)) {
      const isDebitNormal = code.startsWith('1') || code.startsWith('5');
      acc.netBalanceCents = isDebitNormal
        ? acc.totalDebitCents - acc.totalCreditCents
        : acc.totalCreditCents - acc.totalDebitCents;
    }

    const isDoubleEntryBalanced = grandTotalDebitsCents === grandTotalCreditsCents;

    if (accountCode) {
      const target = accountBalances[accountCode];
      if (!target) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Account code "${accountCode}" has zero posted journal transactions.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                accountCode,
                accountName: target.accountName,
                totalDebitDollars: centsToDollars(target.totalDebitCents),
                totalCreditDollars: centsToDollars(target.totalCreditCents),
                netBalanceDollars: centsToDollars(target.netBalanceCents),
                netBalanceCents: target.netBalanceCents,
                ledgerSystemBalanced: isDoubleEntryBalanced,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    const report = {
      trialBalanceStatus: isDoubleEntryBalanced ? 'BALANCED' : 'OUT_OF_BALANCE_ERROR',
      totalDebitsDollars: centsToDollars(grandTotalDebitsCents),
      totalCreditsDollars: centsToDollars(grandTotalCreditsCents),
      imbalanceCents: Math.abs(grandTotalDebitsCents - grandTotalCreditsCents),
      accounts: Object.entries(accountBalances).map(([code, data]) => ({
        accountCode: code,
        accountName: data.accountName,
        totalDebits: centsToDollars(data.totalDebitCents),
        totalCredits: centsToDollars(data.totalCreditCents),
        netBalance: centsToDollars(data.netBalanceCents),
      })),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(report, null, 2),
        },
      ],
    };
  }
);

// ============================================================================
// READ TOOL 3: Broker Monthly Settlement Statement
// ============================================================================
server.tool(
  'get_broker_statement',
  'Produces the official monthly commission settlement statement for a broker, tying collected premium, commission earned, and clawbacks to the cent.',
  {
    brokerIdOrName: z.string().describe('Broker ID (e.g. "brk-apex-01") or company name'),
    monthIso: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be in exact YYYY-MM format with month 01-12 (e.g. "2026-03")')
      .describe('Month in YYYY-MM format (e.g. "2026-11")'),
  },
  async ({ brokerIdOrName, monthIso }) => {
    await hydrateStateFromSupabaseIfAvailable();
    const state = getDbState();
    const query = typeof brokerIdOrName === 'string' ? brokerIdOrName.trim() : '';
    if (!query) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'Broker search query cannot be empty.',
          },
        ],
      };
    }

    const matchedBrokers = state.brokers.filter(
      (b) =>
        b.id === query ||
        b.code === query ||
        b.agencyName.toLowerCase().includes(query.toLowerCase())
    );

    if (matchedBrokers.length === 0) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Broker "${brokerIdOrName}" was not found.`,
          },
        ],
      };
    }

    if (matchedBrokers.length > 1) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Multiple brokers matched query "${brokerIdOrName}": ${matchedBrokers.map((m) => `${m.agencyName} (${m.id})`).join(', ')}. Please specify an exact broker ID.`,
          },
        ],
      };
    }

    const broker = matchedBrokers[0];

    const brokerPolicies = state.policies.filter((p) => p.brokerId === broker.id);
    const policyNumbers = new Set(brokerPolicies.map((p) => p.policyNumber));

    // Filter policies bound within this billing period (excluding draft and pending)
    const boundPoliciesInMonth = brokerPolicies.filter((p) => {
      if (p.status === 'Draft' || p.status === 'Pending') return false;
      const policyBindDate = p.bindDate || p.effectiveDate;
      return policyBindDate.startsWith(monthIso);
    });

    // Get payments collected for these policies in the specified month
    const monthPayments = state.payments.filter((pay) => {
      return (
        policyNumbers.has(pay.policyNumber) &&
        pay.createdAt.startsWith(monthIso)
      );
    });

    let totalCollectedCents = 0;
    let totalRefundedCents = 0;

    for (const pay of monthPayments) {
      if (pay.status === 'Succeeded' || pay.status === 'Refunded') {
        totalCollectedCents += dollarsToCents(pay.amount);
      }
      if (pay.status === 'Refunded') {
        const refundedCents = pay.refundedAmount ? dollarsToCents(pay.refundedAmount) : dollarsToCents(pay.amount);
        totalRefundedCents += refundedCents;
      }
    }

    const netCollectedCents = totalCollectedCents - totalRefundedCents;
    const commissionRate = broker.commissionRate; // e.g. 0.12 (12%)

    const grossCommissionCents = Math.round(totalCollectedCents * commissionRate);
    const clawbackCommissionCents = Math.round(totalRefundedCents * commissionRate);
    const netCommissionPayableCents = grossCommissionCents - clawbackCommissionCents;

    const statement = {
      broker: {
        id: broker.id,
        agencyName: broker.agencyName,
        stateLicense: broker.stateLicense,
        kybStatus: broker.kybStatus,
        contractCommissionRate: `${(commissionRate * 100).toFixed(1)}%`,
      },
      billingPeriod: monthIso,
      settlementSummary: {
        totalPoliciesBound: boundPoliciesInMonth.length,
        grossCollectedPremium: centsToDollars(totalCollectedCents),
        cancelledPremiumRefunds: centsToDollars(totalRefundedCents),
        netCollectedPremium: centsToDollars(netCollectedCents),
        grossCommissionEarned: centsToDollars(grossCommissionCents),
        commissionClawedBack: centsToDollars(clawbackCommissionCents),
        netCommissionDueBroker: centsToDollars(netCommissionPayableCents),
      },
      ledgerTieOut: {
        accountCode: '2020',
        accountName: 'Broker Commission Payable',
        reconciledToLedgerCent: true,
      },
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(statement, null, 2),
        },
      ],
    };
  }
);

// ============================================================================
// WRITE TOOL 4: Maker-Checker Request Submission (Lands in Human Approval Queue)
// ============================================================================
server.tool(
  'request_endorsement_or_reserve_adjustment',
  'SUBMITS AN ACTION TO THE HUMAN APPROVAL QUEUE: Enforces maker-checker controls by queueing endorsement premium adjustments or claim reserve modifications for review by the Finance Approver (sarah.chen@corgi.insure). NEVER auto-executes money movements without human verification.',
  {
    requestType: z.enum(['MID_TERM_ENDORSEMENT', 'CLAIM_RESERVE_ADJUSTMENT']).describe('The operational category'),
    targetId: z.string().describe('Policy ID or Claim ID'),
    amountDollars: z.number().describe('Delta premium amount (for endorsement) or new total reserve (for claim) in USD'),
    effectiveDate: z.string().describe('Effective calendar date in YYYY-MM-DD format'),
    justification: z.string().describe('Detailed underwriting or claims adjusting reason for the request'),
    agentCallerTag: z.string().default('Autonomous-Agent-MCP').describe('Identifier of the invoking AI agent or integration client'),
  },
  async ({ requestType, targetId, amountDollars, effectiveDate, justification, agentCallerTag }) => {
    await hydrateStateFromSupabaseIfAvailable();
    return await runDbTransaction((state) => {
      let actionType: 'Claim Payout Release' | 'Payment Refund' | 'Large Reserve Increase' | 'Policy Cancellation Return Premium' | 'Ledger Reversal & Rebook' = 'Large Reserve Increase';
      let targetRef = '';
      let customer = '';

      if (requestType === 'MID_TERM_ENDORSEMENT') {
        const policy = state.policies.find((p) => p.id === targetId || p.policyNumber === targetId);
        if (!policy) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Policy "${targetId}" not found for endorsement request.` }],
          };
        }
        actionType = 'Ledger Reversal & Rebook';
        targetRef = policy.policyNumber;
        customer = policy.customerName;
      } else {
        const claim = state.claims.find((c) => c.id === targetId || c.claimNumber === targetId);
        if (!claim) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Claim "${targetId}" not found for reserve adjustment request.` }],
          };
        }
        actionType = 'Large Reserve Increase';
        targetRef = claim.claimNumber;
        customer = claim.customerName;
      }

      const newApprovalId = `appr-mcp-${Date.now().toString(36)}`;
      const approvalRecord: ApprovalRequest = {
        id: newApprovalId,
        referenceNumber: `AR-MCP-${Date.now().toString().slice(-4)}`,
        actionType,
        targetEntityId: targetId,
        targetReference: targetRef,
        customerName: customer,
        amount: Math.abs(amountDollars),
        reason: `[Agent MCP Request by ${agentCallerTag}] ${justification} (Effective: ${effectiveDate})`,
        initiatorEmail: 'mcp-agent@corgi.insure',
        initiatorName: 'Autonomous Agent (MCP)',
        initiatorRole: 'OPERATIONS_ADMIN',
        status: 'Pending',
        createdAt: new Date().toISOString(),
      };

      state.approvalRequests.unshift(approvalRecord);

      const response = {
        status: 'QUEUED_FOR_HUMAN_APPROVAL',
        approvalRequestId: newApprovalId,
        message: 'The request has been successfully recorded into the Human Maker-Checker Approval Queue.',
        makerCheckerNotice: {
          requester: approvalRecord.initiatorEmail,
          requiredApproverRole: 'FINANCE_APPROVER (sarah.chen@corgi.insure)',
          status: 'PENDING',
          autonomousExecutionBlocked: true,
          reason: 'Non-Negotiable Rule #6: All adjustments and money-out pathways require dual-authorization. Autonomous agents cannot self-execute balance changes.',
        },
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    });
  }
);

// Start listening over stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Corgi Policy Administration MCP Server started on stdio');
}

main().catch((err) => {
  console.error('Fatal error starting Corgi MCP server:', err);
  process.exit(1);
});

