const express = require('express');
const router = express.Router();
const { createGroup, getGroups, getGroupById, addMemberToGroup } = require('../controllers/groupController');
const { addExpense, getExpenses } = require('../controllers/expenseController');
const { getBalances } = require('../controllers/balanceController');
const { protect } = require('../middleware/authMiddleware');

router.route('/')
  .post(protect, createGroup)
  .get(protect, getGroups);

router.route('/:id')
  .get(protect, getGroupById);

router.route('/:id/members')
  .post(protect, addMemberToGroup);

router.route('/:id/expenses')
  .post(protect, addExpense)
  .get(protect, getExpenses);

router.route('/:id/balances')
  .get(protect, getBalances);

module.exports = router;
