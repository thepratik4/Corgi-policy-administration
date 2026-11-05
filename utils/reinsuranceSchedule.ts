import { Policy, Broker } from '../types/domain';
import { centsToDollars, dollarsToCents } from './financialRules';

export interface ReinsuranceTreaty {
  treatyName: string;
  treatyCode: string;
  treatyType: 'Quota Share' | 'Excess of Loss';
  reinsurerName: string;
  reinsurerRating: string;
  cessionRatePercent: number; // e.g. 25
  retentionRatePercent: number; // e.g. 75
  effectiveYear: number;
}

export const ACTIVE_COMMERCIAL_QUOTA_SHARE_TREATY: ReinsuranceTreaty = {
  treatyName: '2026 Commercial Lines Quota Share Treaty',
  treatyCode: 'TREATY-QS-2026-MRE',
  treatyType: 'Quota Share',
  reinsurerName: 'Munich Re America Corporation',
  reinsurerRating: 'A+ (Superior) · AM Best Financial Size XV',
  cessionRatePercent: 25,
  retentionRatePercent: 75,
  effectiveYear: 2026,
};

export interface PolicyReinsuranceCession {
  policyId: string;
  policyNumber: string;
  treaty: ReinsuranceTreaty;
  grossWrittenPremiumDollars: number;
  netRetainedPremiumDollars: number;
  cededPremiumDollars: number;
  grossAggregateLimitDollars: number;
  netRetainedLimitDollars: number;
  cededLimitDollars: number;
  grossOccurrenceLimitDollars: number;
  netRetainedOccurrenceLimitDollars: number;
  cededOccurrenceLimitDollars: number;
  cededPayableAccountCode: string;
  cededPayableAccountName: string;
  reinsuranceRecoverableAccountCode: string;
  reinsuranceRecoverableAccountName: string;
}

export function calculatePolicyReinsuranceCession(
  policy: Policy,
  treaty: ReinsuranceTreaty = ACTIVE_COMMERCIAL_QUOTA_SHARE_TREATY
): PolicyReinsuranceCession {
  const writtenPremiumCents = dollarsToCents(policy.writtenPremium);
  const cessionRate = treaty.cessionRatePercent / 100;

  const cededPremiumCents = Math.round(writtenPremiumCents * cessionRate);
  const netRetainedPremiumCents = writtenPremiumCents - cededPremiumCents;

  const aggLimitCents = dollarsToCents(policy.aggregateCoverageLimit);
  const cededAggLimitCents = Math.round(aggLimitCents * cessionRate);
  const netRetainedAggLimitCents = aggLimitCents - cededAggLimitCents;

  const occLimitCents = dollarsToCents(policy.perOccurrenceLimit);
  const cededOccLimitCents = Math.round(occLimitCents * cessionRate);
  const netRetainedOccLimitCents = occLimitCents - cededOccLimitCents;

  return {
    policyId: policy.id,
    policyNumber: policy.policyNumber,
    treaty,
    grossWrittenPremiumDollars: policy.writtenPremium,
    netRetainedPremiumDollars: centsToDollars(netRetainedPremiumCents),
    cededPremiumDollars: centsToDollars(cededPremiumCents),
    grossAggregateLimitDollars: policy.aggregateCoverageLimit,
    netRetainedLimitDollars: centsToDollars(netRetainedAggLimitCents),
    cededLimitDollars: centsToDollars(cededAggLimitCents),
    grossOccurrenceLimitDollars: policy.perOccurrenceLimit,
    netRetainedOccurrenceLimitDollars: centsToDollars(netRetainedOccLimitCents),
    cededOccurrenceLimitDollars: centsToDollars(cededOccLimitCents),
    cededPayableAccountCode: '2050',
    cededPayableAccountName: 'Ceded Reinsurance Premium Payable',
    reinsuranceRecoverableAccountCode: '1300',
    reinsuranceRecoverableAccountName: 'Reinsurance Recoverable on Paid Losses',
  };
}

