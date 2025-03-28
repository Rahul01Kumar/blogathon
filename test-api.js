async function testAPI() {
    const endpoints = {
        registration: async () => {
            const testData = {
                name: 'Test User',
                email: 'test@example.com',
                mobile: '9876543210',
                // ... other fields
            };

            try {
                const response = await fetch('http://localhost:3000/api/register', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(testData)
                });
                return response.ok;
            } catch (error) {
                console.error('API Test Failed:', error);
                return false;
            }
        }
    };

    return endpoints;
}