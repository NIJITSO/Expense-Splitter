const API_URL = '/api';
let currentUser = JSON.parse(localStorage.getItem('user'));
let currentGroupId = null;

// Routing logic
function showView(viewId) {
  document.querySelectorAll('.view').forEach(el => {
    el.classList.remove('active');
    setTimeout(() => { if (!el.classList.contains('active')) el.style.display = 'none'; }, 300);
  });
  
  const target = document.getElementById(viewId);
  setTimeout(() => {
    target.style.display = viewId === 'auth-section' ? 'flex' : 'block';
    // Trigger reflow
    void target.offsetWidth;
    target.classList.add('active');
  }, 300);
}

window.onload = () => {
  if (currentUser) {
    document.getElementById('user-greeting').textContent = `Hi, ${currentUser.name}`;
    loadDashboard();
  } else {
    showView('auth-section');
  }
};

// --- AUTHENTICATION ---
let authMode = 'login';
function switchAuthTab(mode) {
  authMode = mode;
  document.getElementById('tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('tab-register').classList.toggle('active', mode === 'register');
  document.getElementById('auth-name').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('auth-name').required = mode === 'register';
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-form').reset();
}

async function handleAuth(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const name = document.getElementById('auth-name').value;
  
  const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
  const body = authMode === 'login' ? { email, password } : { name, email, password };
  
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.message);
    
    currentUser = data;
    localStorage.setItem('user', JSON.stringify(data));
    document.getElementById('user-greeting').textContent = `Hi, ${currentUser.name}`;
    loadDashboard();
  } catch (err) {
    document.getElementById('auth-error').textContent = err.message;
  }
}

function logout() {
  localStorage.removeItem('user');
  currentUser = null;
  document.getElementById('user-greeting').textContent = '';
  showView('auth-section');
}

// --- API HELPERS ---
async function apiFetch(endpoint, options = {}) {
  const headers = { 
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${currentUser.token}`
  };
  const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) logout();
    throw new Error(data.message);
  }
  return data;
}

// --- DASHBOARD (Groups) ---
async function loadDashboard() {
  showView('dashboard-section');
  const container = document.getElementById('groups-list');
  container.innerHTML = '<p class="text-muted">Loading groups...</p>';
  
  try {
    const groups = await apiFetch('/groups');
    if (groups.length === 0) {
      container.innerHTML = '<p class="text-muted">No groups yet. Create one to get started!</p>';
      return;
    }
    
    container.innerHTML = groups.map(g => `
      <div class="glass-card group-card" onclick="openGroup('${g._id}')">
        <h3>${g.name}</h3>
        <p>${g.description || ''}</p>
        <p class="mt-4"><small>${g.members.length} member(s)</small></p>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p class="error-msg">${err.message}</p>`;
  }
}

async function handleCreateGroup(e) {
  e.preventDefault();
  const name = document.getElementById('new-group-name').value;
  const description = document.getElementById('new-group-desc').value;
  
  try {
    await apiFetch('/groups', {
      method: 'POST',
      body: JSON.stringify({ name, description })
    });
    closeModal('create-group-modal');
    loadDashboard();
  } catch (err) {
    alert(err.message);
  }
}

// --- GROUP DETAILS ---
async function openGroup(id) {
  currentGroupId = id;
  showView('group-section');
  loadGroupDetails();
}

function showDashboard() {
  currentGroupId = null;
  loadDashboard();
}

async function loadGroupDetails() {
  try {
    const [group, expenses, balancesRes] = await Promise.all([
      apiFetch(`/groups/${currentGroupId}`),
      apiFetch(`/groups/${currentGroupId}/expenses`),
      apiFetch(`/groups/${currentGroupId}/balances`)
    ]);
    
    document.getElementById('group-title').textContent = group.name;
    document.getElementById('group-desc').textContent = group.description || '';
    
    document.getElementById('members-list').innerHTML = group.members.map(m => 
      `<span class="tag">${m.name}</span>`
    ).join('');
    
    const expensesHtml = expenses.length === 0 
      ? '<p class="text-muted">No expenses yet.</p>' 
      : expenses.map(e => `
        <div class="expense-item">
          <div class="expense-info">
            <span class="expense-desc">${e.description}</span>
            <span class="expense-meta">Paid by ${e.paidBy.name} on ${new Date(e.date).toLocaleDateString()}</span>
          </div>
          <div class="expense-amount">$${e.amount.toFixed(2)}</div>
        </div>
      `).join('');
    document.getElementById('expenses-list').innerHTML = expensesHtml;
    
    const debts = balancesRes.simplifiedDebts;
    const balancesHtml = debts.length === 0
      ? '<p class="text-muted" style="text-align:center">All settled up! 🎉</p>'
      : debts.map(d => {
          const isCurrentUser = d.fromId === currentUser._id;
          return `
            <div class="balance-item ${isCurrentUser ? 'owes' : ''}">
              <span style="flex:1"><strong>${d.fromName}</strong> owes <strong>${d.toName}</strong></span>
              <span class="amount">$${d.amount.toFixed(2)}</span>
            </div>
          `;
        }).join('');
    document.getElementById('balances-list').innerHTML = balancesHtml;
    
  } catch (err) {
    alert('Failed to load group details: ' + err.message);
  }
}

async function handleAddMember(e) {
  e.preventDefault();
  const email = document.getElementById('new-member-email').value;
  try {
    await apiFetch(`/groups/${currentGroupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    closeModal('add-member-modal');
    document.getElementById('new-member-email').value = '';
    loadGroupDetails();
  } catch (err) {
    alert(err.message);
  }
}

async function handleAddExpense(e) {
  e.preventDefault();
  const description = document.getElementById('new-expense-desc').value;
  const amount = parseFloat(document.getElementById('new-expense-amount').value);
  try {
    await apiFetch(`/groups/${currentGroupId}/expenses`, {
      method: 'POST',
      body: JSON.stringify({ description, amount, paidBy: currentUser._id })
    });
    closeModal('add-expense-modal');
    document.getElementById('new-expense-desc').value = '';
    document.getElementById('new-expense-amount').value = '';
    loadGroupDetails();
  } catch (err) {
    alert(err.message);
  }
}

// --- MODALS ---
function openModal(id) {
  const modal = document.getElementById(id);
  modal.style.display = 'flex';
  void modal.offsetWidth;
  modal.classList.add('active');
}
function closeModal(id) {
  const modal = document.getElementById(id);
  modal.classList.remove('active');
  setTimeout(() => modal.style.display = 'none', 300);
}
