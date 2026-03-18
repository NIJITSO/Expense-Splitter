const Expense = require('../models/Expense');
const Group = require('../models/Group');

const addExpense = async (req, res) => {
  try {
    const { description, amount, paidBy, splits } = req.body;
    const groupId = req.params.id;

    if (!description || !amount || !paidBy) {
      return res.status(400).json({ message: 'Description, amount, and paidBy are required' });
    }

    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    // Ensure the person who paid is a member of the group
    if (!group.members.some(member => member.equals(paidBy))) {
      return res.status(400).json({ message: 'Paying user is not a group member' });
    }

    let expenseSplits = splits;
    if (!splits || splits.length === 0) {
      // Auto-split equally
      const splitAmount = amount / group.members.length;
      expenseSplits = group.members.map(memberId => ({
        user: memberId,
        amount: splitAmount
      }));
    } else {
      // Validate splits sum up to the total amount
      const splitSum = expenseSplits.reduce((acc, split) => acc + split.amount, 0);
      // Small epsilon for floating point issues
      if (Math.abs(splitSum - amount) > 0.01) {
        return res.status(400).json({ message: 'Splits do not sum up to total amount' });
      }
    }

    const expense = await Expense.create({
      description,
      amount,
      group: groupId,
      paidBy,
      splits: expenseSplits
    });

    res.status(201).json(expense);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getExpenses = async (req, res) => {
  try {
    const groupId = req.params.id;
    const group = await Group.findById(groupId);
    
    if (!group) return res.status(404).json({ message: 'Group not found' });

    if (!group.members.some(member => member.equals(req.user._id))) {
      return res.status(403).json({ message: 'Not authorized to view expenses for this group' });
    }

    const expenses = await Expense.find({ group: groupId }).populate('paidBy', 'name').populate('splits.user', 'name');
    res.status(200).json(expenses);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { addExpense, getExpenses };
