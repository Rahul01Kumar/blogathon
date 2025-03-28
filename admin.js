// API URL
const API_URL = 'http://localhost:3002/api';

// Check authentication
function checkAuth() {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        window.location.href = 'admin-login.html';
        return;
    }
}

// Enhanced fetch function with error handling
async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('adminToken');
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };

    try {
        const response = await fetch(url, { ...options, headers });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Request failed');
        }
        
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Fetch and display registrations
async function fetchRegistrations() {
    try {
        const data = await fetchWithAuth(`${API_URL}/admin/registrations`);
        displayRegistrations(data);
        updateDashboardStats(data);
    } catch (error) {
        console.error('Error fetching registrations:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Failed to load registrations'
        });
    }
}

// Display registrations in the table
function displayRegistrations(registrations) {
    const tbody = document.getElementById('registrationsTable');
    tbody.innerHTML = '';

    registrations.forEach(registration => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${registration.name}</td>
            <td>${registration.email}</td>
            <td>${registration.mobile}</td>
            <td>${registration.participationType}</td>
            <td>
                <span class="status-badge ${registration.paymentStatus.status}">
                    ${registration.paymentStatus.status}
                </span>
            </td>
            <td>
                <button class="action-btn edit-btn" onclick="viewDetails('${registration._id}')">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="action-btn delete-btn" onclick="deleteRegistration('${registration._id}')">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// View registration details
async function viewDetails(registrationId) {
    try {
        const registration = await fetchWithAuth(`${API_URL}/admin/registration/${registrationId}`);
        
        let teamDetailsHtml = '';
        if (registration.teamDetails) {
            teamDetailsHtml = `
                <h4>Team Details</h4>
                <p><strong>Team Name:</strong> ${registration.teamDetails.teamName}</p>
                <h5>Team Members:</h5>
                <ul>
                    ${registration.teamDetails.members.map(member => `
                        <li>
                            <p><strong>Name:</strong> ${member.name}</p>
                            <p><strong>Mobile:</strong> ${member.mobile}</p>
                            <p><strong>Registration No:</strong> ${member.regNo}</p>
                            <p><strong>Gender:</strong> ${member.gender}</p>
                        </li>
                    `).join('')}
                </ul>
            `;
        }

        Swal.fire({
            title: 'Registration Details',
            html: `
                <div style="text-align: left; max-height: 60vh; overflow-y: auto;">
                    <p><strong>Name:</strong> ${registration.name}</p>
                    <p><strong>Email:</strong> ${registration.email}</p>
                    <p><strong>Mobile:</strong> ${registration.mobile}</p>
                    <p><strong>Gender:</strong> ${registration.gender}</p>
                    <p><strong>LPU Student:</strong> ${registration.isLpu ? 'Yes' : 'No'}</p>
                    <p><strong>Registration No:</strong> ${registration.regNo || 'N/A'}</p>
                    <p><strong>Participation Type:</strong> ${registration.participationType}</p>
                    <p><strong>Payment Status:</strong> ${registration.paymentStatus.status}</p>
                    <p><strong>Registered On:</strong> ${new Date(registration.registrationDate).toLocaleString()}</p>
                    ${registration.photoUrl ? `<p><strong>Photo:</strong> <a href="${registration.photoUrl}" target="_blank">View</a></p>` : ''}
                    ${teamDetailsHtml}
                </div>
            `,
            width: '700px',
            confirmButtonText: 'Close'
        });
    } catch (error) {
        console.error('Error viewing registration details:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Failed to load registration details'
        });
    }
}

// Delete registration
async function deleteRegistration(registrationId) {
    try {
        const result = await Swal.fire({
            title: 'Are you sure?',
            text: "This action cannot be undone!",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Yes, delete it!'
        });

        if (result.isConfirmed) {
            await fetchWithAuth(`${API_URL}/admin/registration/${registrationId}`, {
                method: 'DELETE'
            });

            Swal.fire(
                'Deleted!',
                'Registration has been deleted.',
                'success'
            );

            fetchRegistrations(); // Refresh the table
        }
    } catch (error) {
        console.error('Error deleting registration:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Failed to delete registration'
        });
    }
}

// Update dashboard statistics
function updateDashboardStats(registrations) {
    const totalRegistrations = registrations.length;
    const totalTeams = registrations.filter(r => r.participationType === 'team').length;
    const completedPayments = registrations.filter(r => r.paymentStatus.status === 'completed').length;
    const pendingPayments = registrations.filter(r => r.paymentStatus.status === 'pending').length;

    document.getElementById('totalRegistrations').textContent = totalRegistrations;
    document.getElementById('totalTeams').textContent = totalTeams;
    document.getElementById('completedPayments').textContent = completedPayments;
    document.getElementById('pendingPayments').textContent = pendingPayments;

    // Update recent activity
    const activityList = document.getElementById('activityList');
    const recentActivity = registrations
        .sort((a, b) => new Date(b.registrationDate) - new Date(a.registrationDate))
        .slice(0, 5)
        .map(reg => ({
            message: `${reg.name} registered for ${reg.participationType} participation`,
            timestamp: reg.registrationDate,
            icon: reg.participationType === 'team' ? 'users' : 'user'
        }));

    activityList.innerHTML = recentActivity.map(activity => `
        <div class="activity-item">
            <i class="fas fa-${activity.icon}"></i>
            <div>
                <p>${activity.message}</p>
                <small>${new Date(activity.timestamp).toLocaleString()}</small>
            </div>
        </div>
    `).join('');
}

// Search registrations
function searchRegistrations() {
    const searchInput = document.querySelector('.search-bar input').value.toLowerCase();
    const rows = document.querySelectorAll('#registrationsTable tr');

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchInput) ? '' : 'none';
    });
}

// Export data to CSV
function exportData() {
    const table = document.getElementById('registrationsTable');
    const rows = Array.from(table.querySelectorAll('tr'));
    
    const csv = rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        return cells.map(cell => `"${cell.textContent}"`).join(',');
    }).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'registrations.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    fetchRegistrations();
});