export function escapeHtml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateReinsuranceCessionNoteHtml(
  policy: Policy,
  broker?: Broker | null,
  treaty: ReinsuranceTreaty = ACTIVE_COMMERCIAL_QUOTA_SHARE_TREATY
): string {
  const cession = calculatePolicyReinsuranceCession(policy, treaty);
  const issuedDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Reinsurance Cession Note — ${escapeHtml(policy.policyNumber)}</title>
  <style>
    @page { size: letter; margin: 0.75in; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.45; font-size: 13px; margin: 0; padding: 24px; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: #0f172a; text-transform: uppercase; }
    .subtitle { font-size: 11px; font-weight: 600; color: #ea580c; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .field-label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
    .field-value { font-size: 13px; font-weight: 600; color: #0f172a; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
    th { background: #0f172a; color: #ffffff; text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
    td { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; }
    .num { text-align: right; font-variant-numeric: tabular-nums; font-family: monospace; font-size: 12px; }
    .total-row { font-weight: 700; background: #f1f5f9; }
    .notice { background: #fff7ed; border-left: 4px solid #ea580c; padding: 12px; margin-top: 24px; font-size: 11px; color: #7c2d12; line-height: 1.5; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 40px; padding-top: 24px; border-top: 1px solid #cbd5e1; }
    .sig-line { border-bottom: 1px solid #0f172a; height: 32px; margin-bottom: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">Reinsurance Cession Note</div>
      <div class="subtitle">Commercial Lines Quota Share Facility · Schedule A</div>
      <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Treaty Ref: ${escapeHtml(treaty.treatyCode)} · As of ${escapeHtml(issuedDate)}</div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 14px; font-weight: 800; color: #0f172a;">CORGI INSURANCE SERVICES</div>
      <div style="font-size: 11px; color: #64748b;">Statutory Ceding Carrier</div>
      <div style="font-size: 10px; font-family: monospace; color: #64748b; margin-top: 4px;">NAIC Carrier Group: #94820</div>
    </div>
  </div>

  <div class="meta-box">
    <div class="grid">
      <div>
        <div class="field-label">Original Insured Legal Entity</div>
        <div class="field-value">${escapeHtml(policy.customerName)}</div>
        <div style="font-size: 11px; color: #64748b;">EIN: ${escapeHtml(policy.customerEin)} · ${escapeHtml(policy.customerIndustry)}</div>
      </div>
      <div>
        <div class="field-label">Primary Underlying Policy</div>
        <div class="field-value">${escapeHtml(policy.policyNumber)}</div>
        <div style="font-size: 11px; color: #64748b;">Term: ${escapeHtml(policy.effectiveDate)} to ${escapeHtml(policy.expirationDate)} (1 Year)</div>
      </div>
    </div>
  </div>

  <div style="margin-bottom: 8px;">
    <span style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #0f172a;">Treaty Participants & Risk Apportionment</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Participant Role</th>
        <th>Entity Name & Rating</th>
        <th class="num">Quota Share</th>
        <th class="num">Written Premium</th>
        <th class="num">Occurrence Limit</th>
        <th class="num">Aggregate Limit</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Direct / Ceding Carrier</strong></td>
        <td>Corgi Underwriting Syndicate (Retained Net)</td>
        <td class="num">${treaty.retentionRatePercent}.0%</td>
        <td class="num">$${cession.netRetainedPremiumDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td class="num">$${cession.netRetainedOccurrenceLimitDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td class="num">$${cession.netRetainedLimitDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr>
        <td><strong>Treaty Reinsurer</strong></td>
        <td>${escapeHtml(treaty.reinsurerName)} (${escapeHtml(treaty.reinsurerRating)})</td>
        <td class="num">${treaty.cessionRatePercent}.0%</td>
        <td class="num">$${cession.cededPremiumDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td class="num">$${cession.cededOccurrenceLimitDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td class="num">$${cession.cededLimitDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr class="total-row">
        <td colspan="2"><strong>Total Underlying Commercial Contract</strong></td>
        <td class="num">100.0%</td>
        <td class="num">$${policy.writtenPremium.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td class="num">$${policy.perOccurrenceLimit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td class="num">$${policy.aggregateCoverageLimit.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      </tr>
    </tbody>
  </table>

  <div style="margin-top: 20px; margin-bottom: 8px;">
    <span style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #0f172a;">Subledger Accounting Allocations</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>Ledger Account Code</th>
        <th>Account Title</th>
        <th>Category</th>
        <th class="num">Debits</th>
        <th class="num">Credits</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td style="font-family: monospace;">5030</td>
        <td>Ceded Reinsurance Premium Expense</td>
        <td>Expense (Debit)</td>
        <td class="num">$${cession.cededPremiumDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td class="num">$0.00</td>
      </tr>
      <tr>
        <td style="font-family: monospace;">2050</td>
        <td>Ceded Reinsurance Premium Payable — Munich Re</td>
        <td>Liability (Credit)</td>
        <td class="num">$0.00</td>
        <td class="num">$${cession.cededPremiumDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      </tr>
      <tr class="total-row">
        <td colspan="3"><strong>Total Subledger Double-Entry Impact</strong></td>
        <td class="num">$${cession.cededPremiumDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td class="num">$${cession.cededPremiumDollars.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
      </tr>
    </tbody>
  </table>

  <div class="notice">
    <strong>STATUTORY REINSURANCE BINDING NOTICE:</strong> This cession note confirms that liability coverage under Policy <strong>${escapeHtml(policy.policyNumber)}</strong> is ceded under the terms of Quota Share Treaty <strong>${escapeHtml(treaty.treatyCode)}</strong>. Ceded claims are subject to simultaneous cash recovery from the reinsurer under the "Follow the Fortunes" doctrine upon proof of loss settlement.
  </div>

  <div class="signatures">
    <div>
      <div class="sig-line"></div>
      <div style="font-size: 11px; font-weight: 700;">Authorised Officer — Corgi Insurance Services</div>
      <div style="font-size: 10px; color: #64748b;">Chief Underwriting & Reinsurance Officer</div>
    </div>
    <div>
      <div class="sig-line"></div>
      <div style="font-size: 11px; font-weight: 700;">Reinsurance Intermediary / Treaty Administrator</div>
      <div style="font-size: 10px; color: #64748b;">Munich Reinsurance America Treaty Facility</div>
    </div>
  </div>
</body>
</html>`;
}
