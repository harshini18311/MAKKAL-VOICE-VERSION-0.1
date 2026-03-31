const crypto = require('crypto');
const AuditLog = require('../models/AuditLog');

async function appendAuditLog({ complaintId, stageResults, finalScore, decision, entries = [] }) {
  const prevLog = await AuditLog.findOne().sort({ createdAt: -1 });
  const prevHash = prevLog ? prevLog.currentHash : '0';
  const dataToHash = JSON.stringify({ stageResults, complaintId, entries }) + prevHash;
  const currentHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

  await AuditLog.create({
    complaintId,
    entries,
    stageResults,
    finalScore,
    decision,
    previousHash: prevHash,
    currentHash
  });
}

module.exports = { appendAuditLog };
