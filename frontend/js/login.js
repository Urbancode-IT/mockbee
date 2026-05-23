/* ============================================
   MockBee - Log In & Reset Password Logic
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
    const forgotLink = document.querySelector('.forgot-link');
    const resetModal = document.getElementById('resetModal');
    const closeResetModal = document.getElementById('closeResetModal');
    const submitResetBtn = document.getElementById('submitResetBtn');
    const resetEmailInput = document.getElementById('resetEmailInput');
    const resetMessage = document.getElementById('resetMessage');

    // 1. Open Modal
    if (forgotLink) {
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            resetModal.classList.add('active');
            resetEmailInput.value = '';
            resetMessage.style.display = 'none';
        });
    }

    // 2. Close Modal
    if (closeResetModal) {
        closeResetModal.addEventListener('click', () => {
            resetModal.classList.remove('active');
        });
    }

    // Close on outside click
    window.addEventListener('click', (e) => {
        if (e.target === resetModal) {
            resetModal.classList.remove('active');
        }
    });

    // 3. Handle Reset Submission (Simulated)
    if (submitResetBtn) {
        submitResetBtn.addEventListener('click', () => {
            const email = resetEmailInput.value;

            if (!email || !email.includes('@')) {
                alert('Please enter a valid email address.');
                return;
            }

            // Simulate API call
            submitResetBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
            submitResetBtn.disabled = true;

            setTimeout(() => {
                submitResetBtn.innerHTML = 'Send Reset Link';
                submitResetBtn.disabled = false;

                resetMessage.innerHTML = `<i class="fas fa-check-circle"></i> A reset link has been sent to <strong>${email}</strong>. Please check your inbox.`;
                resetMessage.style.display = 'block';

                // Success feedback
                resetEmailInput.style.borderColor = 'green';
            }, 1500);
        });
    }

    // 4. Toggle Password Visibility
    const togglePassword = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('password');

    if (togglePassword && passwordInput) {
        togglePassword.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            // Toggle icon
            togglePassword.classList.toggle('fa-eye');
            togglePassword.classList.toggle('fa-eye-slash');
        });
    }

    // 5. Simulated Social OAuth Clicks
    const socialIcons = document.querySelectorAll('.social-icon');
    socialIcons.forEach(icon => {
        icon.addEventListener('click', (e) => {
            e.preventDefault();
            const titleAttr = icon.getAttribute('title') || '';
            const provider = titleAttr.replace('Sign in with ', '');
            
            if (!provider || provider === '') return;

            let oauthEmail = prompt(`Enter the email for your ${provider} account:`) || '';
            oauthEmail = oauthEmail.trim().toLowerCase();
            if (!oauthEmail || !oauthEmail.includes('@')) {
                alert('A valid email is required to continue.');
                return;
            }
            const defaultName = oauthEmail.split('@')[0] || `${provider} User`;
            const oauthName = prompt(`Enter your ${provider} account name:`, defaultName) || defaultName;

            // Try to login first
            fetch(`${API_BASE}/api/oauth-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, email: oauthEmail, name: oauthName })
            })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    // Login successful!
                    finalizeOAuth(data.name, data.email, data.role, data.is_student);
                } else {
                    // Login failed, try to register the mock account
                    alert(data.detail || `Failed to continue with ${provider}.`);
                }
            })
            .catch(err => {
                // Backend unreachable — simulate OAuth locally so user isn't blocked
                finalizeOAuth(oauthName, oauthEmail, 'PUBLIC', false);
            });
        });
    });

    function finalizeOAuth(name, email, role = 'PUBLIC', isStudent = false) {
        localStorage.setItem('mockbee_user_name', name);
        localStorage.setItem('mockbee_user_email', email);
        localStorage.setItem('mockbee_role', role || 'PUBLIC');
        localStorage.setItem('mockbee_is_student', isStudent ? 'true' : 'false');
        localStorage.removeItem('mockbee_admin_token');
        
        // Restore subscription status from account registry if available
        const accounts = JSON.parse(localStorage.getItem('mockbee_accounts') || '{}');
        const userAcc = accounts[email];

        if (isStudent) {
            localStorage.setItem('mockbee_subscribed', 'true');
            localStorage.setItem('mockbee_subscribed_plan', 'student_access');
        } else if (userAcc && userAcc.subscribed) {
            localStorage.setItem('mockbee_subscribed', 'true');
            localStorage.setItem('mockbee_subscribed_plan', userAcc.subscribedPlan || 'standard');
            if (userAcc.allPlans) localStorage.setItem('mockbee_all_plans', JSON.stringify(userAcc.allPlans));
            if (userAcc.startDate) localStorage.setItem('mockbee_sub_start_date', userAcc.startDate);
            if (userAcc.endDate) localStorage.setItem('mockbee_sub_end_date', userAcc.endDate);
            if (userAcc.billing) localStorage.setItem('mockbee_sub_billing', userAcc.billing);
        } else {
            localStorage.setItem('mockbee_subscribed', 'false');
            localStorage.removeItem('mockbee_subscribed_plan');
            localStorage.removeItem('mockbee_all_plans');
            localStorage.removeItem('mockbee_sub_start_date');
            localStorage.removeItem('mockbee_sub_end_date');
            localStorage.removeItem('mockbee_sub_billing');
        }

        localStorage.removeItem('mockbee_interviews');
        localStorage.removeItem('mockbee_activities');
        localStorage.removeItem('mockbee_badges');
        localStorage.removeItem('mockbee_notifications');
        localStorage.removeItem('mockbee_notif_unread');
        localStorage.removeItem('mockbee_subscription_expiry');

        window.location.href = 'dashboard.html';
    }

    // 6. Login Form Submission & Dashboard Redirect
    const loginForm = document.querySelector('.auth-form');
    const loginErrorMsg = document.getElementById('login-error-msg');

    // Helper: show inline error
    const showLoginError = (msg, passwordOnly = false) => {
        if (!loginErrorMsg) return;
        const span = loginErrorMsg.querySelector('span');
        if (span) span.textContent = msg;
        loginErrorMsg.style.display = 'flex';
        if (!passwordOnly) document.getElementById('email')?.classList.add('input-error');
        document.getElementById('password')?.classList.add('input-error');
    };

    const clearLoginError = () => {
        if (loginErrorMsg) loginErrorMsg.style.display = 'none';
        document.getElementById('email')?.classList.remove('input-error');
        document.getElementById('password')?.classList.remove('input-error');
    };

    // Clear error when user types
    document.getElementById('email')?.addEventListener('input', clearLoginError);
    document.getElementById('password')?.addEventListener('input', clearLoginError);

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            clearLoginError();

            const emailRaw = (document.getElementById('email')?.value || '').trim();
            const password = document.getElementById('password')?.value || '';

            if (!emailRaw || !password) {
                showLoginError('Please enter both your email and password.');
                return;
            }

            const searchEmail = emailRaw.toLowerCase();

            fetch(`${API_BASE}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: searchEmail, password: password })
            })
            .then(response => response.json().then(data => ({ status: response.status, body: data })))
            .then(res => {
                if (res.status === 400 || res.status === 409) {
                    showLoginError(res.body.detail || 'Login failed.');
                    return;
                } else if (res.status !== 200) {
                    showLoginError('Server error, try again later.');
                    return;
                }

                // ✅ Success - set session
                localStorage.setItem('mockbee_user_name', res.body.name || '');
                localStorage.setItem('mockbee_user_email', res.body.email);
                localStorage.setItem('mockbee_is_admin', res.body.is_admin ? 'true' : 'false');
                localStorage.setItem('mockbee_role', res.body.role || 'PUBLIC');
                localStorage.setItem('mockbee_is_student', res.body.is_student ? 'true' : 'false');
                if (res.body.admin_token) localStorage.setItem('mockbee_admin_token', res.body.admin_token);
                else localStorage.removeItem('mockbee_admin_token');
                
                // Admin redirect
                if (res.body.is_admin) {
                    localStorage.removeItem('mockbee_interviews');
                    localStorage.removeItem('mockbee_activities');
                    window.location.href = 'admin-dashboard.html';
                    return;
                }

                if (res.body.is_student || res.body.role === 'STUDENT') {
                    // Admin-created student: bypass subscription locks without marking as premium.
                    localStorage.setItem('mockbee_subscribed', 'true');
                    localStorage.setItem('mockbee_subscribed_plan', 'student_access');
                } else {
                    // Restore subscription status from account registry if available
                    const accounts = JSON.parse(localStorage.getItem('mockbee_accounts') || '{}');
                    const userAcc = accounts[res.body.email];

                    if (userAcc && userAcc.subscribed) {
                        localStorage.setItem('mockbee_subscribed', 'true');
                        localStorage.setItem('mockbee_subscribed_plan', userAcc.subscribedPlan || 'standard');
                        if (userAcc.allPlans) localStorage.setItem('mockbee_all_plans', JSON.stringify(userAcc.allPlans));
                        if (userAcc.startDate) localStorage.setItem('mockbee_sub_start_date', userAcc.startDate);
                        if (userAcc.endDate) localStorage.setItem('mockbee_sub_end_date', userAcc.endDate);
                        if (userAcc.billing) localStorage.setItem('mockbee_sub_billing', userAcc.billing);
                    } else {
                        localStorage.setItem('mockbee_subscribed', 'false');
                        localStorage.removeItem('mockbee_subscribed_plan');
                        localStorage.removeItem('mockbee_all_plans');
                        localStorage.removeItem('mockbee_sub_start_date');
                        localStorage.removeItem('mockbee_sub_end_date');
                        localStorage.removeItem('mockbee_sub_billing');
                    }
                }

                // Clear stale user data from previous browser sessions
                localStorage.removeItem('mockbee_interviews');
                localStorage.removeItem('mockbee_activities');
                localStorage.removeItem('mockbee_badges');
                localStorage.removeItem('mockbee_notifications');
                localStorage.removeItem('mockbee_notif_unread');
                localStorage.removeItem('mockbee_subscription_expiry');

                window.location.href = 'dashboard.html';
            })
            .catch(err => {
                console.error(err);
                // Fallback: try localStorage accounts when backend is unreachable
                const accounts = JSON.parse(localStorage.getItem('mockbee_accounts') || '{}');
                const localAcc = accounts[searchEmail];
                if (localAcc && localAcc.password === password) {
                    localStorage.setItem('mockbee_user_name', localAcc.name || searchEmail);
                    localStorage.setItem('mockbee_user_email', searchEmail);
                    localStorage.setItem('mockbee_subscribed', localAcc.subscribed ? 'true' : 'false');
                    if (localAcc.subscribedPlan) localStorage.setItem('mockbee_subscribed_plan', localAcc.subscribedPlan);
                    localStorage.removeItem('mockbee_interviews');
                    localStorage.removeItem('mockbee_activities');
                    window.location.href = 'dashboard.html';
                } else if (localAcc) {
                    showLoginError('Incorrect password.');
                } else {
                    showLoginError('Server is starting up. Please wait 30 seconds and try again.');
                }
            });
        });
    }
});
