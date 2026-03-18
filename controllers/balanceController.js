const Expense = require('../models/Expense');
const Group = require('../models/Group');
const { simplifyDebts } = require('../utils/splitUtils');

const getBalances = async (req, res) => {
  try {
    const groupId = req.params.id;
    const group = await Group.findById(groupId).populate('members', 'name');
    
    if (!group) return res.status(404).json({ message: 'Group not found' });

    if (!group.members.some(member => member.equals(req.user._id))) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const expenses = await Expense.find({ group: groupId });

    // Initialize net balances
    const netBalances = {};
    group.members.forEach(member => {
      netBalances[member._id.toString()] = 0;
    });

    expenses.forEach(expense => {
      // The person who paid getting credited
      const paidById = expense.paidBy.toString();
      netBalances[paidById] = (netBalances[paidById] || 0) + expense.amount;

      // The people involved in the split getting debited
      expense.splits.forEach(split => {
        const splitUserId = split.user.toString();
        netBalances[splitUserId] = (netBalances[splitUserId] || 0) - split.amount;
      });
    });

    const simplifiedTransactions = simplifyDebts(netBalances);

    // Map _id strings back to names for response readability
    const userMap = {};
    group.members.forEach(member => {
      userMap[member._id.toString()] = member.name;
    });

    const transactionsWithName = simplifiedTransactions.map(tx => ({
      fromId: tx.from,
      fromName: userMap[tx.from] || tx.from,
      toId: tx.to,
      toName: userMap[tx.to] || tx.to,
      amount: tx.amount
    }));

    res.status(200).json({
      netBalances,
      simplifiedDebts: transactionsWithName
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getBalances };
