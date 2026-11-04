import { Broker, Policy, PolicyDocument } from '../types/domain';
import { formatCurrency } from './formatters';
import { centsToDollars, dollarsToCents } from './financialRules';

/**
 * Reconstructs a policy's active limits, endorsements, and pro-rata earned premium
 * as it stood on any past calendar date (Domain Gauntlet #9: As-Of Reconstruction).
 */
export function reconstructPolicyAsOfDate(policy: Policy, asOfDate: string) {
  const targetTime = new Date(`${asOfDate}T23:59:59Z`).getTime();
  const inceptionTime = new Date(`${policy.effectiveDate}T00:00:00Z`).getTime();
  const expirationTime = new Date(`${policy.expirationDate}T00:00:00Z`).getTime();

  if (Number.isNaN(targetTime)) {
    throw new Error(`Invalid asOfDate "${asOfDate}".`);
  }

  // Active endorsements effective on or prior to the target date
  const activeEndorsements = policy.endorsements.filter((e) => {
    const eff = new Date(`${e.effectiveDate}T00:00:00Z`).getTime();
    return eff <= targetTime;
  });

  const netEndorsementDelta = activeEndorsements.reduce((sum, e) => sum + e.premiumDelta, 0);
  const adjustedWrittenPremium = policy.writtenPremium + netEndorsementDelta;

  const totalTermMs = Math.max(1, expirationTime - inceptionTime);
  const elapsedMs = Math.min(Math.max(0, targetTime - inceptionTime), totalTermMs);
  const wasIssued = inceptionTime <= targetTime;
  const isExpired = expirationTime < targetTime;

  // Base policy earned premium
  const baseEarnedFraction = wasIssued ? elapsedMs / totalTermMs : 0;
  const basePremiumCents = dollarsToCents(policy.writtenPremium);
  let earnedPremiumCents = Math.round(basePremiumCents * baseEarnedFraction);

  // Each endorsement's premium is earned strictly for elapsed coverage since its own effective date
  for (const end of activeEndorsements) {
    const endEffTime = new Date(`${end.effectiveDate}T00:00:00Z`).getTime();
    const endTermMs = Math.max(1, expirationTime - endEffTime);
    const endElapsedMs = Math.min(Math.max(0, targetTime - endEffTime), endTermMs);
    const endEarnedFraction = endElapsedMs / endTermMs;
    const endDeltaCents = dollarsToCents(end.premiumDelta);
    earnedPremiumCents += Math.round(endDeltaCents * endEarnedFraction);
  }

  const totalPremiumCents = dollarsToCents(adjustedWrittenPremium);
  const unearnedPremiumCents = Math.max(0, totalPremiumCents - earnedPremiumCents);

  // Determine policy status as of the requested historical date
  let statusAsOfDate = policy.status;
  if (!wasIssued) {
    statusAsOfDate = 'Pending';
  } else if (isExpired) {
    statusAsOfDate = 'Expired';
  } else if (policy.status === 'Cancelled' || policy.cancellationDate) {
    const cancelDate = policy.cancellationDate || policy.updatedAt.slice(0, 10);
    const cancelTime = new Date(`${cancelDate}T00:00:00Z`).getTime();
    if (!Number.isNaN(cancelTime) && targetTime < cancelTime) {
      statusAsOfDate = 'Active';
    } else {
      statusAsOfDate = 'Cancelled';
    }
  }

  return {
    asOfDate,
    statusAsOfDate,
    activeEndorsements,
    adjustedWrittenPremium,
    earnedPremium: centsToDollars(earnedPremiumCents),
    unearnedPremium: centsToDollars(unearnedPremiumCents),
    daysElapsed: Math.floor(elapsedMs / (1000 * 60 * 60 * 24)),
    totalTermDays: Math.floor(totalTermMs / (1000 * 60 * 60 * 24)),
  };
}

/**
 * Generates an authentic, high-fidelity Commercial Policy Declarations Page HTML
 * formatted for print and PDF export.
 */
