const baseUrl = 'http://localhost:5000/api';

async function request(endpoint, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${baseUrl}${endpoint}`, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed: ' + JSON.stringify(data));
  return data;
}

async function runTests() {
  try {
    console.log('1. Registering Users...');
    const userA = await request('/auth/register', 'POST', { name: 'Alice', email: `alice${Date.now()}@test.com`, password: 'password123' });
    const userB = await request('/auth/register', 'POST', { name: 'Bob', email: `bob${Date.now()}@test.com`, password: 'password123' });
    const userC = await request('/auth/register', 'POST', { name: 'Charlie', email: `charlie${Date.now()}@test.com`, password: 'password123' });
    console.log('Users registered successfully.');

    console.log('2. Creating Group...');
    const group = await request('/groups', 'POST', { name: 'Trip to Paris', description: 'Fun trip' }, userA.token);
    console.log(`Group created with ID: ${group._id}`);

    console.log('3. Adding Members to Group...');
    await request(`/groups/${group._id}/members`, 'POST', { email: userB.email }, userA.token);
    await request(`/groups/${group._id}/members`, 'POST', { email: userC.email }, userA.token);
    console.log('Members added.');

    console.log('4. Adding Expenses...');
    // Alice paid $90, split equally among A, B, C (each owes $30 to group).
    await request(`/groups/${group._id}/expenses`, 'POST', {
      description: 'Dinner',
      amount: 90,
      paidBy: userA._id
    }, userA.token);

    // Bob paid $30, split equally among A, B, C (each owes $10 to group).
    await request(`/groups/${group._id}/expenses`, 'POST', {
      description: 'Taxi',
      amount: 30,
      paidBy: userB._id
    }, userA.token);

    console.log('Expenses added.');

    console.log('5. Calculating Balances...');
    const balances = await request(`/groups/${group._id}/balances`, 'GET', null, userA.token);
    console.log('Balances Document:');
    console.log(JSON.stringify(balances, null, 2));

    console.log('All tests passed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Test Failed:', error.message);
    process.exit(1);
  }
}

runTests();
