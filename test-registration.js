// Create this test file to verify form functionality
function testRegistrationForm() {
    const tests = {
        basicInfo: () => {
            document.getElementById('name').value = 'Test User';
            validateAndNext('step1', 'step2');
        },
        contactInfo: () => {
            document.getElementById('mobile').value = '9876543210';
            document.getElementById('email').value = 'test@example.com';
            validateAndNext('step2', 'step3');
        },
        teamRegistration: () => {
            document.getElementById('team').checked = true;
            toggleTeamFields();
            document.getElementById('teamName').value = 'Test Team';
            // Fill team member details
            ['2', '3'].forEach(member => {
                document.getElementById(`member${member}Name`).value = `Member ${member}`;
                document.getElementById(`member${member}Mobile`).value = '9876543210';
                document.getElementById(`member${member}RegNo`).value = '12345';
                document.getElementById(`member${member}Male`).checked = true;
            });
        }
    };

    return tests;
}