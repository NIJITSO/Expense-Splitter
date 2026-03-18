// Greedy algorithm to simplify debts
// netBalances is an object { [userId]: netAmount }
// Positive netAmount means the user is owed money
// Negative netAmount means the user owes money

const simplifyDebts = (netBalances) => {
  const debtors = [];
  const creditors = [];

  for (const [user, amount] of Object.entries(netBalances)) {
    if (amount > 0.01) creditors.push({ user, amount });
    else if (amount < -0.01) debtors.push({ user, amount: -amount });
  }

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let d = 0, c = 0;

  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d];
    const creditor = creditors[c];

    const settledAmount = Math.min(debtor.amount, creditor.amount);

    transactions.push({
      from: debtor.user,
      to: creditor.user,
      amount: parseFloat(settledAmount.toFixed(2))
    });

    debtor.amount -= settledAmount;
    creditor.amount -= settledAmount;

    if (debtor.amount < 0.01) d++;
    if (creditor.amount < 0.01) c++;
  }

  return transactions;
};

module.exports = { simplifyDebts };