export function generateDeclarationsPageHtml(
  policy: Policy,
  asOfDate: string,
  broker?: Broker | null
): string {
  const recon = reconstructPolicyAsOfDate(policy, asOfDate);
  const stateTax = Math.round(recon.adjustedWrittenPremium * 0.035 * 100) / 100;
  const stampingFee = 25.0;
  const totalInvoice = recon.adjustedWrittenPremium + stateTax + stampingFee;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Commercial Policy Declarations — ${policy.policyNumber} (As of ${asOfDate})</title>
  <style>
    @page { size: A4; margin: 18mm 15mm; }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    body { color: #0F172A; background: #fff; margin: 0; padding: 24px; font-size: 11px; line-height: 1.45; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #EA580C; padding-bottom: 12px; margin-bottom: 16px; }
    .brand { font-size: 18px; font-weight: 800; color: #EA580C; letter-spacing: -0.5px; }
    .doc-title { font-size: 15px; font-weight: 700; text-transform: uppercase; color: #0F172A; margin-top: 4px; }
    .meta-box { text-align: right; font-family: ui-monospace, monospace; font-size: 10px; }
    .badge { display: inline-block; padding: 2px 8px; font-weight: 700; font-size: 9px; text-transform: uppercase; border-radius: 4px; background: #FEF3C7; color: #92400E; margin-top: 4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .card { border: 1px solid #CBD5E1; border-radius: 6px; padding: 10px 12px; background: #F8FAFC; }
    .card-title { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748B; margin-bottom: 6px; letter-spacing: 0.5px; }
    .card-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
    .card-row .label { color: #475569; }
    .card-row .val { font-weight: 600; color: #0F172A; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10.5px; }
    th { background: #F1F5F9; border: 1px solid #CBD5E1; padding: 6px 10px; text-align: left; font-size: 9.5px; text-transform: uppercase; color: #475569; }
    td { border: 1px solid #CBD5E1; padding: 6px 10px; }
    td.mono { font-family: ui-monospace, monospace; }
    td.num { text-align: right; font-family: ui-monospace, monospace; }
    .total-row { background: #FFF7ED; font-weight: 700; }
    .total-row td { border-top: 2px solid #EA580C; color: #9A3412; }
    .notice { font-size: 9px; color: #64748B; border-top: 1px solid #E2E8F0; padding-top: 10px; margin-top: 20px; line-height: 1.4; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">CORGI COMMERCIAL INSURANCE SERVICES LLC</div>
      <div class="doc-title">Commercial Policy Declarations Page</div>
      <div style="font-size: 10px; color: #64748B;">San Francisco, CA · Fiduciary Commercial Lines Subledger</div>
    </div>
    <div class="meta-box">
      <div><strong>POLICY #:</strong> ${policy.policyNumber}</div>
      <div><strong>AS-OF RECONSTRUCTION:</strong> ${asOfDate}</div>
      <div><strong>TERM:</strong> ${policy.effectiveDate} to ${policy.expirationDate}</div>
      <div class="badge">HISTORICAL AUDIT COPY</div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Named Insured & Business Entity</div>
      <div class="card-row"><span class="label">Legal Name:</span><span class="val">${policy.customerName}</span></div>
      <div class="card-row"><span class="label">Industry / Class:</span><span class="val">${policy.customerIndustry}</span></div>
      <div class="card-row"><span class="label">Federal EIN:</span><span class="val mono">${policy.customerEin}</span></div>
      <div class="card-row"><span class="label">Mailing Address:</span><span class="val">${policy.customerAddress}</span></div>
    </div>
    <div class="card">
      <div class="card-title">Producer of Record & Status</div>
      <div class="card-row"><span class="label">Broker Agency:</span><span class="val">${broker ? broker.agencyName : 'Direct / Apex Insurance'}</span></div>
      <div class="card-row"><span class="label">Producer License:</span><span class="val mono">${broker ? broker.stateLicense : 'PROD-CA-9942'}</span></div>
      <div class="card-row"><span class="label">Line of Business:</span><span class="val">${policy.lineOfBusiness}</span></div>
      <div class="card-row"><span class="label">Policy Status (As Of):</span><span class="val" style="color: #EA580C;">${recon.statusAsOfDate}</span></div>
    </div>
  </div>

  <div style="font-weight: 700; font-size: 11px; margin-bottom: 6px; text-transform: uppercase; color: #334155;">Coverage & Limits Schedule</div>
  <table>
    <thead>
      <tr>
        <th>Coverage Schedule</th>
        <th>Applicable Limit / Basis</th>
        <th style="text-align: right;">Limit of Liability (USD)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>General Aggregate Limit</strong> (Other than Products-Completed Ops)</td>
        <td>Per Policy Annual Term</td>
        <td class="num font-bold">${formatCurrency(policy.aggregateCoverageLimit)}</td>
      </tr>
      <tr>
        <td><strong>Each Occurrence Limit</strong></td>
        <td>Per Loss Incident</td>
        <td class="num">${formatCurrency(policy.perOccurrenceLimit)}</td>
      </tr>
      <tr>
        <td><strong>Property Damage / Bodily Injury Deductible</strong></td>
        <td>Per Claim Retention</td>
        <td class="num">${formatCurrency(policy.deductible)}</td>
      </tr>
    </tbody>
  </table>

  <div style="font-weight: 700; font-size: 11px; margin-bottom: 6px; text-transform: uppercase; color: #334155;">Active Endorsements Schedule (Effective On or Before ${asOfDate})</div>
  <table>
    <thead>
      <tr>
        <th>Endorsement Code</th>
        <th>Effective Date</th>
        <th>Description / Scope Modification</th>
        <th style="text-align: right;">Premium Delta</th>
      </tr>
    </thead>
    <tbody>
      ${
        recon.activeEndorsements.length === 0
          ? '<tr><td colspan="4" style="text-align: center; color: #64748B; padding: 12px;">No mid-term endorsements effective as of this date. Original policy terms stand unmodified.</td></tr>'
          : recon.activeEndorsements
              .map(
                (e) => `<tr>
                  <td class="mono font-semibold">${e.id}</td>
                  <td class="mono">${e.effectiveDate}</td>
                  <td>${e.description}</td>
                  <td class="num" style="color: ${e.premiumDelta >= 0 ? '#0F172A' : '#DC2626'}">${e.premiumDelta >= 0 ? '+' : ''}${formatCurrency(e.premiumDelta)}</td>
                </tr>`
              )
              .join('')
      }
    </tbody>
  </table>

  <div style="font-weight: 700; font-size: 11px; margin-bottom: 6px; text-transform: uppercase; color: #334155;">Statutory Premium & Financial Tie-Out</div>
  <table>
    <thead>
      <tr>
        <th>Itemization Line</th>
        <th>Accounting Basis & Ledger Account</th>
        <th style="text-align: right;">Amount (USD)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Base Written Premium</td>
        <td class="mono">Account 2010 (Unearned Premium) / 4010 (Earned)</td>
        <td class="num">${formatCurrency(policy.writtenPremium)}</td>
      </tr>
      <tr>
        <td>Net Endorsement Adjustments</td>
        <td class="mono">Schedule Delta Active as of ${asOfDate}</td>
        <td class="num">${formatCurrency(recon.adjustedWrittenPremium - policy.writtenPremium)}</td>
      </tr>
      <tr>
        <td><strong>Adjusted Annual Written Premium</strong></td>
        <td class="mono">Subledger Binding Total</td>
        <td class="num font-bold">${formatCurrency(recon.adjustedWrittenPremium)}</td>
      </tr>
      <tr>
        <td>State Surplus Lines Premium Tax (3.5%)</td>
        <td class="mono">Account 2050 (State Tax Payable - Non-Premium Fiduciary)</td>
        <td class="num">${formatCurrency(stateTax)}</td>
      </tr>
      <tr>
        <td>Statutory Stamping Fee</td>
        <td class="mono">Account 2060 (Regulatory Stamping Fee - Flat Non-Refundable)</td>
        <td class="num">${formatCurrency(stampingFee)}</td>
      </tr>
      <tr class="total-row">
        <td>TOTAL STATUTORY BILLING</td>
        <td>Gross Policyholder Invoiced Charge</td>
        <td class="num font-bold">${formatCurrency(totalInvoice)}</td>
      </tr>
    </tbody>
  </table>

  <div class="card" style="margin-top: 12px; background: #EFF6FF; border-color: #BFDBFE;">
    <div class="card-title" style="color: #1E40AF;">Pro-Rata Daily Earning Position as of ${asOfDate}</div>
    <div class="grid" style="margin: 0; gap: 8px;">
      <div>
        <div class="card-row"><span class="label">Days Elapsed:</span><span class="val mono">${recon.daysElapsed} of ${recon.totalTermDays} days</span></div>
        <div class="card-row"><span class="label">Earned Premium (Revenue):</span><span class="val mono font-bold" style="color: #166534;">${formatCurrency(recon.earnedPremium)}</span></div>
      </div>
      <div>
        <div class="card-row"><span class="label">Earning Rate:</span><span class="val mono">${((recon.daysElapsed / recon.totalTermDays) * 100).toFixed(1)}%</span></div>
        <div class="card-row"><span class="label">Unearned Premium (Liability):</span><span class="val mono font-bold" style="color: #9A3412;">${formatCurrency(recon.unearnedPremium)}</span></div>
      </div>
    </div>
  </div>

  <div class="notice">
    <strong>STATUTORY FILING NOTICE:</strong> In accordance with state insurance statutory regulations and Corgi append-only ledger controls, this Declarations Page reflects policy terms, coverage conditions, and financial ledger balances as they legally existed on <strong>${asOfDate}</strong>. Subsequent mid-term endorsements or retroactive cancellations effective after this date are excluded from this schedule.
  </div>
</body>
</html>`;
}

/**
 * Triggers native browser print dialog with the rendered document in a clean window.
 * Allows instant direct printing or "Save as PDF".
 */
export function printHtmlDocument(title: string, htmlContent: string): void {
  if (typeof window === 'undefined') return;

  const printWindow = window.open('', '_blank', 'width=880,height=1000');
  if (!printWindow) {
    alert('Please allow popups to generate and print official policy documents.');
    return;
  }

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}

